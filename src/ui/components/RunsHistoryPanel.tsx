import { formatDistanceToNow } from "date-fns";
import type { Run } from "../queries";
import { useMCPServers, useRuns } from "../queries";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { ScrollArea } from "./scroll-area";
import { Separator } from "./separator";

interface RunsHistoryPanelProps {
	onSelectRun: (runId: string) => void;
	currentRunId?: string;
}

export function RunsHistoryPanel({
	onSelectRun,
	currentRunId,
}: RunsHistoryPanelProps) {
	const { data: runs = [], isLoading } = useRuns();
	const { data: servers = [] } = useMCPServers();

	const serverMap = new Map(servers.map((s) => [s.id, s.name]));

	const sortedRuns = [...runs].sort(
		(a, b) =>
			new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
	);

	const completedRuns = sortedRuns.filter((r) => r.status === "completed");
	const failedRuns = sortedRuns.filter((r) => r.status === "failed");
	const runningRuns = sortedRuns.filter((r) => r.status === "running");

	function getStatusBadge(status: string) {
		switch (status) {
			case "completed":
				return <Badge variant="default">Completed</Badge>;
			case "failed":
				return <Badge variant="destructive">Failed</Badge>;
			case "running":
				return <Badge variant="secondary">Running</Badge>;
			default:
				return <Badge variant="outline">{status}</Badge>;
		}
	}

	function formatDuration(startedAt: Date, completedAt: Date | null) {
		if (!completedAt) return "In progress";
		const duration = new Date(completedAt).getTime() - new Date(startedAt).getTime();
		const seconds = Math.floor(duration / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) {
			return `${hours}h ${minutes % 60}m`;
		}
		if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`;
		}
		return `${seconds}s`;
	}

	function renderRunCard(run: Run) {
		const config = JSON.parse(run.config);
		const isSelected = run.id === currentRunId;

		return (
			<Card
				key={run.id}
				className={`cursor-pointer transition-colors ${
					isSelected ? "border-primary bg-accent" : "hover:bg-accent/50"
				}`}
				onClick={() => onSelectRun(run.id)}
			>
				<CardContent className="p-4">
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								{getStatusBadge(run.status)}
								<span className="text-xs text-muted-foreground">
									{formatDistanceToNow(new Date(run.startedAt), {
										addSuffix: true,
									})}
								</span>
							</div>
							<Button
								size="sm"
								variant={isSelected ? "default" : "outline"}
								onClick={(e) => {
									e.stopPropagation();
									onSelectRun(run.id);
								}}
							>
								{isSelected ? "Selected" : "View"}
							</Button>
						</div>

						<div className="space-y-1 text-sm">
							<div className="flex justify-between">
								<span className="text-muted-foreground">Server:</span>
								<span className="font-medium">
									{serverMap.get(run.serverId) || run.serverId.slice(0, 8)}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Duration:</span>
								<span className="font-medium">
									{formatDuration(run.startedAt, run.completedAt)}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Eval Model:</span>
								<span className="font-medium">{config.evaluationModel}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Gen Model:</span>
								<span className="font-medium">{config.generationModel}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Budget:</span>
								<span className="font-medium">
									{run.maxEvaluations || config.maxEvaluations} evals
								</span>
							</div>
						</div>

						<div className="text-xs text-muted-foreground pt-2">
							ID: {run.id.slice(0, 8)}
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (isLoading) {
		return (
			<div className="p-6">
				<p className="text-muted-foreground">Loading runs...</p>
			</div>
		);
	}

	if (runs.length === 0) {
		return (
			<div className="p-6">
				<Card>
					<CardHeader>
						<CardTitle>No Optimization Runs</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground">
							Start an optimization to see results here.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<ScrollArea className="h-full">
			<div className="p-6 space-y-6">
				{runningRuns.length > 0 && (
					<div>
						<h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase">
							In Progress ({runningRuns.length})
						</h3>
						<div className="space-y-3">
							{runningRuns.map((run) => renderRunCard(run))}
						</div>
					</div>
				)}

				{runningRuns.length > 0 && completedRuns.length > 0 && (
					<Separator />
				)}

				{completedRuns.length > 0 && (
					<div>
						<h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase">
							Completed ({completedRuns.length})
						</h3>
						<div className="space-y-3">
							{completedRuns.map((run) => renderRunCard(run))}
						</div>
					</div>
				)}

				{failedRuns.length > 0 && (
					<>
						<Separator />
						<div>
							<h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase">
								Failed ({failedRuns.length})
							</h3>
							<div className="space-y-3">
								{failedRuns.map((run) => renderRunCard(run))}
							</div>
						</div>
					</>
				)}
			</div>
		</ScrollArea>
	);
}
