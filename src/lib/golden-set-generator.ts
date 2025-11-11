import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import type { GoldenTestCase, ModelName, Tool } from "../types";
import { MODEL_PROVIDERS } from "./constants";

const anthropic = createAnthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = createOpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

const modelProviders = {
	"claude-sonnet-4-5": anthropic(MODEL_PROVIDERS["claude-sonnet-4-5"]),
	"claude-opus-4-1": anthropic(MODEL_PROVIDERS["claude-opus-4-1"]),
	"claude-haiku-4-5": anthropic(MODEL_PROVIDERS["claude-haiku-4-5"]),
	"gpt-5": openai(MODEL_PROVIDERS["gpt-5"]),
	"gpt-5-mini": openai(MODEL_PROVIDERS["gpt-5-mini"]),
	"gpt-4o": openai(MODEL_PROVIDERS["gpt-4o"]),
} as const;

/**
 * Generate golden test set with direct, indirect, and negative invocations
 */
export async function generateGoldenTestSet(
	tools: Tool[],
	countPerCategory: number,
	model: ModelName,
): Promise<GoldenTestCase[]> {
	const allTestCases: GoldenTestCase[] = [];

	for (const tool of tools) {
		try {
			const testCases = await generateGoldenTestsForTool(
				tool,
				tools,
				countPerCategory,
				model,
			);
			allTestCases.push(...testCases);
		} catch (error) {
			console.error(
				`Error generating golden tests for tool ${tool.name}:`,
				error,
			);
			// Add fallback test cases
			allTestCases.push(
				{
					id: crypto.randomUUID(),
					toolId: tool.id,
					query: `Use the ${tool.name} tool`,
					expectedTool: tool.name,
					userCreated: false,
					invocationType: "direct",
					shouldCall: true,
				},
				{
					id: crypto.randomUUID(),
					toolId: tool.id,
					query: `I need help with ${(tool.description.split(".")[0] ?? tool.description).toLowerCase()}`,
					expectedTool: tool.name,
					userCreated: false,
					invocationType: "indirect",
					shouldCall: true,
				},
			);
		}
	}

	return allTestCases;
}

async function generateGoldenTestsForTool(
	tool: Tool,
	allTools: Tool[],
	countPerCategory: number,
	model: ModelName,
): Promise<GoldenTestCase[]> {
	const otherToolsContext = allTools
		.filter((t) => t.id !== tool.id)
		.map((t) => `- ${t.name}: ${t.description}`)
		.join("\n");

	const prompt = `Generate test cases for optimizing tool selection metadata. Create ${countPerCategory} queries for EACH category below.

Target Tool: ${tool.name}
Description: ${tool.description}
Input Schema: ${JSON.stringify(tool.inputSchema, null, 2)}

Other Available Tools:
${otherToolsContext}

Generate ${countPerCategory} queries for EACH of these categories:

1. DIRECT INVOCATIONS (should_call: true)
   - User explicitly mentions the tool name or directly references its domain
   - Example: "Use the ${tool.name} tool", "Can you run ${tool.name}?"

2. INDIRECT INVOCATIONS (should_call: true)
   - User describes what they want without naming the tool
   - The tool is clearly the best match based on capabilities
   - Example: Natural questions that this tool should handle

3. NEGATIVE INVOCATIONS (should_call: false)
   - Queries that should NOT trigger this tool
   - Either another tool is more appropriate, or no tool is needed
   - Include edge cases where the tool might be incorrectly selected
   - Include queries that are slightly related but should use other tools

Requirements:
- Queries should be natural user language
- Vary phrasing and complexity
- Negative cases should be realistic edge cases where precision matters`;

	try {
		const result = await generateObject({
			model: modelProviders[model],
			messages: [{ role: "user", content: prompt }],
			schema: z.object({
				direct: z.array(z.string()).describe("Direct invocation queries"),
				indirect: z.array(z.string()).describe("Indirect invocation queries"),
				negative: z.array(z.string()).describe("Negative invocation queries"),
			}),
			maxOutputTokens: 2000,
		});

		const testCases: GoldenTestCase[] = [];

		// Process direct invocations
		for (const query of result.object.direct) {
			testCases.push({
				id: crypto.randomUUID(),
				toolId: tool.id,
				query,
				expectedTool: tool.name,
				userCreated: false,
				invocationType: "direct",
				shouldCall: true,
			});
		}

		// Process indirect invocations
		for (const query of result.object.indirect) {
			testCases.push({
				id: crypto.randomUUID(),
				toolId: tool.id,
				query,
				expectedTool: tool.name,
				userCreated: false,
				invocationType: "indirect",
				shouldCall: true,
			});
		}

		// Process negative invocations
		for (const query of result.object.negative) {
			testCases.push({
				id: crypto.randomUUID(),
				toolId: tool.id,
				query,
				expectedTool: "", // No tool should be selected, or a different tool
				userCreated: false,
				invocationType: "negative",
				shouldCall: false,
			});
		}

		return testCases;
	} catch (error) {
		console.error(`Error generating golden tests for ${tool.name}:`, error);
		throw error;
	}
}
