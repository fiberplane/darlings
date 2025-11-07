import { reflect } from './llm';
import type { EvaluatedCandidate, Candidate, TestCase, ModelName, ProgressEvent } from '../types';

/**
 * Mutate a candidate by using LLM reflection on failures
 */
export async function mutateViaReflection(
  candidate: EvaluatedCandidate,
  testCases: TestCase[],
  model: ModelName,
  emit: (event: ProgressEvent) => void
): Promise<Candidate> {
  // Find failures for this candidate
  const failures = candidate.evaluations.filter(e => !e.correct);

  if (failures.length === 0) {
    // Perfect candidate, return as-is with new ID
    return {
      id: crypto.randomUUID(),
      tools: candidate.tools,
    };
  }

  // Pick a random failure to address
  const failure = failures[Math.floor(Math.random() * failures.length)];
  const tool = candidate.tools.find(t => t.name === failure.expectedTool);

  if (!tool) {
    // Tool not found, return as-is
    return {
      id: crypto.randomUUID(),
      tools: candidate.tools,
    };
  }

  const testCase = testCases.find(tc => tc.id === failure.testCaseId);
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
    .filter(t => t.name !== tool.name)
    .map(t => `- ${t.name}: "${t.description}"`)
    .join('\n');

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

  try {
    const newDescription = await reflect(model, reflectionPrompt);

    emit({
      type: "reflection_done",
      candidateId: candidate.id,
      tool: tool.name,
      oldDesc: tool.description,
      newDesc: newDescription.trim(),
    });

    // Return new candidate with mutated tool
    return {
      id: crypto.randomUUID(),
      tools: candidate.tools.map(t =>
        t.name === tool.name
          ? { ...t, description: newDescription.trim() }
          : t
      ),
    };
  } catch (error) {
    console.error('Error during mutation:', error);
    // Return unchanged candidate with new ID on error
    return {
      id: crypto.randomUUID(),
      tools: candidate.tools,
    };
  }
}
