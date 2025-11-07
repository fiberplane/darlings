import { useMemo } from "react";
import type { ProgressEvent } from "../../types";
import { Badge } from "./badge";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Progress } from "./progress";
import { Separator } from "./separator";

interface MetricsPanelProps {
	events: ProgressEvent[];
}

export function MetricsPanel({ events }: MetricsPanelProps) {
	const metrics = useMemo(() => computeMetrics(events), [events]);

	return (
		<Card className="min-h-[calc(100vh-200px)] max-h-[calc(100vh-200px)] overflow-y-auto">
			<CardHeader>
				<CardTitle>Metrics</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				{metrics.bestAccuracy > 0 ? (
					<>
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<h3 className="text-lg font-semibold">Best Accuracy</h3>
								<Badge variant="default" className="text-lg px-3 py-1">
									{(metrics.bestAccuracy * 100).toFixed(1)}%
								</Badge>
							</div>
							<Progress value={metrics.bestAccuracy * 100} />
						</div>

						{metrics.paretoFront.length > 0 && (
							<>
								<Separator />
								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<h3 className="text-lg font-semibold">Pareto Front</h3>
										<Badge variant="secondary">
											{metrics.paretoFront.length}
										</Badge>
									</div>
									<div className="p-4 rounded-lg bg-muted">
										<div className="text-center text-sm font-semibold mb-2">
											Accuracy vs Description Length
										</div>
										<div className="space-y-1 text-sm">
											{metrics.paretoFront.map((c) => (
												<div key={c.id} className="flex justify-between">
													<span>• {(c.accuracy * 100).toFixed(0)}%</span>
													<span className="text-muted-foreground">
														{Math.round(c.avgLength)}
														ch
													</span>
												</div>
											))}
										</div>
									</div>
								</div>
							</>
						)}

						{metrics.accuracyByGen.length > 0 && (
							<>
								<Separator />
								<div className="space-y-4">
									<h3 className="text-lg font-semibold">Progress</h3>
									<div className="p-4 rounded-lg bg-muted">
										<div className="text-center text-sm font-semibold mb-2">
											Accuracy by Generation
										</div>
										<div className="space-y-1 text-sm">
											{metrics.accuracyByGen.map((point) => (
												<div
													key={`gen-${point.generation}`}
													className="flex justify-between"
												>
													<span>Gen {point.generation + 1}</span>
													<span className="text-muted-foreground">
														{(point.accuracy * 100).toFixed(1)}%
													</span>
												</div>
											))}
										</div>
									</div>
								</div>
							</>
						)}

						<Separator />
						<div className="space-y-4">
							<h3 className="text-lg font-semibold">Current Best</h3>
							<dl className="space-y-2 text-sm">
								<div className="flex justify-between">
									<dt className="font-semibold">Accuracy:</dt>
									<dd>{(metrics.bestAccuracy * 100).toFixed(1)}%</dd>
								</div>
								<div className="flex justify-between">
									<dt className="font-semibold">Avg Length:</dt>
									<dd>{Math.round(metrics.bestLength)} chars</dd>
								</div>
							</dl>
						</div>
					</>
				) : (
					<div className="flex items-center justify-center h-32 text-muted-foreground">
						No metrics yet
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function computeMetrics(events: ProgressEvent[]) {
	const paretoEvents = events.filter(
		(e): e is Extract<ProgressEvent, { type: "pareto_front" }> =>
			e.type === "pareto_front",
	);
	const paretoFront = paretoEvents[paretoEvents.length - 1]?.candidates || [];

	const accuracyByGen: Array<{ generation: number; accuracy: number }> = [];
	const generationDone = events.filter(
		(e): e is Extract<ProgressEvent, { type: "generation_done" }> =>
			e.type === "generation_done",
	);

	generationDone.forEach((e) => {
		accuracyByGen.push({
			generation: e.generation,
			accuracy: e.bestAccuracy,
		});
	});

	return {
		paretoFront,
		accuracyByGen,
		bestAccuracy: Math.max(...paretoFront.map((c) => c.accuracy), 0),
		bestLength:
			paretoFront.length > 0
				? Math.min(...paretoFront.map((c) => c.avgLength))
				: Infinity,
	};
}
