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

/**
 * Calculate maximum average description length across all candidates in archive
 * Used for normalizing conciseness scores
 */
function calculateMaxLength(archive: Archive): number {
	let maxLength = 0;
	for (const candidate of archive.candidates.values()) {
		if (candidate.avgDescriptionLength > maxLength) {
			maxLength = candidate.avgDescriptionLength;
		}
	}
	return maxLength;
}

/**
 * Calculate conciseness score normalized to [0, 1]
 * Shorter descriptions get higher scores
 */
function calculateConcisenessScore(
	avgLength: number,
	maxLength: number,
): number {
	if (maxLength === 0) return 1.0;
	const score = 1 - avgLength / maxLength;
	return Math.max(0, Math.min(1, score)); // Clamp to [0, 1]
}

/**
 * Calculate global weighted score combining accuracy and conciseness
 * Score = accuracy * accuracyWeight + concisenessScore * (1 - accuracyWeight)
 * Both components normalized to [0, 1], result is also in [0, 1]
 */
function calculateGlobalScore(
	candidate: EvaluatedCandidate,
	maxLength: number,
	accuracyWeight: number,
): number {
	const concisenessScore = calculateConcisenessScore(
		candidate.avgDescriptionLength,
		maxLength,
	);
	return (
		candidate.accuracy * accuracyWeight +
		concisenessScore * (1 - accuracyWeight)
	);
}

/**
 * Select parent using weighted sampling based on global scores
 * Global score combines accuracy and conciseness using accuracyWeight
 * Temperature controls exploration: higher = more uniform, lower = more greedy
 * Only candidates meeting minAccuracy threshold are eligible for selection
 */
export function selectParentWeightedByGlobalScore(
	archive: Archive,
	accuracyWeight: number,
	temperature: number,
	minAccuracy: number,
): EvaluatedCandidate | null {
	let candidates = Array.from(archive.candidates.values());
	if (candidates.length === 0) return null;

	// Filter candidates by minimum accuracy threshold
	const qualifiedCandidates = candidates.filter(
		(c) => c.accuracy >= minAccuracy,
	);

	// If no candidates meet threshold, fall back to all candidates
	// (This can happen early in optimization when only baseline exists)
	if (qualifiedCandidates.length > 0) {
		candidates = qualifiedCandidates;
	}

	// Calculate max length for normalization
	const maxLength = calculateMaxLength(archive);

	// Calculate global score for each candidate
	const candidatesWithScores = candidates.map((candidate) => ({
		candidate,
		score: calculateGlobalScore(candidate, maxLength, accuracyWeight),
	}));

	// Apply exponential weighting with temperature
	// temperature = 1.0: linear weighting on scores
	// temperature > 1.0: more exploration (flatter distribution)
	// temperature < 1.0: more exploitation (sharper distribution)
	const weights = candidatesWithScores.map(({ score }) =>
		Math.exp(score / temperature),
	);
	const totalWeight = weights.reduce((sum, w) => sum + w, 0);

	// Sample using cumulative probabilities
	const rand = Math.random() * totalWeight;
	let cumulative = 0;
	for (let i = 0; i < candidatesWithScores.length; i++) {
		const weight = weights[i];
		const item = candidatesWithScores[i];
		if (weight === undefined || item === undefined) continue;

		cumulative += weight;
		if (rand <= cumulative) {
			return item.candidate;
		}
	}

	// Fallback (shouldn't reach here, but just in case)
	const lastItem = candidatesWithScores[candidatesWithScores.length - 1];
	return lastItem?.candidate ?? null;
}
