import type { Candidate, ModelName, Tool } from "../types";
import { reflect } from "./llm";

/**
 * Variation types for candidate generation
 */
type VariationType =
	| "clarity"
	| "specificity"
	| "conciseness"
	| "edge-cases"
	| "precision"
	| "recall";

/**
 * Generate candidate variations using LLM
 */
export async function generateCandidates(
	baselineTools: Tool[],
	count: number,
	model: ModelName,
): Promise<Array<{ candidate: Candidate; variationType: string }>> {
	const candidates: Array<{ candidate: Candidate; variationType: string }> = [];

	// Add baseline as first candidate
	candidates.push({
		candidate: {
			id: crypto.randomUUID(),
			tools: baselineTools,
		},
		variationType: "baseline",
	});

	// Define variation types to generate (cycle through them)
	const variationTypes: VariationType[] = [
		"clarity",
		"specificity",
		"conciseness",
		"edge-cases",
		"precision",
		"recall",
	];

	// Generate N-1 variations (since we already have baseline)
	for (let i = 0; i < count - 1; i++) {
		const variationType = variationTypes[i % variationTypes.length];

		try {
			const candidate = await generateVariation(
				baselineTools,
				variationType,
				model,
			);

			candidates.push({
				candidate,
				variationType,
			});

			console.log(
				`Generated candidate ${i + 2}/${count} (${variationType} variation)`,
			);
		} catch (error) {
			console.error(`Error generating ${variationType} variation:`, error);
			// On error, add a copy of baseline with new ID
			candidates.push({
				candidate: {
					id: crypto.randomUUID(),
					tools: baselineTools,
				},
				variationType: `${variationType}_fallback`,
			});
		}
	}

	return candidates;
}

async function generateVariation(
	tools: Tool[],
	variationType: VariationType,
	model: ModelName,
): Promise<Candidate> {
	const mutatedTools: Tool[] = [];

	for (const tool of tools) {
		const prompt = buildVariationPrompt(tool, tools, variationType);

		console.log(`\n=== ${variationType.toUpperCase()} VARIATION ===`);
		console.log(`Tool: ${tool.name}`);
		console.log(`Original: "${tool.description}"`);

		try {
			const newDescription = await reflect(model, prompt);

			console.log(`Modified: "${newDescription.trim()}"`);
			console.log("=== END ===\n");

			mutatedTools.push({
				...tool,
				description: newDescription.trim(),
			});
		} catch (error) {
			console.error(
				`Error generating ${variationType} variation for ${tool.name}:`,
				error,
			);
			// Keep original on error
			mutatedTools.push(tool);
		}
	}

	return {
		id: crypto.randomUUID(),
		tools: mutatedTools,
	};
}

function buildVariationPrompt(
	tool: Tool,
	allTools: Tool[],
	variationType: VariationType,
): string {
	const otherTools = allTools
		.filter((t) => t.id !== tool.id)
		.map((t) => `- ${t.name}: "${t.description}"`)
		.join("\n");

	const baseContext = `You are optimizing tool descriptions for an LLM function calling system.

Target tool:
Name: ${tool.name}
Description: "${tool.description}"
Input Schema: ${JSON.stringify(tool.inputSchema, null, 2)}

Other available tools:
${otherTools}`;

	switch (variationType) {
		case "clarity":
			return `${baseContext}

Task: Rewrite this description to be CLEARER and easier to understand.

Focus on:
- Use simple, direct language
- Remove ambiguous terms
- Make the purpose immediately obvious
- Explain what the tool does in plain terms

Requirements:
- Keep functionality identical
- Maximum 200 characters
- Return ONLY the new description, no explanation`;

		case "specificity":
			return `${baseContext}

Task: Rewrite this description to be MORE SPECIFIC about when and how to use this tool.

Focus on:
- Add specific use cases and scenarios
- Clarify exact capabilities and limitations
- Distinguish from similar tools
- Include concrete examples of what it handles

Requirements:
- Keep functionality identical
- Maximum 250 characters
- Return ONLY the new description, no explanation`;

		case "conciseness":
			return `${baseContext}

Task: Make this description MORE CONCISE while preserving all essential information.

Focus on:
- Remove redundant words
- Use shorter phrasing
- Keep only critical information
- Maintain clarity despite brevity

Requirements:
- Keep functionality identical
- Target: under ${Math.max(50, Math.floor(tool.description.length * 0.7))} characters
- Return ONLY the new description, no explanation`;

		case "edge-cases":
			return `${baseContext}

Task: Rewrite this description to better handle EDGE CASES and avoid false positives.

Focus on:
- Explicitly state when NOT to use this tool
- Add constraints and boundaries
- Clarify what's outside the scope
- Prevent confusion with similar tools

Requirements:
- Keep functionality identical
- Maximum 250 characters
- Return ONLY the new description, no explanation`;

		case "precision":
			return `${baseContext}

Task: Optimize this description for PRECISION (avoiding false positives).

Focus on:
- Be very specific about exact use cases
- Add exclusionary language ("only for...", "specifically when...")
- Narrow the scope to prevent incorrect selection
- Distinguish clearly from other tools

Requirements:
- Keep functionality identical
- Maximum 200 characters
- Return ONLY the new description, no explanation`;

		case "recall":
			return `${baseContext}

Task: Optimize this description for RECALL (catching all valid uses).

Focus on:
- Broaden language to cover all use cases
- Include alternative phrasings users might use
- Ensure indirect invocations are captured
- Cover different ways users might express the need

Requirements:
- Keep functionality identical
- Maximum 200 characters
- Return ONLY the new description, no explanation`;
	}
}
