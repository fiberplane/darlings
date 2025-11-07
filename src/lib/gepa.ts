import type { Candidate, GEPAConfig, ProgressEvent } from "../types";
import type { Archive } from "./archive";
import { addToArchive, createArchive, getArchiveSize } from "./archive";
import { createEvaluationLimiter } from "./concurrency";
import { evaluateCandidate } from "./evaluator";
import { mutateViaReflection } from "./mutator";
import {
	createPerTaskPareto,
	selectParentWeighted,
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
		config.model,
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

	// Main GEPA loop - continuous until budget exhausted
	while (totalEvaluations < config.maxEvaluations) {
		iteration++;
		console.log(
			`\n\n${"=".repeat(60)}\nITERATION ${iteration} (Budget: ${totalEvaluations}/${config.maxEvaluations})\n${"=".repeat(60)}`,
		);

		emit({ type: "iteration_start", iteration, totalEvaluations });

		// 1. Select parent (weighted by dominance count)
		const parent = selectParentWeighted(perTaskPareto, archive);
		if (!parent) {
			console.log("GEPA: No parent available, stopping");
			break;
		}

		const dominanceCount = perTaskPareto.dominanceCount.get(parent.id) || 0;
		emit({
			type: "parent_selected",
			candidateId: parent.id,
			iteration,
			dominanceCount,
		});

		console.log(
			`\n[1. Parent Selection]\nSelected: ${parent.id.slice(0, 8)}\nAccuracy: ${(parent.accuracy * 100).toFixed(1)}%\nDominance: ${dominanceCount} tasks\nAvg Length: ${parent.avgDescriptionLength.toFixed(0)} chars`,
		);

		// 2. Mutate parent
		console.log("\n[2. Mutation]");
		emit({ type: "mutation_start", candidateId: parent.id });
		const offspring = await mutateViaReflection(
			parent,
			config.testCases,
			config.model,
			emit,
		);
		console.log(`Generated offspring: ${offspring.id.slice(0, 8)}`);

		// 3. Subsample evaluation (cheap filter)
		console.log("\n[3. Subsample Evaluation]");
		const subsample = sampleTestCases(config.testCases, config.subsampleSize);
		const subsampleScore = await evaluateOnSubsample(
			offspring,
			subsample,
			config.model,
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
			subsampleScore,
			parentSubsampleScore,
			subsampleSize: subsample.length,
		});

		console.log(
			`GEPA: Subsample eval - Offspring: ${subsampleScore.toFixed(2)} (len: ${offspringAvgLength.toFixed(0)}), Parent: ${parentSubsampleScore.toFixed(2)} (len: ${parentAvgLength.toFixed(0)})`,
		);

		// 4. Acceptance check
		// Accept if accuracy improved OR stayed same (let full eval and Pareto front decide)
		const accuracyImproved = subsampleScore > parentSubsampleScore;
		const accuracyEqual =
			Math.abs(subsampleScore - parentSubsampleScore) < 0.001;
		const accuracyWorse = subsampleScore < parentSubsampleScore - 0.001;

		console.log(
			`GEPA: Decision - Improved: ${accuracyImproved}, Equal: ${accuracyEqual}, Worse: ${accuracyWorse}`,
		);
		console.log(
			`  Lengths: Offspring ${offspringAvgLength.toFixed(0)} vs Parent ${parentAvgLength.toFixed(0)} chars`,
		);

		// Only reject if accuracy got WORSE on subsample
		if (accuracyWorse) {
			rejectedCount++;
			const reason = `Lower accuracy (${(subsampleScore * 100).toFixed(0)}% < ${(parentSubsampleScore * 100).toFixed(0)}%)`;

			console.log(`GEPA: Offspring ${offspring.id} rejected - ${reason}`);

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
			config.model,
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
