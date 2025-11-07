import { CheckCircle, XCircle } from "lucide-react";
import type { ProgressEvent } from "../../types";
import type { CandidateData } from "../queries";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "./accordion";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { Badge } from "./badge";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Separator } from "./separator";

interface IterationDetailProps {
	iteration: number;
	events: ProgressEvent[];
	candidates?: CandidateData[];
}

export function IterationDetail({
	iteration,
	events,
	candidates,
}: IterationDetailProps) {
	// Filter events for this iteration
	const iterationEvents = events.filter(
		(e) => "iteration" in e && e.iteration === iteration,
	);

	if (iterationEvents.length === 0) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				No data for iteration {iteration}
			</div>
		);
	}

	// Extract key events
	const parentSelected = iterationEvents.find(
		(e) => e.type === "parent_selected",
	) as Extract<ProgressEvent, { type: "parent_selected" }> | undefined;

	const reflectionStart = iterationEvents.find(
		(e) => e.type === "reflection_start",
	) as Extract<ProgressEvent, { type: "reflection_start" }> | undefined;

	const reflectionDone = iterationEvents.find(
		(e) => e.type === "reflection_done",
	) as Extract<ProgressEvent, { type: "reflection_done" }> | undefined;

	const subsampleEval = iterationEvents.find(
		(e) => e.type === "subsample_eval",
	) as Extract<ProgressEvent, { type: "subsample_eval" }> | undefined;

	const offspringRejected = iterationEvents.find(
		(e) => e.type === "offspring_rejected",
	) as Extract<ProgressEvent, { type: "offspring_rejected" }> | undefined;

	const offspringAccepted = iterationEvents.find(
		(e) => e.type === "offspring_accepted",
	) as Extract<ProgressEvent, { type: "offspring_accepted" }> | undefined;

	const candidateDone = iterationEvents.find(
		(e) => e.type === "candidate_done",
	) as Extract<ProgressEvent, { type: "candidate_done" }> | undefined;

	const evaluationEvents = iterationEvents.filter(
		(e) => e.type === "evaluation",
	) as Extract<ProgressEvent, { type: "evaluation" }>[];

	const wasAccepted = !!offspringAccepted;

	// Find parent candidate details - first try from candidates array, then from events
	let parentCandidate = candidates?.find(
		(c) => c.id === parentSelected?.candidateId,
	);

	// If not in candidates array, find it from candidate_done events
	if (!parentCandidate && parentSelected) {
		const parentDoneEvent = events.find(
			(e) =>
				e.type === "candidate_done" &&
				e.candidateId === parentSelected.candidateId,
		) as Extract<ProgressEvent, { type: "candidate_done" }> | undefined;

		if (parentDoneEvent) {
			parentCandidate = {
				id: parentDoneEvent.candidateId,
				generation: parentDoneEvent.generation,
				toolDescriptions: parentDoneEvent.toolDescriptions,
				accuracy: parentDoneEvent.accuracy,
				avgDescriptionLength: parentDoneEvent.avgLength,
				isPareto: parentDoneEvent.isPareto,
			};
		}
	}

	return (
		<div className="space-y-4 p-6">
			<div className="flex items-center justify-between">
				<h2 className="text-2xl font-bold">Iteration {iteration}</h2>
				<Badge variant={wasAccepted ? "default" : "destructive"}>
					{wasAccepted ? "✓ Accepted" : "✗ Rejected"}
				</Badge>
			</div>

			{!candidateDone && !parentSelected && (
				<Alert>
					<AlertDescription>
						No candidate data available for this iteration. This may occur if the
						iteration is still in progress or if event data is incomplete.
					</AlertDescription>
				</Alert>
			)}

			{/* Test Case Results Summary */}
			{evaluationEvents.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Test Case Results</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							<div className="flex items-center justify-between text-sm mb-4">
								<span className="text-muted-foreground">
									{evaluationEvents.filter((e) => e.result.correct).length} /{" "}
									{evaluationEvents.length} passed
								</span>
								<span className="font-semibold">
									{(
										(evaluationEvents.filter((e) => e.result.correct).length /
											evaluationEvents.length) *
										100
									).toFixed(1)}
									% accuracy
								</span>
							</div>
							<div className="grid gap-2">
								{evaluationEvents.map((evalEvent, idx) => (
									<div
										key={idx}
										className={`flex items-center gap-3 p-3 rounded text-sm border ${
											evalEvent.result.correct
												? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900"
												: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900"
										}`}
									>
										{evalEvent.result.correct ? (
											<CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
										) : (
											<XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
										)}
										<div className="flex-1 min-w-0">
											<p className="font-medium break-words mb-1">
												"{evalEvent.testCase}"
											</p>
											<div className="flex items-center gap-2 text-xs">
												<Badge
													variant={
														evalEvent.result.correct ? "default" : "destructive"
													}
													className="text-xs"
												>
													Selected: {evalEvent.result.selected || "none"}
												</Badge>
												{!evalEvent.result.correct && (
													<Badge variant="outline" className="text-xs">
														Expected: {evalEvent.result.expected}
													</Badge>
												)}
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Current Tool Descriptions */}
			{candidateDone && (
				<Card>
					<CardHeader>
						<CardTitle>Tool Descriptions (This Iteration)</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{Object.entries(candidateDone.toolDescriptions).map(
								([toolName, description]) => (
									<div key={toolName} className="space-y-1">
										<div className="flex items-center justify-between">
											<h4 className="font-semibold text-sm">{toolName}</h4>
											<Badge variant="outline" className="text-xs">
												{description.length} chars
											</Badge>
										</div>
										<div className="p-3 bg-muted rounded-md">
											<p className="text-sm whitespace-pre-wrap font-mono break-words">
												{description}
											</p>
										</div>
									</div>
								),
							)}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Parent Selection */}
			{parentSelected && (
				<Card>
					<CardHeader>
						<CardTitle>Parent Selected</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<p className="text-sm text-muted-foreground">Candidate ID</p>
								<p className="font-mono text-sm">
									{parentSelected.candidateId.slice(0, 8)}...
								</p>
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Dominance Count</p>
								<p className="text-lg font-semibold">
									{parentSelected.dominanceCount} tasks
								</p>
							</div>
						</div>

						<Separator />
						<div>
							<h4 className="font-semibold text-sm mb-3">
								Parent Tool Descriptions
							</h4>
							{parentCandidate ? (
								<div className="space-y-3">
									{Object.entries(parentCandidate.toolDescriptions).map(
										([toolName, description]) => (
											<div key={toolName} className="space-y-1">
												<div className="flex items-center justify-between">
													<p className="font-medium text-sm">{toolName}</p>
													<Badge variant="outline" className="text-xs">
														{description.length} chars
													</Badge>
												</div>
												<div className="p-3 bg-muted rounded-md">
													<p className="text-sm whitespace-pre-wrap font-mono break-words">
														{description}
													</p>
												</div>
											</div>
										),
									)}
								</div>
							) : (
								<Alert>
									<AlertDescription>
										Parent candidate tool descriptions not found in events
										history. This may happen if the parent was from generation 0
										or if events are incomplete.
									</AlertDescription>
								</Alert>
							)}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Mutation */}
			{reflectionStart && reflectionDone && (
				<Card>
					<CardHeader>
						<CardTitle>Mutation via Reflection</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<p className="text-sm text-muted-foreground mb-2">
								Tool: <strong>{reflectionDone.tool}</strong>
							</p>
							<p className="text-xs text-muted-foreground mb-2">
								Addressing failure: "{reflectionStart.failure.query}" (expected:{" "}
								{reflectionStart.failure.expected}, got:{" "}
								{reflectionStart.failure.selected || "none"})
							</p>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<p className="text-sm font-medium mb-2">Old Description</p>
								<div className="text-sm bg-red-50 dark:bg-red-950 p-3 rounded border-l-4 border-red-500">
									{reflectionDone.oldDesc}
								</div>
							</div>
							<div>
								<p className="text-sm font-medium mb-2">New Description</p>
								<div className="text-sm bg-green-50 dark:bg-green-950 p-3 rounded border-l-4 border-green-500">
									{reflectionDone.newDesc}
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Subsample Evaluation */}
			{subsampleEval && (
				<Card>
					<CardHeader>
						<CardTitle>
							Subsample Evaluation ({subsampleEval.subsampleSize} test cases)
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-2 gap-4 text-center">
							<div>
								<p className="text-sm text-muted-foreground">Offspring Score</p>
								<p className="text-3xl font-bold">
									{(subsampleEval.subsampleScore * 100).toFixed(0)}%
								</p>
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Parent Score</p>
								<p className="text-3xl font-bold">
									{(subsampleEval.parentSubsampleScore * 100).toFixed(0)}%
								</p>
							</div>
						</div>

						{/* Show which test cases were in the subsample */}
						{evaluationEvents.length > 0 &&
							evaluationEvents.length <= subsampleEval.subsampleSize && (
								<>
									<Separator />
									<div className="space-y-2">
										<p className="text-sm font-medium">Subsample Test Cases:</p>
										{evaluationEvents
											.slice(0, subsampleEval.subsampleSize)
											.map((evalEvent, idx) => (
												<div
													key={idx}
													className={`flex items-start gap-2 p-2 rounded text-sm ${
														evalEvent.result.correct
															? "bg-green-50 dark:bg-green-950"
															: "bg-red-50 dark:bg-red-950"
													}`}
												>
													{evalEvent.result.correct ? (
														<CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
													) : (
														<XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
													)}
													<div className="flex-1 min-w-0">
														<p className="italic break-words">
															"{evalEvent.testCase}"
														</p>
														<div className="flex items-center gap-2 mt-1">
															<Badge
																variant={
																	evalEvent.result.correct
																		? "default"
																		: "destructive"
																}
																className="text-xs"
															>
																{evalEvent.result.selected || "none"}
															</Badge>
															{!evalEvent.result.correct && (
																<span className="text-xs text-muted-foreground">
																	(expected: {evalEvent.result.expected})
																</span>
															)}
														</div>
													</div>
												</div>
											))}
									</div>
								</>
							)}

						<Separator />
						{wasAccepted ? (
							<Alert className="bg-green-50 dark:bg-green-950 border-green-500">
								<CheckCircle className="h-4 w-4 text-green-500" />
								<AlertTitle>Accepted</AlertTitle>
								<AlertDescription>
									Offspring improved on subsample, proceeding to full evaluation
								</AlertDescription>
							</Alert>
						) : (
							<Alert className="bg-red-50 dark:bg-red-950 border-red-500">
								<XCircle className="h-4 w-4 text-red-500" />
								<AlertTitle>Rejected</AlertTitle>
								<AlertDescription>
									{offspringRejected?.reason || "No improvement on subsample"}
								</AlertDescription>
							</Alert>
						)}
					</CardContent>
				</Card>
			)}

			{/* Full Evaluation Summary (if accepted) */}
			{wasAccepted && candidateDone && (
				<Card>
					<CardHeader>
						<CardTitle>Full Evaluation Summary</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-3 gap-4">
							<div>
								<p className="text-sm text-muted-foreground">Final Accuracy</p>
								<p className="text-2xl font-bold">
									{(candidateDone.accuracy * 100).toFixed(1)}%
								</p>
								<p className="text-xs text-muted-foreground mt-1">
									{Math.round(candidateDone.accuracy * evaluationEvents.length)} /{" "}
									{evaluationEvents.length} correct
								</p>
							</div>
							<div>
								<p className="text-sm text-muted-foreground">
									Avg Description Length
								</p>
								<p className="text-2xl font-bold">
									{Math.round(candidateDone.avgLength)}
								</p>
								<p className="text-xs text-muted-foreground mt-1">
									characters per tool
								</p>
							</div>
							{offspringAccepted && (
								<div>
									<p className="text-sm text-muted-foreground">
										Archive Position
									</p>
									<p className="text-2xl font-bold">
										#{offspringAccepted.archiveIndex}
									</p>
									<p className="text-xs text-muted-foreground mt-1">
										in Pareto archive
									</p>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
