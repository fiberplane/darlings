import { evaluateCandidate } from './evaluator';
import { mutateViaReflection } from './mutator';
import type { OptimizationConfig, Tool, TestCase, Candidate, EvaluatedCandidate, ProgressEvent } from '../types';

export type GEPAConfig = OptimizationConfig & {
  tools: Tool[];
  testCases: TestCase[];
  onProgress: (event: ProgressEvent) => void;
};

/**
 * Run the GEPA (Genetic-Pareto) optimization algorithm
 */
export async function runGEPA(config: GEPAConfig): Promise<EvaluatedCandidate[]> {
  const emit = (event: ProgressEvent) => config.onProgress(event);

  // Initialize population with original tools + random variations
  let population = initializePopulation(config.tools, config.populationSize);

  for (let gen = 0; gen < config.iterations; gen++) {
    emit({ type: "generation_start", generation: gen });

    // Evaluate all candidates
    const evaluated: EvaluatedCandidate[] = [];

    for (const candidate of population) {
      emit({
        type: "candidate_start",
        candidateId: candidate.id,
        generation: gen
      });

      const result = await evaluateCandidate(
        candidate,
        config.testCases,
        config.model,
        emit
      );
      evaluated.push(result);

      emit({
        type: "candidate_done",
        candidateId: candidate.id,
        accuracy: result.accuracy,
        avgLength: result.avgDescriptionLength
      });
    }

    // Get Pareto front (non-dominated solutions)
    const paretoFront = getParetoFront(evaluated);
    emit({
      type: "pareto_front",
      candidates: paretoFront.map(c => ({
        id: c.id,
        accuracy: c.accuracy,
        avgLength: c.avgDescriptionLength,
      }))
    });

    // If last generation, we're done
    if (gen === config.iterations - 1) {
      const bestAccuracy = Math.max(...evaluated.map(e => e.accuracy));
      emit({
        type: "generation_done",
        generation: gen,
        bestAccuracy
      });
      return paretoFront;
    }

    // Select parents from Pareto front
    const numParents = Math.max(1, Math.floor(config.populationSize / 2));
    const parents = selectParents(paretoFront, numParents);

    // Generate offspring via LLM reflection
    const offspring: Candidate[] = [];
    for (const parent of parents) {
      emit({
        type: "mutation_start",
        candidateId: parent.id
      });

      const mutated = await mutateViaReflection(
        parent,
        config.testCases,
        config.model,
        emit
      );
      offspring.push(mutated);
    }

    // Next generation = Pareto front + offspring
    population = [...paretoFront, ...offspring]
      .slice(0, config.populationSize);

    const bestAccuracy = Math.max(...evaluated.map(e => e.accuracy));
    emit({
      type: "generation_done",
      generation: gen,
      bestAccuracy
    });
  }

  // Final evaluation
  const finalEvaluated: EvaluatedCandidate[] = [];
  for (const candidate of population) {
    const result = await evaluateCandidate(
      candidate,
      config.testCases,
      config.model,
      emit
    );
    finalEvaluated.push(result);
  }

  return getParetoFront(finalEvaluated);
}

/**
 * Initialize population with original tools
 */
function initializePopulation(tools: Tool[], size: number): Candidate[] {
  const original: Candidate = {
    id: crypto.randomUUID(),
    tools: tools,
  };

  // Start with original + duplicates (will be mutated in first generation)
  return Array(size).fill(null).map(() => ({
    id: crypto.randomUUID(),
    tools: tools,
  }));
}

/**
 * Get Pareto front (non-dominated solutions)
 */
function getParetoFront(candidates: EvaluatedCandidate[]): EvaluatedCandidate[] {
  return candidates.filter(c1 =>
    !candidates.some(c2 => dominates(c2, c1))
  );
}

/**
 * Check if candidate a dominates candidate b
 */
function dominates(a: EvaluatedCandidate, b: EvaluatedCandidate): boolean {
  // a dominates b if:
  // - a is >= b on all objectives AND
  // - a is strictly > b on at least one objective

  const aAccBetter = a.accuracy >= b.accuracy;
  const aComplexBetter = a.avgDescriptionLength <= b.avgDescriptionLength;
  const aStrictlyBetter =
    a.accuracy > b.accuracy ||
    a.avgDescriptionLength < b.avgDescriptionLength;

  return aAccBetter && aComplexBetter && aStrictlyBetter;
}

/**
 * Select parents from Pareto front using tournament selection
 */
function selectParents(
  paretoFront: EvaluatedCandidate[],
  count: number
): EvaluatedCandidate[] {
  if (paretoFront.length === 0) {
    return [];
  }

  const parents: EvaluatedCandidate[] = [];

  for (let i = 0; i < count; i++) {
    // Tournament selection: pick 3 random candidates, choose best
    const tournament = Array(Math.min(3, paretoFront.length))
      .fill(null)
      .map(() => paretoFront[Math.floor(Math.random() * paretoFront.length)]);

    const winner = tournament.reduce((best, curr) =>
      curr.accuracy > best.accuracy ? curr : best
    );

    parents.push(winner);
  }

  return parents;
}
