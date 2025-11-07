import type pLimit from "p-limit";
import type {
	Candidate,
	EvaluatedCandidate,
	ModelName,
	TestCase,
} from "../types";
import { evaluateWithTools } from "./llm";

/**
 * Sample random subset of test cases
 * Used for cheap filtering before expensive full evaluation
 */
export function sampleTestCases(
	testCases: TestCase[],
	subsampleSize: number,
): TestCase[] {
	const shuffled = [...testCases].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, Math.min(subsampleSize, testCases.length));
}

/**
 * Evaluate candidate on subsample with rate limiting
 * Returns accuracy on the subsample
 */
export async function evaluateOnSubsample(
	candidate: Candidate,
	subsample: TestCase[],
	model: ModelName,
	limit: ReturnType<typeof pLimit>,
): Promise<number> {
	console.log(
		`\n=== SUBSAMPLE EVALUATION (${subsample.length} test cases) ===`,
	);

	const results = await Promise.all(
		subsample.map((testCase, idx) =>
			limit(async () => {
				const { selectedTool } = await evaluateWithTools(
					model,
					testCase.query,
					candidate.tools,
				);
				const correct = selectedTool === testCase.expectedTool;
				const status = correct ? "✓" : "✗";
				console.log(
					`  Subsample ${idx + 1}/${subsample.length}: ${status} "${testCase.query.slice(0, 50)}..." → ${selectedTool || "none"} (expected: ${testCase.expectedTool})`,
				);
				return correct ? 1 : 0;
			}),
		),
	);
	const correctCount = results.reduce(
		(sum, result) => sum + result,
		0 as number,
	);
	const accuracy = correctCount / results.length;
	console.log(
		`Subsample accuracy: ${(accuracy * 100).toFixed(1)}% (${correctCount}/${results.length})`,
	);
	console.log("=== END SUBSAMPLE ===\n");
	return accuracy;
}

/**
 * Get parent's score on same subsample
 * Used to compare child candidate against parent baseline
 */
export function getParentSubsampleScore(
	parent: EvaluatedCandidate,
	subsample: TestCase[],
): number {
	const subsampleIds = new Set(subsample.map((testCase) => testCase.id));
	const relevantEvaluations = parent.evaluations.filter((evaluation) =>
		subsampleIds.has(evaluation.testCaseId),
	);
	if (relevantEvaluations.length === 0) return 0;
	return (
		relevantEvaluations.filter((evaluation) => evaluation.correct).length /
		relevantEvaluations.length
	);
}
