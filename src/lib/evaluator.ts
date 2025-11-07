import type pLimit from "p-limit";
import type {
	Candidate,
	EvalResult,
	EvaluatedCandidate,
	ModelName,
	ProgressEvent,
	TestCase,
	Tool,
} from "../types";
import { evaluateWithTools } from "./llm";

/**
 * Evaluate a candidate against all test cases
 */
export async function evaluateCandidate(
	candidate: Candidate,
	testCases: TestCase[],
	model: ModelName,
	emit: (event: ProgressEvent) => void,
	limit: ReturnType<typeof pLimit>,
): Promise<EvaluatedCandidate> {
	// Evaluate all test cases with rate limiting
	const evaluations = await Promise.all(
		testCases.map((testCase, idx) =>
			limit(async () => {
				const result = await evaluateTestCase(candidate.tools, testCase, model);

				const status = result.correct ? "✓" : "✗";
				console.log(
					`  Test ${idx + 1}/${testCases.length}: ${status} "${testCase.query.slice(0, 50)}..." → ${result.selectedTool || "none"} (expected: ${testCase.expectedTool})`,
				);

				emit({
					type: "evaluation",
					candidateId: candidate.id,
					testCase: testCase.query,
					result: {
						correct: result.correct,
						selected: result.selectedTool,
						expected: testCase.expectedTool,
					},
				});

				return result;
			}),
		),
	);

	const accuracy =
		evaluations.filter((e) => e.correct).length / evaluations.length;
	const avgDescriptionLength =
		candidate.tools.reduce((sum, t) => sum + (t.description?.length || 0), 0) /
		candidate.tools.length;

	console.log(
		`\n=== EVALUATION SUMMARY ===\nCandidate: ${candidate.id}\nAccuracy: ${(accuracy * 100).toFixed(1)}% (${evaluations.filter((e) => e.correct).length}/${evaluations.length})\nAvg Description Length: ${avgDescriptionLength.toFixed(0)} chars\n=========================\n`,
	);

	return {
		...candidate,
		accuracy,
		avgDescriptionLength,
		evaluations,
	};
}

/**
 * Evaluate a single test case
 */
async function evaluateTestCase(
	tools: Tool[],
	testCase: TestCase,
	model: ModelName,
): Promise<EvalResult> {
	// Call LLM with tools - just see which tool it selects
	const { selectedTool } = await evaluateWithTools(
		model,
		testCase.query,
		tools,
	);

	return {
		testCaseId: testCase.id,
		selectedTool: selectedTool,
		expectedTool: testCase.expectedTool,
		correct: selectedTool === testCase.expectedTool,
	};
}
