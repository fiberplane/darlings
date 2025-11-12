import type { ModelName, TestCase, Tool } from "../types";
import { generateTests } from "./llm";

/**
 * Generate test cases for all tools
 */
export async function generateTestCases(
	tools: Tool[],
	testsPerTool: number,
	model: ModelName,
	customPrompt?: string,
): Promise<TestCase[]> {
	const testCases: TestCase[] = [];

	for (const tool of tools) {
		try {
			const queries = await generateTests(
				model,
				tool,
				testsPerTool,
				customPrompt,
			);

			for (const query of queries) {
				testCases.push({
					id: crypto.randomUUID(),
					toolId: tool.id,
					query,
					expectedTool: tool.name,
					userCreated: false,
				});
			}
		} catch (error) {
			console.error(`Error generating tests for tool ${tool.name}:`, error);
			// Add at least one fallback test case
			testCases.push({
				id: crypto.randomUUID(),
				toolId: tool.id,
				query: `Use the ${tool.name} tool`,
				expectedTool: tool.name,
				userCreated: false,
			});
		}
	}

	return testCases;
}
