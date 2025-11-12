import { useEffect, useRef, useState } from "react";
import type { ProgressEvent } from "../../types";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { ScrollArea } from "./scroll-area";
import { Separator } from "./separator";

interface ActivityFeedProps {
	events: ProgressEvent[];
}

export function ActivityFeed({ events }: ActivityFeedProps) {
	const scrollAreaRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// Auto-scroll to bottom - find the viewport element inside ScrollArea
		if (scrollAreaRef.current) {
			const viewport = scrollAreaRef.current.querySelector(
				"[data-radix-scroll-area-viewport]",
			) as HTMLElement;
			if (viewport) {
				viewport.scrollTop = viewport.scrollHeight;
			}
		}
	});

	return (
		<Card className="h-[calc(100vh-200px)] flex flex-col">
			<CardHeader className="flex-shrink-0">
				<CardTitle>Activity Feed</CardTitle>
			</CardHeader>
			<CardContent className="flex-1 min-h-0 overflow-hidden p-0 flex flex-col">
				{events.length === 0 ? (
					<div className="flex items-center justify-center h-full text-muted-foreground p-6">
						Waiting for optimization to start...
					</div>
				) : (
					<div className="flex-1 min-h-0">
						<ScrollArea className="h-full" ref={scrollAreaRef}>
							<div className="p-6 space-y-2">
								{events.map((event, i) => {
									const key =
										"candidateId" in event
											? `${event.type}-${event.candidateId}-${i}`
											: "generation" in event && event.generation !== undefined
												? `${event.type}-${event.generation}-${i}`
												: `${event.type}-${i}`;
									return <EventRow key={key} event={event} />;
								})}
							</div>
						</ScrollArea>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function EventRow({ event }: { event: ProgressEvent }) {
	const [expanded, setExpanded] = useState(false);

	switch (event.type) {
		case "generation_start":
			return (
				<div className="p-3 rounded-lg border-l-4 border-l-primary bg-primary/5">
					<div className="font-semibold">
						Generation {(event.generation ?? 0) + 1}
					</div>
					<div className="text-sm text-muted-foreground">started</div>
				</div>
			);

		case "candidate_start":
			return (
				<div className="p-3 rounded-lg border bg-card">
					<div className="text-sm">
						Evaluating candidate (Gen{" "}
						{(event.generation ?? event.iteration ?? 0) + 1})
					</div>
				</div>
			);

		case "evaluation":
			return (
				<div
					className={`p-3 rounded-lg border-l-4 ${
						event.result.correct
							? "border-l-green-500 bg-green-50 dark:bg-green-950"
							: "border-l-red-500 bg-red-50 dark:bg-red-950"
					}`}
				>
					<div className="flex items-center gap-2">
						<span className="font-semibold">
							{event.result.correct ? "✓" : "✗"}
						</span>
						<span className="italic text-sm">"{event.testCase}"</span>
						<span>→</span>
						<Badge variant={event.result.correct ? "default" : "destructive"}>
							{event.result.selected || "none"}
						</Badge>
					</div>
					{!event.result.correct && (
						<div className="text-sm text-muted-foreground mt-1">
							Expected: {event.result.expected}
						</div>
					)}
				</div>
			);

		case "reflection_start":
			return (
				<div className="p-3 rounded-lg border bg-card">
					<div className="flex items-center gap-2">
						<span>🔄</span>
						<span>
							Reflecting on <strong>{event.tool}</strong> failure...
						</span>
					</div>
				</div>
			);

		case "reflection_done":
			return (
				<div className="p-3 rounded-lg border bg-card">
					<Button
						variant="ghost"
						className="w-full justify-between h-auto p-0 hover:bg-transparent"
						onClick={() => setExpanded(!expanded)}
					>
						<div className="flex items-center gap-2">
							<span>🔄</span>
							<span>
								Mutated: <strong>{event.tool}</strong>
							</span>
						</div>
						<span className="text-sm text-muted-foreground">
							{expanded ? "▼" : "▶"}
						</span>
					</Button>
					{expanded && (
						<div className="mt-3 space-y-2">
							<Separator />
							<div className="grid gap-2">
								<div className="p-2 rounded bg-yellow-50 dark:bg-yellow-950 border-l-4 border-l-yellow-500">
									<div className="text-sm font-semibold mb-1">Old:</div>
									<div className="text-sm">{event.oldDesc}</div>
								</div>
								<div className="p-2 rounded bg-blue-50 dark:bg-blue-950 border-l-4 border-l-blue-500">
									<div className="text-sm font-semibold mb-1">New:</div>
									<div className="text-sm">{event.newDesc}</div>
								</div>
							</div>
						</div>
					)}
				</div>
			);

		case "candidate_done":
			return (
				<div className="p-3 rounded-lg border-l-4 border-l-green-500 bg-green-50 dark:bg-green-950">
					<div className="font-semibold">✓ Candidate complete</div>
					<div className="text-sm text-muted-foreground mt-1">
						Accuracy: {(event.accuracy * 100).toFixed(1)}%, Avg len:{" "}
						{Math.round(event.avgLength)} chars
					</div>
				</div>
			);

		case "pareto_front":
			return (
				<div className="p-3 rounded-lg border-l-4 border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950">
					<div className="flex items-center gap-2">
						<span>📊</span>
						<span>
							Pareto front: <strong>{event.candidates.length}</strong>{" "}
							candidates
						</span>
					</div>
				</div>
			);

		case "generation_done":
			return (
				<div className="p-3 rounded-lg border-l-4 border-l-primary bg-primary/5">
					<div className="font-semibold">
						Generation {(event.generation ?? 0) + 1}
					</div>
					<div className="text-sm text-muted-foreground">
						Best accuracy: {(event.bestAccuracy * 100).toFixed(1)}%
					</div>
				</div>
			);

		case "mutation_start":
			return (
				<div className="p-3 rounded-lg border bg-card">
					<div className="flex items-center gap-2">
						<span>🧬</span>
						<span>Mutating candidate...</span>
					</div>
				</div>
			);

		default:
			return null;
	}
}
