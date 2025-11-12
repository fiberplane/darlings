import pLimit from "p-limit";

export interface ConcurrencyConfig {
	maxConcurrentEvaluations: number;
}

export function createEvaluationLimiter(config: ConcurrencyConfig) {
	return pLimit(config.maxConcurrentEvaluations);
}

/**
 * Execute tasks with concurrency limit
 */
export async function withConcurrencyLimit<T, R>(
	items: T[],
	limit: ReturnType<typeof pLimit>,
	taskFn: (item: T) => Promise<R>,
): Promise<R[]> {
	return Promise.all(items.map((item) => limit(() => taskFn(item))));
}
