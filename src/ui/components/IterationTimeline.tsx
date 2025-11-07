import { CheckCircle, Clock, XCircle } from "lucide-react";
import { Button } from "./button";

interface IterationTimelineProps {
	totalIterations: number;
	currentIteration: number | null;
	onSelectIteration: (idx: number) => void;
	iterationStatuses: Map<number, "accepted" | "rejected" | "in_progress">;
}

export function IterationTimeline({
	totalIterations,
	currentIteration,
	onSelectIteration,
	iterationStatuses,
}: IterationTimelineProps) {
	return (
		<div className="p-4 border-b bg-muted/30">
			<div className="flex items-center gap-2 overflow-x-auto">
				<span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
					Iterations:
				</span>
				<div className="flex items-center gap-1">
					{Array.from({ length: totalIterations }, (_, i) => {
						const iteration = i + 1;
						const status = iterationStatuses.get(iteration);
						const isSelected = currentIteration === iteration;

						return (
							<Button
								key={iteration}
								variant={isSelected ? "default" : "outline"}
								size="sm"
								onClick={() => onSelectIteration(iteration)}
								className="relative min-w-[48px]"
							>
								{iteration}
								{status === "accepted" && (
									<CheckCircle className="absolute -top-1 -right-1 h-3 w-3 text-green-500" />
								)}
								{status === "rejected" && (
									<XCircle className="absolute -top-1 -right-1 h-3 w-3 text-red-500" />
								)}
								{status === "in_progress" && (
									<Clock className="absolute -top-1 -right-1 h-3 w-3 text-blue-500 animate-pulse" />
								)}
							</Button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
