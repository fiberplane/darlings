import "./index.css";
import {
	QueryClient,
	QueryClientProvider,
	useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { OptimizationConfig, ProgressEvent } from "../types";
import { Alert, AlertDescription, AlertTitle } from "./components/alert";
import { Button } from "./components/button";
import { ConfigPanel } from "./components/ConfigPanel";
import { Card } from "./components/card";
import { IterationDetail } from "./components/IterationDetail";
import { IterationTimeline } from "./components/IterationTimeline";
import { ResultsPanel } from "./components/ResultsPanel";
import { RunsHistoryPanel } from "./components/RunsHistoryPanel";
import { SimpleIterationView } from "./components/SimpleIterationView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/tabs";
import {
	useActiveRuns,
	useCandidates,
	useReconnectToRun,
	useStartOptimization,
} from "./queries";
import { api } from "./queries/api";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

// Build iteration status map from events
function buildIterationStatuses(
	events: ProgressEvent[],
): Map<number, "accepted" | "rejected" | "in_progress"> {
	const statuses = new Map<number, "accepted" | "rejected" | "in_progress">();

	for (const event of events) {
		if ("iteration" in event && event.iteration !== undefined) {
			const iter = event.iteration;

			if (event.type === "offspring_accepted") {
				statuses.set(iter, "accepted");
			} else if (event.type === "offspring_rejected") {
				statuses.set(iter, "rejected");
			} else if (event.type === "iteration_start") {
				if (!statuses.has(iter)) {
					statuses.set(iter, "in_progress");
				}
			}
		}
	}

	return statuses;
}

function App() {
	const [events, setEvents] = useState<ProgressEvent[]>([]);
	const [currentRunId, setCurrentRunId] = useState<string | undefined>(
		() => localStorage.getItem("currentRunId") || undefined,
	);
	const [showReconnectBanner, setShowReconnectBanner] = useState(false);
	const [isReconnecting, setIsReconnecting] = useState(false);
	const [currentIteration, setCurrentIteration] = useState<number | null>(null);
	const [optimizationComplete, setOptimizationComplete] = useState(false);
	const qc = useQueryClient();

	const { data: activeRuns = [] } = useActiveRuns();
	const { data: candidates = [] } = useCandidates(currentRunId);

	const optimizationMutation = useStartOptimization({
		onEvent: (event) => {
			if (event.type === "optimization_start") {
				setCurrentRunId(event.runId);
				localStorage.setItem("currentRunId", event.runId);
				setOptimizationComplete(false);
			}
			if (event.type === "generation_done" && currentRunId) {
				// Refetch candidates when generation is done
				qc.invalidateQueries({ queryKey: ["candidates", currentRunId] });
			}
			if (event.type === "optimization_complete") {
				setOptimizationComplete(true);
				// Refetch candidates when optimization completes to show final results
				qc.invalidateQueries({ queryKey: ["candidates", event.runId] });
			}
			setEvents((prev) => [...prev, event]);
		},
		onStart: () => {
			setEvents([]);
			setCurrentRunId(undefined);
			setOptimizationComplete(false);
			localStorage.removeItem("currentRunId");
		},
		onComplete: () => {
			// Don't remove currentRunId - keep it to show results
			qc.invalidateQueries({ queryKey: ["runs"] });
		},
	});

	// Check for active runs on mount
	useEffect(() => {
		if (activeRuns.length > 0 && !currentRunId) {
			setShowReconnectBanner(true);
		}
	}, [activeRuns, currentRunId]);

	// Set initial iteration when first events arrive
	useEffect(() => {
		if (events.length > 0 && currentIteration === null) {
			const iterationEvents = events.filter(
				(e) => "iteration" in e && e.iteration !== undefined,
			);
			if (iterationEvents.length > 0) {
				const latestIteration = Math.max(
					...iterationEvents.map((e) => (e as { iteration: number }).iteration),
				);
				setCurrentIteration(latestIteration);
			}
		}
	}, [events, currentIteration]);

	const reconnectToRun = async (runId: string) => {
		setIsReconnecting(true);
		setShowReconnectBanner(false);
		setCurrentRunId(runId);
		localStorage.setItem("currentRunId", runId);

		const reconnector = useReconnectToRun(runId, {
			onEvent: (event) => {
				if (event.type === "generation_done") {
					qc.invalidateQueries({ queryKey: ["candidates", runId] });
				}
				if (event.type === "optimization_complete") {
					setOptimizationComplete(true);
					// Refetch candidates when optimization completes to show final results
					qc.invalidateQueries({ queryKey: ["candidates", event.runId] });
				}
				setEvents((prev) => [...prev, event]);
			},
			onComplete: () => {
				setIsReconnecting(false);
				localStorage.removeItem("currentRunId");
			},
		});

		try {
			await reconnector.reconnect();
		} catch (error) {
			console.error("Reconnection failed:", error);
			setIsReconnecting(false);
		}
	};

	const dismissReconnect = () => {
		setShowReconnectBanner(false);
		localStorage.removeItem("currentRunId");
	};

	const startOptimization = (serverId: string, config: OptimizationConfig) => {
		optimizationMutation.mutate({ serverId, config });
	};

	const stopOptimization = async () => {
		if (currentRunId) {
			try {
				// Tell server to stop the optimization
				await api.stop(currentRunId);
			} catch (error) {
				console.error("Failed to stop optimization:", error);
			}
		}

		// Abort the client-side SSE connection
		optimizationMutation.abort();
		optimizationMutation.reset();

		// Clean up state
		setCurrentRunId(undefined);
		setOptimizationComplete(false);
		setEvents([]);
		setCurrentIteration(null);
		localStorage.removeItem("currentRunId");
	};

	const selectHistoricalRun = (runId: string) => {
		setCurrentRunId(runId);
		setOptimizationComplete(true);
		setEvents([]);
		setCurrentIteration(null);
		localStorage.setItem("currentRunId", runId);
		qc.invalidateQueries({ queryKey: ["candidates", runId] });
	};

	return (
		<div className="h-screen flex flex-col bg-background overflow-hidden">
			<Card className="rounded-none border-x-0 border-t-0 shadow-lg bg-primary text-primary-foreground flex-shrink-0">
				<div className="px-8 py-6">
					<h1 className="text-2xl font-semibold">
						MCP Tool Description Optimizer (GEPA)
					</h1>
				</div>
			</Card>

			{showReconnectBanner && activeRuns.length > 0 && (
				<div className="px-6 pt-6 max-w-[1800px] mx-auto w-full flex-shrink-0">
					<Alert>
						<AlertTitle>Optimization In Progress</AlertTitle>
						<AlertDescription className="flex items-center justify-between">
							<span>
								There {activeRuns.length === 1 ? "is" : "are"}{" "}
								{activeRuns.length} active optimization
								{activeRuns.length === 1 ? "" : "s"} running. Would you like to
								resume watching?
							</span>
							<div className="flex gap-2">
								<Button variant="outline" size="sm" onClick={dismissReconnect}>
									Dismiss
								</Button>
								<Button
									size="sm"
									onClick={() =>
										activeRuns[0] && reconnectToRun(activeRuns[0].id)
									}
									disabled={isReconnecting}
								>
									{isReconnecting ? "Reconnecting..." : "Resume"}
								</Button>
							</div>
						</AlertDescription>
					</Alert>
				</div>
			)}

			<div className="flex-1 flex overflow-hidden min-h-0">
				{/* Left Sidebar: Config and History */}
				<aside className="w-80 border-r overflow-y-auto h-full">
					<Tabs defaultValue="config" className="h-full flex flex-col">
						<TabsList className="w-full rounded-none border-b">
							<TabsTrigger value="config" className="flex-1">
								Config
							</TabsTrigger>
							<TabsTrigger value="history" className="flex-1">
								History
							</TabsTrigger>
						</TabsList>
						<TabsContent value="config" className="flex-1 overflow-y-auto m-0">
							<ConfigPanel
								onStart={startOptimization}
								onStop={stopOptimization}
								isRunning={optimizationMutation.isPending}
							/>
						</TabsContent>
						<TabsContent value="history" className="flex-1 overflow-hidden m-0">
							<RunsHistoryPanel
								onSelectRun={selectHistoricalRun}
								currentRunId={currentRunId}
							/>
						</TabsContent>
					</Tabs>
				</aside>

				{/* Main Content: Simple Iteration View or Results */}
				<main className="flex-1 flex flex-col overflow-hidden">
					{optimizationComplete && currentRunId ? (
						<div className="flex-1 overflow-y-auto">
							<ResultsPanel candidates={candidates} />
						</div>
					) : events.length > 0 ? (
						<SimpleIterationView events={events} />
					) : (
						<div className="flex items-center justify-center h-full text-muted-foreground">
							Start an optimization to see the evolution process
						</div>
					)}
				</main>
			</div>
		</div>
	);
}

const rootElement = document.getElementById("root");
if (rootElement) {
	const root = createRoot(rootElement);
	root.render(
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>,
	);
}
