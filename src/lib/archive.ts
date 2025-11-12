import type { EvaluatedCandidate } from "../types";

/**
 * Archive structure for GEPA algorithm
 * Maintains unbounded storage of all evaluated candidates
 */
export interface Archive {
	candidates: Map<string, EvaluatedCandidate>;
	createdAt: Map<string, number>;
	parentOf: Map<string, string>;
}

/**
 * Create empty archive
 */
export function createArchive(): Archive {
	return {
		candidates: new Map(),
		createdAt: new Map(),
		parentOf: new Map(),
	};
}

/**
 * Add candidate to archive with optional parent tracking
 */
export function addToArchive(
	archive: Archive,
	candidate: EvaluatedCandidate,
	parentId?: string,
): void {
	archive.candidates.set(candidate.id, candidate);
	archive.createdAt.set(candidate.id, Date.now());
	if (parentId) {
		archive.parentOf.set(candidate.id, parentId);
	}
}

/**
 * Get total number of candidates in archive
 */
export function getArchiveSize(archive: Archive): number {
	return archive.candidates.size;
}

/**
 * Get all candidates as array
 */
export function getArchiveCandidates(archive: Archive): EvaluatedCandidate[] {
	return Array.from(archive.candidates.values());
}

/**
 * Retrieve specific candidate by ID
 */
export function getCandidateFromArchive(
	archive: Archive,
	candidateId: string,
): EvaluatedCandidate | undefined {
	return archive.candidates.get(candidateId);
}
