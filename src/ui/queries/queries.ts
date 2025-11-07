import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type {
	MCPConfig,
	MCPServer,
	ModelName,
	OptimizationConfig,
	ProgressEvent,
	TestCaseRow,
	ToolRow,
} from "../../types";
import { api } from "./api";

// MCP Queries
export function useMCPServers() {
	return useQuery<MCPServer[]>({
		queryKey: ["mcp-servers"],
		queryFn: () => api.get("/api/mcp/servers"),
	});
}

export function useConnectMCP() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ name, config }: { name: string; config: MCPConfig }) =>
			api.post<{
				serverId: string;
				tools?: unknown[];
				requiresAuth?: boolean;
				authorizationUrl?: string;
			}>("/api/mcp/connect", { name, config }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
			queryClient.invalidateQueries({ queryKey: ["tools"] });
		},
	});
}

export function useDeleteServer() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ serverId }: { serverId: string }) =>
			api.delete(`/api/mcp/servers/${serverId}`),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
			queryClient.invalidateQueries({ queryKey: ["tools"] });
			queryClient.invalidateQueries({ queryKey: ["test-cases"] });
		},
	});
}

export function useOAuthAuthorize() {
	return useMutation({
		mutationFn: ({ serverId }: { serverId: string }) =>
			api.post<{ authorizationUrl: string }>("/api/mcp/oauth/authorize", {
				serverId,
			}),
	});
}

export function useOAuthRefresh() {
	return useMutation({
		mutationFn: ({ serverId }: { serverId: string }) =>
			api.post("/api/mcp/oauth/refresh", { serverId }),
	});
}

// Tool Queries
export function useTools(serverId: string | undefined) {
	return useQuery<ToolRow[]>({
		queryKey: ["tools", serverId],
		queryFn: () => api.get(`/api/mcp/tools?serverId=${serverId}`),
		enabled: !!serverId,
	});
}

export function useUpdateToolSelection() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			toolId,
			optimizationStatus,
		}: {
			toolId: string;
			optimizationStatus: "selected" | "unselected";
		}) => api.put(`/api/tools/${toolId}/selection`, { optimizationStatus }),
		onSuccess: () => {
			// Invalidate tools query - we need serverId but don't have it here
			// So we'll invalidate all tool queries
			queryClient.invalidateQueries({ queryKey: ["tools"] });
		},
	});
}

export function useSelectAllTools() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ serverId }: { serverId: string }) =>
			api.post("/api/tools/select-all", { serverId }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tools"] });
		},
	});
}

export function useDeselectAllTools() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ serverId }: { serverId: string }) =>
			api.post("/api/tools/deselect-all", { serverId }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tools"] });
		},
	});
}

// Test Queries
export function useTestCases(serverId: string | undefined) {
	return useQuery<TestCaseRow[]>({
		queryKey: ["test-cases", serverId],
		queryFn: () => api.get(`/api/tests?serverId=${serverId}`),
		enabled: !!serverId,
	});
}

export function useGenerateTests() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			serverId,
			testsPerTool,
			model,
			customPrompt,
		}: {
			serverId: string;
			testsPerTool: number;
			model: ModelName;
			customPrompt?: string;
		}) =>
			api.post("/api/tests/generate", {
				serverId,
				testsPerTool,
				model,
				customPrompt,
			}),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: ["test-cases", variables.serverId],
			});
		},
	});
}

export function useAddTestCase() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			toolId,
			query,
			expectedTool,
		}: {
			toolId: string;
			query: string;
			expectedTool: string;
		}) => api.post("/api/tests/add", { toolId, query, expectedTool }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["test-cases"] });
		},
	});
}

export function useDeleteTestCase() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ testId }: { testId: string }) =>
			api.delete(`/api/tests/${testId}`),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["test-cases"] });
		},
	});
}

// Optimization Queries
export interface CandidateData {
	id: string;
	generation: number;
	iteration: number | null;
	parentId: string | null;
	toolDescriptions: Record<string, string>;
	accuracy: number;
	avgDescriptionLength: number;
	isPareto: boolean;
}

export function useCandidates(runId: string | undefined) {
	return useQuery<CandidateData[]>({
		queryKey: ["candidates", runId],
		queryFn: () => api.get(`/api/runs/${runId}/candidates`),
		enabled: !!runId,
	});
}

export interface Run {
	id: string;
	serverId: string;
	startedAt: Date;
	completedAt: Date | null;
	config: string;
	status: string;
	maxEvaluations?: number;
	subsampleSize?: number;
}

export interface ActiveRun extends Run {
	isActive: boolean;
}

export function useRuns() {
	return useQuery<Run[]>({
		queryKey: ["runs"],
		queryFn: () => api.get("/api/runs"),
	});
}

export function useActiveRuns() {
	return useQuery<ActiveRun[]>({
		queryKey: ["active-runs"],
		queryFn: () => api.get("/api/runs/active"),
		refetchInterval: 3000, // Poll every 3 seconds
	});
}

export function useReconnectToRun(
	runId: string,
	options: {
		onEvent: (event: ProgressEvent) => void;
		onComplete?: () => void;
	},
) {
	const { onEvent, onComplete } = options;

	const reconnect = async () => {
		const controller = new AbortController();

		await api.getStream(
			`/api/runs/${runId}/stream`,
			controller.signal,
			(chunk) => {
				const lines = chunk.split("\n");
				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6);
						try {
							const event = JSON.parse(data) as ProgressEvent;
							onEvent(event);
						} catch (e) {
							console.error("Failed to parse event:", e);
						}
					}
				}
			},
		);

		onComplete?.();
	};

	return { reconnect };
}

interface UseStartOptimizationOptions {
	onEvent: (event: ProgressEvent) => void;
	onStart?: () => void;
	onError?: (error: Error) => void;
	onComplete?: () => void;
}

export function useStartOptimization(options: UseStartOptimizationOptions) {
	const { onEvent, onStart, onError, onComplete } = options;
	const abortControllerRef = useRef<AbortController | null>(null);

	const mutation = useMutation({
		mutationFn: async ({
			serverId,
			config,
		}: {
			serverId: string;
			config: OptimizationConfig;
		}) => {
			const controller = new AbortController();
			abortControllerRef.current = controller;

			await api.postStream(
				"/api/optimize/start",
				{ serverId, config },
				controller.signal,
				(chunk) => {
					const lines = chunk.split("\n");
					for (const line of lines) {
						if (line.startsWith("data: ")) {
							const data = line.slice(6);
							try {
								const event = JSON.parse(data) as ProgressEvent;
								onEvent(event);
							} catch (e) {
								console.error("Failed to parse event:", e);
							}
						}
					}
				},
			);

			return { success: true };
		},
		onMutate: () => {
			abortControllerRef.current = null;
			onStart?.();
		},
		onError: (error: Error) => {
			console.error("Optimization error:", error);
			abortControllerRef.current = null;
			onError?.(error);
		},
		onSettled: () => {
			abortControllerRef.current = null;
			onComplete?.();
		},
	});

	return {
		...mutation,
		abort: () => {
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
				abortControllerRef.current = null;
			}
		},
	};
}
