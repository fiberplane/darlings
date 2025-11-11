import type { EvalResult, EvaluatedCandidate, TestCase } from "../types";
import type { Archive } from "./archive";

/**
 * Per-task Pareto front structure
 * Tracks which candidates are non-dominated on each individual test case
 */
export interface PerTaskPareto {
	taskFronts: Map<string, Set<string>>;
	dominanceCount: Map<string, number>;
}

/**
 * Create per-task Pareto structure for given test cases
 */
export function createPerTaskPareto(testCases: TestCase[]): PerTaskPareto {
	const taskFronts = new Map<string, Set<string>>();
	for (const testCase of testCases) {
		taskFronts.set(testCase.id, new Set());
	}
	return {
		taskFronts,
		dominanceCount: new Map(),
	};
}

/**
 * Update per-task Pareto fronts with new candidate
 * Checks dominance on each task and updates fronts accordingly
 */
export function updatePerTaskPareto(
	pareto: PerTaskPareto,
	newCandidate: EvaluatedCandidate,
	archive: Archive,
): void {
	for (const evaluation of newCandidate.evaluations) {
		const testCaseId = evaluation.testCaseId;
		const front = pareto.taskFronts.get(testCaseId);
		if (!front) continue;

		const toRemove: string[] = [];
		let isDominated = false;

		for (const existingId of Array.from(front)) {
			const existing = archive.candidates.get(existingId);
			if (!existing) continue;

			const existingEvaluation = existing.evaluations.find(
				(evaluation_inner) => evaluation_inner.testCaseId === testCaseId,
			);
			if (!existingEvaluation) continue;

			if (
				dominatesOnTask(newCandidate, existing, evaluation, existingEvaluation)
			) {
				toRemove.push(existingId);
			} else if (
				dominatesOnTask(existing, newCandidate, existingEvaluation, evaluation)
			) {
				isDominated = true;
				break;
			}
		}

		if (!isDominated) {
			for (const id of toRemove) {
				front.delete(id);
				pareto.dominanceCount.set(id, (pareto.dominanceCount.get(id) || 0) - 1);
			}
			front.add(newCandidate.id);
			pareto.dominanceCount.set(
				newCandidate.id,
				(pareto.dominanceCount.get(newCandidate.id) || 0) + 1,
			);
		}
	}
}

/**
 * Check if candidate a dominates candidate b on specific task
 * Dominance criteria:
 * - a is correct and b is not, OR
 * - both correct but a has shorter description
 */
function dominatesOnTask(
	candidateA: EvaluatedCandidate,
	candidateB: EvaluatedCandidate,
	evaluationA: EvalResult,
	evaluationB: EvalResult,
): boolean {
	if (evaluationA.correct && !evaluationB.correct) return true;
	if (!evaluationA.correct) return false;
	return candidateA.avgDescriptionLength < candidateB.avgDescriptionLength;
}

/**
 * Select parent using weighted sampling based on dominance count
 * Candidates that dominate on more tasks have higher selection probability
 * Temperature controls exploration: higher = more uniform, lower = more greedy
 */
export function selectParentWeighted(
	pareto: PerTaskPareto,
	archive: Archive,
	temperature = 1.0,
): EvaluatedCandidate | null {
	const candidatesWithCounts = Array.from(pareto.dominanceCount.entries())
		.filter(([_id, count]) => count > 0)
		.map(([id, count]) => ({ id, count }));

	if (candidatesWithCounts.length === 0) {
		// Fallback: random from archive
		const candidates = Array.from(archive.candidates.keys());
		if (candidates.length === 0) return null;
		const randomId = candidates[Math.floor(Math.random() * candidates.length)];
		if (!randomId) return null;
		const selected = archive.candidates.get(randomId);
		return selected ?? null;
	}

	// Apply temperature to dominance counts
	// temperature = 1.0: linear weighting (original behavior)
	// temperature > 1.0: more exploration (flatter distribution)
	// temperature < 1.0: more exploitation (sharper distribution)
	const weights = candidatesWithCounts.map(({ count }) =>
		Math.exp(count / temperature),
	);
	const totalWeight = weights.reduce((sum, w) => sum + w, 0);

	// Sample using cumulative probabilities
	const rand = Math.random() * totalWeight;
	let cumulative = 0;
	for (let i = 0; i < candidatesWithCounts.length; i++) {
		const weight = weights[i];
		const candidate = candidatesWithCounts[i];
		if (weight === undefined || candidate === undefined) continue;

		cumulative += weight;
		if (rand <= cumulative) {
			const selected = archive.candidates.get(candidate.id);
			return selected ?? null;
		}
	}

	// Fallback (shouldn't reach here, but just in case)
	const lastCandidate = candidatesWithCounts[candidatesWithCounts.length - 1];
	if (!lastCandidate) return null;
	return archive.candidates.get(lastCandidate.id) ?? null;
}
