import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import type { ModelName, Tool } from '../types';

// Provider configurations
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const moonshot = createOpenAI({
  name: 'moonshot',
  apiKey: process.env.MOONSHOT_API_KEY,
  baseURL: 'https://api.moonshot.cn/v1',
});

const qwen = createOpenAI({
  name: 'qwen',
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// Model mapping with latest IDs from research
const MODEL_PROVIDERS = {
  // Claude models (latest)
  'claude-sonnet-4-5': anthropic('claude-sonnet-4-5-20250929'),
  'claude-sonnet-4': anthropic('claude-sonnet-4-20250514'),
  'claude-opus-4-1': anthropic('claude-opus-4-1-20250805'),
  'claude-haiku-4-5': anthropic('claude-haiku-4-5-20251001'),

  // OpenAI models (latest)
  'gpt-5': openai('gpt-5'),
  'gpt-5-mini': openai('gpt-5-mini'),
  'gpt-4o': openai('gpt-4o'),
  'o3-mini': openai('o3-mini'),

  // Kimi models (Moonshot AI)
  'moonshot-v1-8k': moonshot('moonshot-v1-8k'),
  'moonshot-v1-32k': moonshot('moonshot-v1-32k'),
  'moonshot-v1-128k': moonshot('moonshot-v1-128k'),

  // Qwen models (Alibaba)
  'qwen-turbo': qwen('qwen-turbo'),
  'qwen-plus': qwen('qwen-plus'),
  'qwen-max': qwen('qwen-max'),
  'qwen-long': qwen('qwen-long'),
  'qwq-32b-preview': qwen('qwq-32b-preview'),
} as const;

/**
 * Evaluate a query with tools to see which tool the LLM selects
 */
export async function evaluateWithTools(
  model: ModelName,
  query: string,
  tools: Tool[]
): Promise<{ selectedTool: string | null; arguments?: unknown }> {
  // Convert tools to AI SDK format
  const toolsConfig: Record<string, ReturnType<typeof tool>> = {};

  for (const t of tools) {
    toolsConfig[t.name] = tool({
      description: t.description,
      parameters: z.object({}), // We don't care about parameters, just selection
      execute: async () => ({}), // No execution needed
    });
  }

  try {
    const result = await generateText({
      model: MODEL_PROVIDERS[model],
      messages: [{ role: 'user', content: query }],
      tools: toolsConfig,
      maxSteps: 1, // Only one step, we just want to see which tool is selected
    });

    // Extract tool call from response
    const toolCall = result.toolCalls[0];

    return {
      selectedTool: toolCall?.toolName || null,
      arguments: toolCall?.args,
    };
  } catch (error) {
    console.error('Error evaluating with tools:', error);
    return { selectedTool: null };
  }
}

/**
 * Ask LLM to reflect on failures and generate improved description
 */
export async function reflect(
  model: ModelName,
  prompt: string
): Promise<string> {
  try {
    const result = await generateText({
      model: MODEL_PROVIDERS[model],
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 500,
    });

    return result.text;
  } catch (error) {
    console.error('Error during reflection:', error);
    throw error;
  }
}

/**
 * Generate test cases for a tool
 */
export async function generateTests(
  model: ModelName,
  tool: Tool,
  count: number
): Promise<string[]> {
  const prompt = `Generate ${count} diverse user queries that should trigger this tool:

Tool: ${tool.name}
Description: ${tool.description}
Input schema: ${JSON.stringify(tool.inputSchema, null, 2)}

Requirements:
- Each query should be a natural user question or command
- Queries should vary in phrasing and specificity
- All queries should clearly map to this tool's purpose

Return ONLY a JSON array of query strings, no explanation:
["query1", "query2", ...]`;

  try {
    const result = await generateText({
      model: MODEL_PROVIDERS[model],
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1000,
    });

    // Parse JSON from response
    const text = result.text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('No JSON array found in response');
  } catch (error) {
    console.error('Error generating tests:', error);
    // Return fallback queries
    return [`Use ${tool.name}`, `Help me with ${tool.name}`];
  }
}
