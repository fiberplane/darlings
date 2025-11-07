import { generateTests } from './llm';
import type { Tool, TestCase, ModelName } from '../types';

/**
 * Generate test cases for all tools
 */
export async function generateTestCases(
  tools: Tool[],
  testsPerTool: number,
  model: ModelName
): Promise<TestCase[]> {
  const testCases: TestCase[] = [];

  for (const tool of tools) {
    try {
      const queries = await generateTests(model, tool, testsPerTool);

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
