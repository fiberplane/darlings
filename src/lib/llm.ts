import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { type Tool as AITool, generateObject, generateText, jsonSchema, tool } from "ai";
import { z } from "zod";
import type { ModelName, Tool } from "../types";
import { MODEL_PROVIDERS } from "./constants";

// Provider configurations
const anthropic = createAnthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = createOpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

// Build provider instances from MODEL_PROVIDERS config
const modelProviders = {
	"claude-sonnet-4-5": anthropic(MODEL_PROVIDERS["claude-sonnet-4-5"]),
	"claude-opus-4-1": anthropic(MODEL_PROVIDERS["claude-opus-4-1"]),
	"claude-haiku-4-5": anthropic(MODEL_PROVIDERS["claude-haiku-4-5"]),
	"gpt-5": openai(MODEL_PROVIDERS["gpt-5"]),
	"gpt-5-mini": openai(MODEL_PROVIDERS["gpt-5-mini"]),
	"gpt-4o": openai(MODEL_PROVIDERS["gpt-4o"]),
} as const;

/**
 * Neutered execute function - returns empty result
 */
const neuteredExecute = async () => {
	return Promise.resolve({});
};

/**
 * Neuter execute functions in AI SDK tools - passthrough all other properties
 */
function neuterExecuteFunctions(
	tools: Record<string, AITool>,
): Record<string, AITool> {
	const neuteredTools: Record<string, AITool> = {};

	for (const [name, tool] of Object.entries(tools)) {
		neuteredTools[name] = {
			...tool,
			execute: neuteredExecute,
		};
	}

	return neuteredTools;
}

/**
 * Convert Tool[] (from DB) to AI SDK tools format
 */
function convertToolsToAISDK(tools: Tool[]): Record<string, AITool> {
	const toolsConfig: Record<string, AITool> = {};

	for (const t of tools) {
		toolsConfig[t.name] = tool({
			description: t.description,
			inputSchema: jsonSchema(t.inputSchema),
			execute: neuteredExecute,
		});
	}

	return toolsConfig;
}

/**
 * Evaluate a query with tools to see which tool the LLM selects
 * Accepts either AI SDK tools directly (e.g., from client.tools()) or Tool[] from DB
 */
export async function evaluateWithTools(
	model: ModelName,
	query: string,
	tools: Record<string, AITool> | Tool[],
): Promise<{ selectedTool: string | null; arguments?: unknown }> {
	// Convert to AI SDK format if needed, then neuter execute
	const aiSDKTools = Array.isArray(tools) ? convertToolsToAISDK(tools) : tools;

	const neuteredTools = neuterExecuteFunctions(aiSDKTools);

	try {
		const result = await generateText({
			model: modelProviders[model],
			messages: [{ role: "user", content: query }],
			tools: neuteredTools,
		});

		// Extract tool call from response
		const toolCall = result.toolCalls?.[0];

		return {
			selectedTool: toolCall?.toolName || null,
			arguments: toolCall && "input" in toolCall ? toolCall.input : undefined,
		};
	} catch (error) {
		console.error("Error evaluating with tools:", error);
		return { selectedTool: null };
	}
}

/**
 * Ask LLM to reflect on failures and generate improved description
 */
export async function reflect(
	model: ModelName,
	prompt: string,
): Promise<string> {
	try {
		const result = await generateText({
			model: modelProviders[model],
			messages: [{ role: "user", content: prompt }],
			maxOutputTokens: 500,
		});

		return result.text;
	} catch (error) {
		console.error("Error during reflection:", error);
		throw error;
	}
}

/**
 * Generate test cases for a tool
 */
export async function generateTests(
	model: ModelName,
	tool: Tool,
	count: number,
	customPrompt?: string,
): Promise<string[]> {
	const basePrompt = `Generate ${count} diverse user queries that should trigger this tool:

Tool: ${tool.name}
Description: ${tool.description}
Input schema: ${JSON.stringify(tool.inputSchema, null, 2)}

Requirements:
- Each query should be a natural user question or command
- Queries should vary in phrasing and specificity
- Queries should consider direct and indirect invocations of the tool
- All queries should clearly map to this tool's purpose`;

	const prompt = customPrompt
		? `${basePrompt}\n\nAdditional instructions:\n${customPrompt}`
		: basePrompt;

	try {
		const result = await generateObject({
			model: modelProviders[model],
			messages: [{ role: "user", content: prompt }],
			schema: z.object({
				queries: z.array(z.string()),
			}),
			maxOutputTokens: 1000,
		});

		return result.object.queries;
	} catch (error) {
		console.error("Error generating tests:", error);
		// Return fallback queries
		return [`Use ${tool.name}`, `Help me with ${tool.name}`];
	}
}
