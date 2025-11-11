import type {
	EvaluatedCandidate,
	GoldenOptimizerConfig,
	GoldenTestCase,
	ProgressEvent,
	TestCase,
} from "../types";
import { addToArchive, createArchive, getArchiveCandidates } from "./archive";
import { generateCandidates } from "./candidate-generator";
import { createEvaluationLimiter } from "./concurrency";
import { evaluateCandidate } from "./evaluator";
import { generateGoldenTestSet } from "./golden-set-generator";

/**
 * Golden Set Optimizer
 * Generate test cases → Generate candidates → Evaluate all → Select best
 */
export async function runGoldenOptimizer(
	config: GoldenOptimizerConfig,
): Promise<void> {
	console.log("\n=== GOLDEN SET OPTIMIZER STARTED ===");
	console.log(`Run ID: ${config.runId}`);
	console.log(
		`Evaluation model: ${config.evaluationModel}, Generation model: ${config.generationModel}`,
	);
	console.log(`Concurrent evals: ${config.maxConcurrentEvaluations}`);
	console.log(`Tools: ${config.tools.length}`);
	console.log(
		`Test cases per category: ${config.testCasesPerCategory} (direct/indirect/negative)`,
	);
	console.log(`Candidate count: ${config.candidateCount}`);

	const emit = config.onProgress;
	const archive = createArchive();
	const limit = createEvaluationLimiter({
		maxConcurrentEvaluations: config.maxConcurrentEvaluations,
	});

	emit({ type: "optimization_start", runId: config.runId });

	// PHASE 1: Generate Golden Test Set
	console.log("\n=== PHASE 1: GENERATE GOLDEN TEST SET ===");
	emit({
		type: "test_case_generation_start",
		toolCount: config.tools.length,
	});

	const goldenTestCases = await generateGoldenTestSet(
		config.tools,
		config.testCasesPerCategory,
		config.generationModel,
	);

	for (const testCase of goldenTestCases) {
		emit({
			type: "test_case_generated",
			testCaseId: testCase.id,
			toolId: testCase.toolId,
			expectedTool: testCase.expectedTool,
			invocationType: testCase.invocationType,
			query: testCase.query,
			shouldCall: testCase.shouldCall,
		});
	}

	const directCount = goldenTestCases.filter(
		(tc) => tc.invocationType === "direct",
	).length;
	const indirectCount = goldenTestCases.filter(
		(tc) => tc.invocationType === "indirect",
	).length;
	const negativeCount = goldenTestCases.filter(
		(tc) => tc.invocationType === "negative",
	).length;

	emit({
		type: "test_case_generation_done",
		totalGenerated: goldenTestCases.length,
		directCount,
		indirectCount,
		negativeCount,
	});

	console.log(`Generated ${goldenTestCases.length} test cases:`);
	console.log(`  - Direct: ${directCount}`);
	console.log(`  - Indirect: ${indirectCount}`);
	console.log(`  - Negative: ${negativeCount}`);

	// PHASE 2: Generate Candidates
	console.log("\n=== PHASE 2: GENERATE CANDIDATES ===");
	emit({
		type: "candidate_generation_start",
		targetCount: config.candidateCount,
	});

	const candidatesWithTypes = await generateCandidates(
		config.tools,
		config.candidateCount,
		config.generationModel,
	);

	for (const { candidate, variationType } of candidatesWithTypes) {
		emit({
			type: "candidate_generated",
			candidateId: candidate.id,
			variationType,
		});
	}

	emit({
		type: "candidate_generation_done",
		totalGenerated: candidatesWithTypes.length,
	});

	console.log(`Generated ${candidatesWithTypes.length} candidates`);

	// PHASE 3: Evaluate All Candidates
	console.log("\n=== PHASE 3: EVALUATE ALL CANDIDATES ===");
	emit({
		type: "evaluation_phase_start",
		candidateCount: candidatesWithTypes.length,
		testCaseCount: goldenTestCases.length,
	});

	// Convert golden test cases to regular test cases for evaluation
	const testCases: TestCase[] = goldenTestCases.map((gtc) => ({
		id: gtc.id,
		toolId: gtc.toolId,
		query: gtc.query,
		expectedTool: gtc.expectedTool,
		userCreated: gtc.userCreated,
	}));

	for (const { candidate, variationType } of candidatesWithTypes) {
		console.log(
			`\nEvaluating candidate ${candidate.id} (${variationType})...`,
		);

		emit({
			type: "candidate_start",
			candidateId: candidate.id,
		});

		const evaluated = await evaluateCandidate(
			candidate,
			testCases,
			config.evaluationModel,
			emit,
			limit,
		);

		// Compute precision and recall for golden test cases
		const metrics = computeGoldenMetrics(evaluated, goldenTestCases);

		console.log(`Precision: ${(metrics.precision * 100).toFixed(1)}%`);
		console.log(`Recall: ${(metrics.recall * 100).toFixed(1)}%`);

		addToArchive(archive, evaluated);

		emit({
			type: "candidate_done",
			candidateId: evaluated.id,
			accuracy: evaluated.accuracy,
			avgLength: evaluated.avgDescriptionLength,
			toolDescriptions: Object.fromEntries(
				evaluated.tools.map((t) => [t.name, t.description]),
			),
			isPareto: false, // Will determine after all evaluations
			variationType,
			precision: metrics.precision,
			recall: metrics.recall,
		});
	}

	emit({
		type: "evaluation_phase_done",
		evaluatedCount: candidatesWithTypes.length,
	});

	// PHASE 4: Select Best Candidate
	console.log("\n=== PHASE 4: SELECT BEST CANDIDATE ===");

	const allCandidates = getArchiveCandidates(archive);
	const best = selectBestCandidate(allCandidates, goldenTestCases);

	if (best) {
		const metrics = computeGoldenMetrics(best.candidate, goldenTestCases);

		console.log(`\nBest candidate: ${best.candidate.id}`);
		console.log(`Accuracy: ${(best.candidate.accuracy * 100).toFixed(1)}%`);
		console.log(
			`Avg Length: ${best.candidate.avgDescriptionLength.toFixed(0)} chars`,
		);
		console.log(`Precision: ${(metrics.precision * 100).toFixed(1)}%`);
		console.log(`Recall: ${(metrics.recall * 100).toFixed(1)}%`);
		console.log(
			`Score: ${best.score.toFixed(3)} (accuracy: ${(best.accuracyScore * 100).toFixed(1)}%, length: ${best.lengthScore.toFixed(0)} chars)`,
		);

		emit({
			type: "best_candidate_selected",
			candidateId: best.candidate.id,
			accuracy: best.candidate.accuracy,
			avgLength: best.candidate.avgDescriptionLength,
			precision: metrics.precision,
			recall: metrics.recall,
		});

		console.log("\nBest tool descriptions:");
		for (const tool of best.candidate.tools) {
			console.log(`  ${tool.name}: "${tool.description}"`);
		}
	} else {
		console.log("No candidates evaluated");
	}

	emit({
		type: "optimization_complete",
		runId: config.runId,
		archiveSize: archive.candidates.size,
		totalEvaluations: goldenTestCases.length * candidatesWithTypes.length,
		acceptedCount: archive.candidates.size,
		rejectedCount: 0,
	});

	console.log("\n=== GOLDEN SET OPTIMIZER COMPLETED ===\n");
}

/**
 * Compute precision and recall for golden test cases
 */
function computeGoldenMetrics(
	candidate: EvaluatedCandidate,
	goldenTestCases: GoldenTestCase[],
): { precision: number; recall: number } {
	let truePositives = 0;
	let falsePositives = 0;
	let falseNegatives = 0;
	let trueNegatives = 0;

	for (const evaluation of candidate.evaluations) {
		const goldenTestCase = goldenTestCases.find(
			(tc) => tc.id === evaluation.testCaseId,
		);
		if (!goldenTestCase) continue;

		const toolWasCalled = evaluation.selectedTool !== null;
		const shouldCall = goldenTestCase.shouldCall;

		if (shouldCall && toolWasCalled && evaluation.correct) {
			truePositives++;
		} else if (!shouldCall && !toolWasCalled) {
			trueNegatives++;
		} else if (!shouldCall && toolWasCalled) {
			falsePositives++;
		} else if (shouldCall && !toolWasCalled) {
			falseNegatives++;
		} else if (shouldCall && toolWasCalled && !evaluation.correct) {
			// Wrong tool was called - count as both FP and FN
			falsePositives++;
			falseNegatives++;
		}
	}

	const precision =
		truePositives + falsePositives > 0
			? truePositives / (truePositives + falsePositives)
			: 0;

	const recall =
		truePositives + falseNegatives > 0
			? truePositives / (truePositives + falseNegatives)
			: 0;

	return { precision, recall };
}

/**
 * Select best candidate based on Pareto front (accuracy vs length)
 * For tie-breaking, prefer higher accuracy
 */
function selectBestCandidate(
	candidates: EvaluatedCandidate[],
	goldenTestCases: GoldenTestCase[],
): {
	candidate: EvaluatedCandidate;
	score: number;
	accuracyScore: number;
	lengthScore: number;
} | null {
	if (candidates.length === 0) return null;

	// Compute Pareto front
	const paretoFront = computeParetoFront(candidates);

	console.log(
		`\nPareto front: ${paretoFront.length}/${candidates.length} candidates`,
	);

	// Among Pareto front, select best by weighted score
	// Weight: 70% accuracy, 30% conciseness (inverse of length)
	let bestCandidate: EvaluatedCandidate | null = null;
	let bestScore = -1;
	let bestAccuracyScore = 0;
	let bestLengthScore = 0;

	for (const candidate of paretoFront) {
		const accuracyScore = candidate.accuracy;
		const maxLength = 200; // Normalize to 0-1 range (assuming max 200 chars)
		const lengthScore = Math.max(
			0,
			maxLength - candidate.avgDescriptionLength,
		);

		// Weighted score: 70% accuracy, 30% conciseness
		const score = accuracyScore * 0.7 + (lengthScore / maxLength) * 0.3;

		console.log(
			`  Candidate ${candidate.id}: accuracy=${(accuracyScore * 100).toFixed(1)}%, length=${candidate.avgDescriptionLength.toFixed(0)}, score=${score.toFixed(3)}`,
		);

		if (score > bestScore) {
			bestScore = score;
			bestCandidate = candidate;
			bestAccuracyScore = accuracyScore;
			bestLengthScore = candidate.avgDescriptionLength;
		}
	}

	if (!bestCandidate) return null;

	return {
		candidate: bestCandidate,
		score: bestScore,
		accuracyScore: bestAccuracyScore,
		lengthScore: bestLengthScore,
	};
}

/**
 * Compute Pareto front: candidates not dominated by any other
 * A dominates B if: A has higher accuracy OR (same accuracy but shorter length)
 */
function computeParetoFront(
	candidates: EvaluatedCandidate[],
): EvaluatedCandidate[] {
	const front: EvaluatedCandidate[] = [];

	for (const candidate of candidates) {
		let isDominated = false;

		for (const other of candidates) {
			if (candidate.id === other.id) continue;

			// Other dominates candidate if:
			// 1. Other has strictly better accuracy, OR
			// 2. Same accuracy but strictly shorter length
			if (
				other.accuracy > candidate.accuracy ||
				(other.accuracy === candidate.accuracy &&
					other.avgDescriptionLength < candidate.avgDescriptionLength)
			) {
				isDominated = true;
				break;
			}
		}

		if (!isDominated) {
			front.push(candidate);
		}
	}

	return front;
}
