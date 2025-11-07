import type {
	Candidate,
	EvaluatedCandidate,
	ModelName,
	ProgressEvent,
	TestCase,
} from "../types";
import { reflect } from "./llm";

/**
 * Mutate a candidate by using LLM reflection on failures
 */
export async function mutateViaReflection(
	candidate: EvaluatedCandidate,
	testCases: TestCase[],
	model: ModelName,
	emit: (event: ProgressEvent) => void,
): Promise<Candidate> {
	// Find failures for this candidate
	const failures = candidate.evaluations.filter((e) => !e.correct);

	if (failures.length === 0) {
		// Perfect candidate - optimize for conciseness instead
		console.log(
			`Candidate ${candidate.id} is perfect (${candidate.accuracy * 100}% accuracy), optimizing for conciseness`,
		);

		// Pick a random tool to make more concise
		const tool =
			candidate.tools[Math.floor(Math.random() * candidate.tools.length)];

		if (!tool) {
			return {
				id: crypto.randomUUID(),
				tools: candidate.tools,
			};
		}

		emit({
			type: "reflection_start",
			candidateId: candidate.id,
			tool: tool.name,
			failure: {
				query: "Optimizing for conciseness",
				selected: null,
				expected: tool.name,
			},
		});

		// Build other tool descriptions for context
		const otherTools = candidate.tools
			.filter((t) => t.name !== tool.name)
			.map((t) => `- ${t.name}: "${t.description}"`)
			.join("\n");

		// Ask LLM to make description more concise
		const concisePrompt = `You are optimizing tool descriptions for an LLM function calling system.

Current tool:
Name: ${tool.name}
Description: "${tool.description}"

Other available tools:
${otherTools}

This tool's description is currently ${tool.description.length} characters.
Your task: Make this description MORE CONCISE while maintaining the same meaning and functionality.

Requirements:
- Keep the exact same functionality and use case
- Remove redundant words and phrases
- Use shorter, clearer language
- Maintain distinction from other tools
- Target: under ${Math.max(50, Math.floor(tool.description.length * 0.75))} characters

Return ONLY the new concise description, no explanation or quotes.`;

		console.log("\n=== CONCISENESS OPTIMIZATION PROMPT ===");
		console.log(`Tool: ${tool.name}`);
		console.log(
			`Current description (${tool.description.length} chars): "${tool.description}"`,
		);
		console.log(
			`Target: ${Math.max(50, Math.floor(tool.description.length * 0.75))} chars`,
		);
		console.log("\nFull prompt:");
		console.log(concisePrompt);
		console.log("=== END PROMPT ===\n");

		try {
			const newDescription = await reflect(model, concisePrompt);
			console.log("\n=== LLM RESPONSE ===");
			console.log(
				`New description (${newDescription.trim().length} chars): "${newDescription.trim()}"`,
			);
			console.log("=== END RESPONSE ===\n");

			emit({
				type: "reflection_done",
				candidateId: candidate.id,
				tool: tool.name,
				oldDesc: tool.description || "",
				newDesc: newDescription.trim(),
			});

			// Return new candidate with more concise description
			return {
				id: crypto.randomUUID(),
				tools: candidate.tools.map((t) =>
					t.name === tool.name
						? { ...t, description: newDescription.trim() }
						: t,
				),
			};
		} catch (error) {
			console.error("Error during conciseness optimization:", error);
			// Return unchanged candidate with new ID on error
			return {
				id: crypto.randomUUID(),
				tools: candidate.tools,
			};
		}
	}

	// Pick a random failure to address
	const failure = failures[Math.floor(Math.random() * failures.length)];
	if (!failure) {
		return {
			id: crypto.randomUUID(),
			tools: candidate.tools,
		};
	}
	const tool = candidate.tools.find((t) => t.name === failure.expectedTool);

	if (!tool) {
		// Tool not found, return as-is
		return {
			id: crypto.randomUUID(),
			tools: candidate.tools,
		};
	}

	const testCase = testCases.find((tc) => tc.id === failure.testCaseId);
	if (!testCase) {
		return {
			id: crypto.randomUUID(),
			tools: candidate.tools,
		};
	}

	emit({
		type: "reflection_start",
		candidateId: candidate.id,
		tool: tool.name,
		failure: {
			query: testCase.query,
			selected: failure.selectedTool,
			expected: failure.expectedTool,
		},
	});

	// Build other tool descriptions for context
	const otherTools = candidate.tools
		.filter((t) => t.name !== tool.name)
		.map((t) => `- ${t.name}: "${t.description}"`)
		.join("\n");

	// Ask LLM to reflect and improve description
	const reflectionPrompt = `You are optimizing tool descriptions for an LLM function calling system.

Current tool:
Name: ${tool.name}
Description: "${tool.description}"

Other available tools:
${otherTools}

This description caused a failure:
- User query: "${testCase.query}"
- Expected tool: ${failure.expectedTool}
- LLM selected: ${failure.selectedTool || "none"}

Rewrite ONLY the description for "${tool.name}" to fix this issue.
Requirements:
- Keep it concise (under 200 characters)
- Make the use case more specific
- Distinguish it clearly from other tools
- Focus on WHEN to use this tool

Return ONLY the new description, no explanation or quotes.`;

	console.log("\n=== FAILURE-BASED REFLECTION PROMPT ===");
	console.log(`Tool: ${tool.name}`);
	console.log(`Current description (${tool.description.length} chars): "${tool.description}"`);
	console.log(`\nFailure details:`);
	console.log(`  Query: "${testCase.query}"`);
	console.log(`  Expected: ${failure.expectedTool}`);
	console.log(`  Selected: ${failure.selectedTool || "none"}`);
	console.log("\nFull prompt:");
	console.log(reflectionPrompt);
	console.log("=== END PROMPT ===\n");

	try {
		const newDescription = await reflect(model, reflectionPrompt);
		console.log("\n=== LLM RESPONSE ===");
		console.log(
			`New description (${newDescription.trim().length} chars): "${newDescription.trim()}"`,
		);
		console.log("=== END RESPONSE ===\n");

		emit({
			type: "reflection_done",
			candidateId: candidate.id,
			tool: tool.name,
			oldDesc: tool.description || "",
			newDesc: newDescription.trim(),
		});

		// Return new candidate with mutated tool
		return {
			id: crypto.randomUUID(),
			tools: candidate.tools.map((t) =>
				t.name === tool.name ? { ...t, description: newDescription.trim() } : t,
			),
		};
	} catch (error) {
		console.error("Error during mutation:", error);
		// Return unchanged candidate with new ID on error
		return {
			id: crypto.randomUUID(),
			tools: candidate.tools,
		};
	}
}
