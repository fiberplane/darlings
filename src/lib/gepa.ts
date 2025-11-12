import type { Candidate, GEPAConfig, ProgressEvent } from "../types";
import type { Archive } from "./archive";
import { addToArchive, createArchive, getArchiveSize } from "./archive";
import { createEvaluationLimiter } from "./concurrency";
import { evaluateCandidate } from "./evaluator";
import { mutateViaReflection } from "./mutator";
import {
	createPerTaskPareto,
	selectParentWeightedByGlobalScore,
	updatePerTaskPareto,
} from "./pareto";
import {
	evaluateOnSubsample,
	getParentSubsampleScore,
	sampleTestCases,
} from "./subsample";

/**
 * Run the GEPA (Genetic-Pareto) optimization algorithm
 *
 * Unlike traditional genetic algorithms, GEPA:
 * - Uses unbounded archive (no population size limit)
 * - Runs continuously until budget exhausted (not generational)
 * - Uses per-task Pareto fronts for focused optimization
 * - Uses subsample evaluation for efficient filtering
 */
export async function runGEPA(config: GEPAConfig): Promise<Archive> {
	const emit = (event: ProgressEvent) => config.onProgress(event);

	// Validate configuration
	if (config.testCases.length === 0) {
		throw new Error("GEPA requires test cases. Please generate test cases before starting optimization.");
	}

	// Create rate limiter
	const limit = createEvaluationLimiter({
		maxConcurrentEvaluations: config.maxConcurrentEvaluations,
	});

	// Initialize archive and per-task Pareto fronts
	const archive = createArchive();
	const perTaskPareto = createPerTaskPareto(config.testCases);

	// Evaluate original candidate
	const original: Candidate = {
		id: crypto.randomUUID(),
		tools: config.tools,
	};

	console.log("\n=== GEPA: Evaluating ORIGINAL CANDIDATE ===");
	console.log(`Candidate ID: ${original.id}`);
	console.log(`Tools: ${original.tools.map((t) => t.name).join(", ")}`);
	console.log(`Test cases: ${config.testCases.length}`);
	console.log("===========================================\n");

	const originalEval = await evaluateCandidate(
		original,
		config.testCases,
		config.evaluationModel,
		emit,
		limit,
	);

	addToArchive(archive, originalEval);
	updatePerTaskPareto(perTaskPareto, originalEval, archive);

	let totalEvaluations = config.testCases.length;
	let acceptedCount = 1;
	let rejectedCount = 0;
	let iteration = 0;

	// Emit candidate_done for the original candidate so it's available in iteration details
	const originalToolDescriptions = Object.fromEntries(
		original.tools.map((tool) => [tool.name, tool.description]),
	);

	emit({
		type: "candidate_done",
		candidateId: original.id,
		generation: 0,
		toolDescriptions: originalToolDescriptions,
		accuracy: originalEval.accuracy,
		avgLength: originalEval.avgDescriptionLength,
		isPareto: true,
		status: "accepted",
	});

	emit({
		type: "archive_update",
		archiveSize: 1,
		totalEvaluations,
		acceptedCount,
		rejectedCount,
	});

	console.log(
		`GEPA: Starting optimization with budget ${config.maxEvaluations}`,
	);
	console.log(
		`GEPA: Multi-objective config - Min Accuracy: ${((config.minAccuracy ?? 0) * 100).toFixed(0)}%, Accuracy Weight: ${((config.accuracyWeight ?? 0.5) * 100).toFixed(0)}%, Selection Temp: ${(config.selectionTemperature ?? 1.0).toFixed(1)}`,
	);
	console.log(
		`GEPA: Parent selection will only consider candidates with accuracy >= ${((config.minAccuracy ?? 0) * 100).toFixed(0)}%`,
	);

	// Main GEPA loop - continuous until budget exhausted
	while (totalEvaluations < config.maxEvaluations) {
		iteration++;
		console.log(
			`\n\n${"=".repeat(60)}\nITERATION ${iteration} (Budget: ${totalEvaluations}/${config.maxEvaluations})\n${"=".repeat(60)}`,
		);

		emit({ type: "iteration_start", iteration, totalEvaluations });

		// 1. Select parent (weighted by global score combining accuracy + conciseness)
		// Clamp temperature to avoid division by zero (min 0.1 for maximum exploitation)
		const selectionTemp = Math.max(0.1, config.selectionTemperature ?? 1.0);
		const accuracyWeight = config.accuracyWeight ?? 0.5;
		const minAccuracy = config.minAccuracy ?? 0;
		const parent = selectParentWeightedByGlobalScore(
			archive,
			accuracyWeight,
			selectionTemp,
			minAccuracy,
		);
		if (!parent) {
			console.log("GEPA: No parent available, stopping");
			break;
		}

		// Calculate parent's global score for logging and events
		const maxLength = Math.max(
			...Array.from(archive.candidates.values()).map(
				(c) => c.avgDescriptionLength,
			),
		);
		const concisenessScore = 1 - parent.avgDescriptionLength / maxLength;
		const globalScore =
			parent.accuracy * accuracyWeight + concisenessScore * (1 - accuracyWeight);

		emit({
			type: "parent_selected",
			candidateId: parent.id,
			iteration,
			globalScore,
		});

		console.log(
			`\n[1. Parent Selection]\nSelected: ${parent.id.slice(0, 8)}\nAccuracy: ${(parent.accuracy * 100).toFixed(1)}%\nGlobal Score: ${globalScore.toFixed(3)} (acc: ${(parent.accuracy * accuracyWeight).toFixed(3)}, concise: ${(concisenessScore * (1 - accuracyWeight)).toFixed(3)})\nAvg Length: ${parent.avgDescriptionLength.toFixed(0)} chars`,
		);

		// 2. Mutate parent
		console.log("\n[2. Mutation]");
		emit({ type: "mutation_start", candidateId: parent.id });
		const offspring = await mutateViaReflection(
			parent,
			config.testCases,
			config.generationModel,
			emit,
		);
		console.log(`Generated offspring: ${offspring.id.slice(0, 8)}`);

		// 3. Subsample evaluation (cheap filter)
		console.log("\n[3. Subsample Evaluation]");
		const subsample = sampleTestCases(config.testCases, config.subsampleSize);
		const subsampleScore = await evaluateOnSubsample(
			offspring,
			subsample,
			config.evaluationModel,
			limit,
		);
		const parentSubsampleScore = getParentSubsampleScore(parent, subsample);
		totalEvaluations += subsample.length;

		// Calculate average description lengths for tiebreaking
		const offspringAvgLength =
			offspring.tools.reduce((sum, t) => sum + t.description.length, 0) /
			offspring.tools.length;
		const parentAvgLength =
			parent.tools.reduce((sum, t) => sum + t.description.length, 0) /
			parent.tools.length;

		emit({
			type: "subsample_eval",
			candidateId: offspring.id,
			iteration,
			subsampleScore,
			parentSubsampleScore,
			subsampleSize: subsample.length,
		});

		console.log(
			`GEPA: Subsample eval - Offspring: ${subsampleScore.toFixed(2)} (len: ${offspringAvgLength.toFixed(0)}), Parent: ${parentSubsampleScore.toFixed(2)} (len: ${parentAvgLength.toFixed(0)})`,
		);

		// 4. Acceptance check
		// Accept if accuracy improved OR stayed same (let full eval and Pareto front decide)
		const minAccuracyThreshold = config.minAccuracy ?? 0;
		const accuracyImproved = subsampleScore > parentSubsampleScore;
		const accuracyEqual =
			Math.abs(subsampleScore - parentSubsampleScore) < 0.001;
		const accuracyWorse = subsampleScore < parentSubsampleScore - 0.001;
		const belowMinAccuracy = subsampleScore < minAccuracyThreshold;

		console.log(
			`GEPA: Decision - Improved: ${accuracyImproved}, Equal: ${accuracyEqual}, Worse: ${accuracyWorse}, Below Min: ${belowMinAccuracy} (threshold: ${(minAccuracyThreshold * 100).toFixed(0)}%)`,
		);
		console.log(
			`  Lengths: Offspring ${offspringAvgLength.toFixed(0)} vs Parent ${parentAvgLength.toFixed(0)} chars`,
		);

		// Reject if accuracy got WORSE on subsample OR below minimum threshold
		if (accuracyWorse || belowMinAccuracy) {
			rejectedCount++;
			const reason = belowMinAccuracy
				? `Below minimum accuracy (${(subsampleScore * 100).toFixed(0)}% < ${(minAccuracyThreshold * 100).toFixed(0)}% threshold)`
				: `Lower accuracy (${(subsampleScore * 100).toFixed(0)}% < ${(parentSubsampleScore * 100).toFixed(0)}%)`;

			console.log(`GEPA: Offspring ${offspring.id} rejected - ${reason}`);

			// Emit candidate_done for rejected candidate so it appears in graph
			const rejectedToolDescriptions = Object.fromEntries(
				offspring.tools.map((tool) => [tool.name, tool.description]),
			);

			emit({
				type: "candidate_done",
				candidateId: offspring.id,
				generation: iteration,
				toolDescriptions: rejectedToolDescriptions,
				accuracy: subsampleScore,
				avgLength: offspringAvgLength,
				isPareto: false,
				status: "rejected",
				rejectionReason: reason,
				parentId: parent.id,
			});

			emit({
				type: "offspring_rejected",
				candidateId: offspring.id,
				reason,
				iteration,
			});

			emit({
				type: "iteration_done",
				iteration,
				totalEvaluations,
				archiveSize: getArchiveSize(archive),
			});
			continue;
		}

		// 5. Full evaluation (accepted on subsample)
		console.log(
			`\n[5. Full Evaluation]\nOffspring ${offspring.id.slice(0, 8)} passed subsample filter`,
		);
		emit({ type: "candidate_start", candidateId: offspring.id, iteration });

		const offspringEval = await evaluateCandidate(
			offspring,
			config.testCases,
			config.evaluationModel,
			emit,
			limit,
		);
		totalEvaluations += config.testCases.length;

		// 6. Add to archive and update Pareto fronts
		addToArchive(archive, offspringEval, parent.id);
		updatePerTaskPareto(perTaskPareto, offspringEval, archive);
		acceptedCount++;

		const toolDescriptions: Record<string, string> = {};
		for (const tool of offspringEval.tools) {
			toolDescriptions[tool.name] = tool.description;
		}

		// Emit candidate_done FIRST so it gets inserted into the database
		emit({
			type: "candidate_done",
			candidateId: offspring.id,
			generation: iteration,
			accuracy: offspringEval.accuracy,
			avgLength: offspringEval.avgDescriptionLength,
			toolDescriptions,
			isPareto: true, // All accepted candidates are on some Pareto front
			status: "accepted",
			parentId: parent.id,
		});

		// Then emit offspring_accepted to update with GEPA-specific metadata
		emit({
			type: "offspring_accepted",
			candidateId: offspring.id,
			accuracy: offspringEval.accuracy,
			avgLength: offspringEval.avgDescriptionLength,
			archiveIndex: getArchiveSize(archive),
			parentId: parent.id,
			iteration,
		});

		emit({
			type: "archive_update",
			archiveSize: getArchiveSize(archive),
			totalEvaluations,
			acceptedCount,
			rejectedCount,
		});

		console.log(
			`GEPA: Accepted ${offspring.id} - Accuracy: ${(offspringEval.accuracy * 100).toFixed(1)}%, Archive size: ${getArchiveSize(archive)}`,
		);

		emit({
			type: "iteration_done",
			iteration,
			totalEvaluations,
			archiveSize: getArchiveSize(archive),
		});
	}

	console.log(
		`GEPA: Optimization complete - Archive size: ${getArchiveSize(archive)}, Accepted: ${acceptedCount}, Rejected: ${rejectedCount}`,
	);

	emit({
		type: "optimization_complete",
		runId: config.runId,
		archiveSize: getArchiveSize(archive),
		totalEvaluations,
		acceptedCount,
		rejectedCount,
	});

	return archive;
}
