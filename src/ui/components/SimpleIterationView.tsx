import { useState } from "react";
import type { ProgressEvent } from "../../types";
import type { CandidateData } from "../queries";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { ScrollArea } from "./scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { CandidateFlowGraph } from "./CandidateFlowGraph";

interface Iteration {
	number: number;
	parentDescription: string;
	parentChars: number;
	offspringDescription: string;
	offspringChars: number;
	subsampleAccuracy: number;
	parentSubsampleAccuracy: number;
	accepted: boolean;
	rejectionReason?: string;
	testResults: Array<{
		query: string;
		correct: boolean;
		selected: string | null;
		expected: string;
	}>;
}

interface SimpleIterationViewProps {
	events: ProgressEvent[];
	liveCandidates: CandidateData[];
	currentlyEvaluatingId?: string;
}

function buildIterations(events: ProgressEvent[]): Iteration[] {
	const iterations: Iteration[] = [];
	let currentIter: Partial<Iteration> = {};

	for (const event of events) {
		if (event.type === "iteration_start" && "iteration" in event) {
			if (currentIter.number) {
				iterations.push(currentIter as Iteration);
			}
			currentIter = {
				number: event.iteration,
				testResults: [],
			};
		}

		if (event.type === "parent_selected" && "iteration" in event) {
			// We don't have parent description in events, will need to track separately
		}

		if (event.type === "reflection_done") {
			currentIter.parentDescription = event.oldDesc;
			currentIter.parentChars = event.oldDesc.length;
			currentIter.offspringDescription = event.newDesc;
			currentIter.offspringChars = event.newDesc.length;
		}

		if (event.type === "subsample_eval") {
			currentIter.subsampleAccuracy = event.subsampleScore;
			currentIter.parentSubsampleAccuracy = event.parentSubsampleScore;
		}

		if (event.type === "offspring_rejected" && "iteration" in event) {
			currentIter.accepted = false;
			currentIter.rejectionReason = event.reason;
		}

		if (event.type === "offspring_accepted" && "iteration" in event) {
			currentIter.accepted = true;
		}

		if (event.type === "evaluation" && currentIter.testResults) {
			currentIter.testResults.push({
				query: event.testCase,
				correct: event.result.correct,
				selected: event.result.selected,
				expected: event.result.expected,
			});
		}
	}

	if (currentIter.number) {
		iterations.push(currentIter as Iteration);
	}

	return iterations;
}

export function SimpleIterationView({
	events,
	liveCandidates,
	currentlyEvaluatingId,
}: SimpleIterationViewProps) {
	const iterations = buildIterations(events);
	const [selectedIter, setSelectedIter] = useState<number | null>(null);

	const selected = iterations.find((i) => i.number === selectedIter);

	return (
		<Tabs defaultValue="progress" className="h-full flex flex-col">
			<TabsList className="w-full rounded-none border-b flex-shrink-0">
				<TabsTrigger value="progress" className="flex-1">
					Progress
				</TabsTrigger>
				<TabsTrigger value="graph" className="flex-1">
					Evolution Graph
				</TabsTrigger>
			</TabsList>

			<TabsContent value="progress" className="flex-1 m-0 overflow-hidden">
				<div className="flex h-full">
			{/* Left: Iteration list */}
			<div className="w-80 border-r">
				<ScrollArea className="h-full">
					<div className="p-4 space-y-2">
						<h3 className="font-semibold text-sm text-muted-foreground mb-4">
							ITERATIONS
						</h3>
						{iterations.map((iter) => (
							<Card
								key={iter.number}
								className={`cursor-pointer transition-colors ${
									selectedIter === iter.number
										? "border-primary bg-accent"
										: "hover:bg-accent/50"
								}`}
								onClick={() => setSelectedIter(iter.number)}
							>
								<CardContent className="p-4">
									<div className="flex items-center justify-between mb-2">
										<span className="font-semibold">Iteration {iter.number}</span>
										<Badge
											variant={iter.accepted ? "default" : "destructive"}
											className="text-xs"
										>
											{iter.accepted ? "✓" : "✗"}
										</Badge>
									</div>
									<div className="text-xs space-y-1">
										<div className="flex justify-between">
											<span className="text-muted-foreground">Parent:</span>
											<span>{iter.parentChars} chars</span>
										</div>
										<div className="flex justify-between">
											<span className="text-muted-foreground">Offspring:</span>
											<span>{iter.offspringChars} chars</span>
										</div>
										<div className="flex justify-between">
											<span className="text-muted-foreground">Accuracy:</span>
											<span>
												{(iter.subsampleAccuracy * 100).toFixed(0)}%
											</span>
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				</ScrollArea>
			</div>

			{/* Right: Detail view */}
			<div className="flex-1 overflow-y-auto">
				{selected ? (
					<div className="p-6 space-y-6">
						<div className="flex items-center justify-between">
							<h2 className="text-2xl font-bold">
								Iteration {selected.number}
							</h2>
							<Badge
								variant={selected.accepted ? "default" : "destructive"}
								className="text-lg"
							>
								{selected.accepted ? "✓ ACCEPTED" : "✗ REJECTED"}
							</Badge>
						</div>

						{/* Parent Description */}
						<Card>
							<CardHeader>
								<CardTitle className="text-lg">
									Parent Description ({selected.parentChars} chars)
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="p-4 bg-muted rounded-md">
									<p className="text-sm font-mono">
										{selected.parentDescription}
									</p>
								</div>
								<div className="mt-4 text-sm">
									<span className="text-muted-foreground">
										Subsample Accuracy:
									</span>{" "}
									<span className="font-semibold">
										{(selected.parentSubsampleAccuracy * 100).toFixed(0)}%
									</span>
								</div>
							</CardContent>
						</Card>

						{/* Offspring Description */}
						<Card>
							<CardHeader>
								<CardTitle className="text-lg">
									Offspring Description ({selected.offspringChars} chars)
									<Badge variant="outline" className="ml-2 text-xs">
										{selected.offspringChars > selected.parentChars
											? `+${selected.offspringChars - selected.parentChars}`
											: selected.offspringChars - selected.parentChars}{" "}
										chars
									</Badge>
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="p-4 bg-muted rounded-md">
									<p className="text-sm font-mono">
										{selected.offspringDescription}
									</p>
								</div>
								<div className="mt-4 space-y-2">
									<div className="text-sm">
										<span className="text-muted-foreground">
											Subsample Accuracy:
										</span>{" "}
										<span className="font-semibold">
											{(selected.subsampleAccuracy * 100).toFixed(0)}%
										</span>
									</div>
									{!selected.accepted && selected.rejectionReason && (
										<div className="text-sm text-destructive">
											<span className="font-semibold">Rejected:</span>{" "}
											{selected.rejectionReason}
										</div>
									)}
								</div>
							</CardContent>
						</Card>

						{/* Test Results */}
						{selected.testResults.length > 0 && (
							<Card>
								<CardHeader>
									<CardTitle className="text-lg">
										Test Results (
										{selected.testResults.filter((t) => t.correct).length}/
										{selected.testResults.length} passed)
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="space-y-2">
										{selected.testResults.map((test, idx) => (
											<div
												key={idx}
												className={`p-3 rounded text-sm border ${
													test.correct
														? "bg-green-50 dark:bg-green-950 border-green-200"
														: "bg-red-50 dark:bg-red-950 border-red-200"
												}`}
											>
												<div className="flex items-start gap-2">
													<span className="font-semibold">
														{test.correct ? "✓" : "✗"}
													</span>
													<div className="flex-1">
														<p className="mb-1">"{test.query}"</p>
														<div className="flex gap-2 text-xs">
															<Badge
																variant={test.correct ? "default" : "destructive"}
															>
																{test.selected || "none"}
															</Badge>
															{!test.correct && (
																<Badge variant="outline">
																	expected: {test.expected}
																</Badge>
															)}
														</div>
													</div>
												</div>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						)}
					</div>
				) : (
					<div className="flex items-center justify-center h-full text-muted-foreground">
						Select an iteration to view details
					</div>
				)}
			</div>
		</div>
			</TabsContent>

			<TabsContent value="graph" className="flex-1 m-0">
				<div className="p-6">
					<CandidateFlowGraph
						candidates={liveCandidates}
						liveMode={true}
						currentlyEvaluatingId={currentlyEvaluatingId}
					/>
				</div>
			</TabsContent>
		</Tabs>
	);
}
