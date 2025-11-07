import { evaluateWithTools } from './llm';
import type { Candidate, TestCase, EvaluatedCandidate, EvalResult, ModelName, ProgressEvent } from '../types';

/**
 * Evaluate a candidate against all test cases
 */
export async function evaluateCandidate(
  candidate: Candidate,
  testCases: TestCase[],
  model: ModelName,
  emit: (event: ProgressEvent) => void
): Promise<EvaluatedCandidate> {
  const evaluations: EvalResult[] = [];

  for (const testCase of testCases) {
    const result = await evaluateTestCase(
      candidate.tools,
      testCase,
      model
    );
    evaluations.push(result);

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
  }

  const accuracy = evaluations.filter(e => e.correct).length / evaluations.length;
  const avgDescriptionLength =
    candidate.tools.reduce((sum, t) => sum + t.description.length, 0) /
    candidate.tools.length;

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
  tools: any[],
  testCase: TestCase,
  model: ModelName
): Promise<EvalResult> {
  // Call LLM with tools - just see which tool it selects
  const { selectedTool } = await evaluateWithTools(
    model,
    testCase.query,
    tools
  );

  return {
    testCaseId: testCase.id,
    selectedTool: selectedTool,
    expectedTool: testCase.expectedTool,
    correct: selectedTool === testCase.expectedTool,
  };
}
