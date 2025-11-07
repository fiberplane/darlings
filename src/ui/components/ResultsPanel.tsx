import { Check, ChevronDown, ChevronRight, Copy, Eye } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import type { CandidateData } from "../queries";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "./chart";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "./accordion";
import { Separator } from "./separator";

interface ResultsPanelProps {
	candidates: CandidateData[];
}

function CandidateEvolutionView({ candidates }: { candidates: CandidateData[] }) {
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null);

	// Sort candidates by iteration (generation as fallback)
	const sortedCandidates = [...candidates].sort((a, b) => {
		const aIter = a.iteration ?? a.generation ?? 0;
		const bIter = b.iteration ?? b.generation ?? 0;
		return aIter - bIter;
	});

	// Create a map for quick parent lookup
	const candidateMap = new Map(candidates.map((c) => [c.id, c]));

	function copyToClipboard(candidate: CandidateData) {
		const formatted = JSON.stringify(candidate.toolDescriptions, null, 2);
		navigator.clipboard.writeText(formatted);
		setCopiedId(candidate.id);
		setTimeout(() => setCopiedId(null), 2000);
	}

	function calculateDiff(candidateId: string): { added: number; removed: number; modified: number } | null {
		const candidate = candidateMap.get(candidateId);
		if (!candidate?.parentId) return null;

		const parent = candidateMap.get(candidate.parentId);
		if (!parent) return null;

		const candidateTools = Object.keys(candidate.toolDescriptions);
		const parentTools = Object.keys(parent.toolDescriptions);

		let modified = 0;
		for (const toolName of candidateTools) {
			if (parentTools.includes(toolName)) {
				if (candidate.toolDescriptions[toolName] !== parent.toolDescriptions[toolName]) {
					modified++;
				}
			}
		}

		const added = candidateTools.filter(t => !parentTools.includes(t)).length;
		const removed = parentTools.filter(t => !candidateTools.includes(t)).length;

		return { added, removed, modified };
	}

	return (
		<div className="space-y-4">
			{sortedCandidates.map((candidate) => {
				const parent = candidate.parentId ? candidateMap.get(candidate.parentId) : null;
				const diff = calculateDiff(candidate.id);
				const isExpanded = expandedCandidate === candidate.id;
				const iterationNum = candidate.iteration ?? candidate.generation ?? 0;

				return (
					<Card key={candidate.id} className="border-l-4 border-l-primary">
						<CardHeader className="pb-3">
							<div className="flex items-start justify-between">
								<div className="flex-1">
									<div className="flex items-center gap-3 mb-2">
										<CardTitle className="text-base">
											Iteration {iterationNum}
										</CardTitle>
										<code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
											{candidate.id.slice(0, 8)}
										</code>
										{candidate.isPareto && (
											<Badge variant="outline" className="text-xs">
												Pareto Front
											</Badge>
										)}
									</div>
									<div className="flex items-center gap-4 text-sm">
										<div>
											<span className="text-muted-foreground">Accuracy:</span>{" "}
											<span className="font-semibold">
												{(candidate.accuracy * 100).toFixed(1)}%
											</span>
										</div>
										<div>
											<span className="text-muted-foreground">Avg Length:</span>{" "}
											<span className="font-semibold">
												{Math.round(candidate.avgDescriptionLength)} chars
											</span>
										</div>
									</div>
									{parent && (
										<div className="mt-2 text-xs text-muted-foreground">
											<span>Parent: </span>
											<code className="bg-muted px-1 py-0.5 rounded">
												{parent.id.slice(0, 8)}
											</code>
											<span className="ml-2">
												({(parent.accuracy * 100).toFixed(1)}%, {Math.round(parent.avgDescriptionLength)} chars)
											</span>
											{diff && (
												<span className="ml-3">
													{diff.modified > 0 && (
														<span className="text-yellow-600">
															{diff.modified} modified
														</span>
													)}
													{diff.added > 0 && (
														<span className="text-green-600 ml-2">
															+{diff.added} added
														</span>
													)}
													{diff.removed > 0 && (
														<span className="text-red-600 ml-2">
															-{diff.removed} removed
														</span>
													)}
												</span>
											)}
										</div>
									)}
								</div>
								<div className="flex items-center gap-2">
									<Button
										variant="ghost"
										size="sm"
										onClick={() => copyToClipboard(candidate)}
									>
										{copiedId === candidate.id ? (
											<>
												<Check className="h-4 w-4 mr-1" />
												Copied
											</>
										) : (
											<>
												<Copy className="h-4 w-4 mr-1" />
												Copy
											</>
										)}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={() =>
											setExpandedCandidate(isExpanded ? null : candidate.id)
										}
									>
										{isExpanded ? (
											<>
												<ChevronDown className="h-4 w-4 mr-1" />
												Collapse
											</>
										) : (
											<>
												<ChevronRight className="h-4 w-4 mr-1" />
												Expand
											</>
										)}
									</Button>
								</div>
							</div>
						</CardHeader>
						{isExpanded && (
							<CardContent className="pt-0">
								<Separator className="mb-4" />
								<div className="space-y-4">
									{Object.entries(candidate.toolDescriptions).map(
										([toolName, description]) => {
											const parentDesc = parent?.toolDescriptions[toolName];
											const isModified = parentDesc && parentDesc !== description;
											const isNew = !parentDesc;

											return (
												<div key={toolName} className="space-y-2">
													<div className="flex items-center justify-between">
														<h4 className="font-semibold text-sm flex items-center gap-2">
															{toolName}
															{isNew && (
																<Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
																	NEW
																</Badge>
															)}
															{isModified && (
																<Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
																	MODIFIED
																</Badge>
															)}
														</h4>
														<Badge variant="outline" className="text-xs">
															{description.length} chars
														</Badge>
													</div>
													{isModified && parentDesc && (
														<div className="p-3 bg-red-50 rounded-md border border-red-200">
															<p className="text-xs text-red-700 font-semibold mb-1">
																Previous (Parent):
															</p>
															<p className="text-sm text-red-900 whitespace-pre-wrap">
																{parentDesc}
															</p>
														</div>
													)}
													<div className={`p-3 rounded-md ${isModified ? 'bg-green-50 border border-green-200' : 'bg-muted'}`}>
														{isModified && (
															<p className="text-xs text-green-700 font-semibold mb-1">
																Current:
															</p>
														)}
														<p className={`text-sm whitespace-pre-wrap ${isModified ? 'text-green-900' : ''}`}>
															{description}
														</p>
													</div>
												</div>
											);
										}
									)}
								</div>
							</CardContent>
						)}
					</Card>
				);
			})}
		</div>
	);
}

export function ResultsPanel({ candidates }: ResultsPanelProps) {
	if (candidates.length === 0) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground p-6">
				No results yet. Run an optimization to see results.
			</div>
		);
	}

	// Calculate global Pareto front
	const paretoFront = calculateParetoFront(candidates);
	const paretoIds = new Set(paretoFront.map((c) => c.id));

	// Find recommended candidates
	const bestAccuracy = paretoFront.reduce((best, curr) =>
		curr.accuracy > best.accuracy ? curr : best,
	);
	const mostCompact = paretoFront.reduce((best, curr) =>
		curr.avgDescriptionLength < best.avgDescriptionLength ? curr : best,
	);
	// Best balance: closest to top-left corner (high accuracy, low length)
	const bestBalance = paretoFront.reduce((best, curr) => {
		const currScore = curr.accuracy / 100 - curr.avgDescriptionLength / 200;
		const bestScore = best.accuracy / 100 - best.avgDescriptionLength / 200;
		return currScore > bestScore ? curr : best;
	});

	return (
		<div className="space-y-6 p-6">
			<div>
				<h2 className="text-2xl font-bold mb-2">Optimization Results</h2>
				<p className="text-muted-foreground">
					{candidates.length} candidates evaluated, {paretoFront.length} on Pareto front
				</p>
			</div>

			{/* Recommended Candidates Summary */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<Card className="border-2 border-green-500">
					<CardHeader>
						<CardTitle className="text-lg">Best Accuracy</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-1">
							<p className="text-3xl font-bold">
								{(bestAccuracy.accuracy * 100).toFixed(1)}%
							</p>
							<p className="text-sm text-muted-foreground">
								{Math.round(bestAccuracy.avgDescriptionLength)} chars avg length
							</p>
							<p className="text-xs text-muted-foreground mt-2">
								Iteration {bestAccuracy.iteration ?? bestAccuracy.generation ?? 0}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-blue-500">
					<CardHeader>
						<CardTitle className="text-lg">Best Balance</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-1">
							<p className="text-3xl font-bold">
								{(bestBalance.accuracy * 100).toFixed(1)}%
							</p>
							<p className="text-sm text-muted-foreground">
								{Math.round(bestBalance.avgDescriptionLength)} chars avg length
							</p>
							<p className="text-xs text-muted-foreground mt-2">
								Iteration {bestBalance.iteration ?? bestBalance.generation ?? 0}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-purple-500">
					<CardHeader>
						<CardTitle className="text-lg">Most Compact</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-1">
							<p className="text-3xl font-bold">
								{(mostCompact.accuracy * 100).toFixed(1)}%
							</p>
							<p className="text-sm text-muted-foreground">
								{Math.round(mostCompact.avgDescriptionLength)} chars avg length
							</p>
							<p className="text-xs text-muted-foreground mt-2">
								Iteration {mostCompact.iteration ?? mostCompact.generation ?? 0}
							</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Candidate Evolution Timeline */}
			<Card>
				<CardHeader>
					<CardTitle>Candidate Evolution</CardTitle>
					<p className="text-sm text-muted-foreground">
						Track how tool descriptions evolved through the optimization process
					</p>
				</CardHeader>
				<CardContent>
					<CandidateEvolutionView candidates={candidates} />
				</CardContent>
			</Card>

			{/* Pareto Front Visualization */}
			<Card>
				<CardHeader>
					<CardTitle>Pareto Front: Accuracy vs Description Length</CardTitle>
				</CardHeader>
				<CardContent>
					<ParetoScatterPlot
						candidates={candidates}
						paretoIds={paretoIds}
						bestAccuracy={bestAccuracy}
						bestBalance={bestBalance}
						mostCompact={mostCompact}
					/>
				</CardContent>
			</Card>
		</div>
	);
}

function calculateParetoFront(candidates: CandidateData[]): CandidateData[] {
	return candidates.filter((c1) => !candidates.some((c2) => dominates(c2, c1)));
}

function dominates(a: CandidateData, b: CandidateData): boolean {
	const aAccBetter = a.accuracy >= b.accuracy;
	const aLengthBetter = a.avgDescriptionLength <= b.avgDescriptionLength;
	const aStrictlyBetter =
		a.accuracy > b.accuracy || a.avgDescriptionLength < b.avgDescriptionLength;
	return aAccBetter && aLengthBetter && aStrictlyBetter;
}

function ParetoScatterPlot({
	candidates,
	paretoIds,
	bestAccuracy,
	bestBalance,
	mostCompact,
}: {
	candidates: CandidateData[];
	paretoIds: Set<string>;
	bestAccuracy: CandidateData;
	bestBalance: CandidateData;
	mostCompact: CandidateData;
}) {
	// Prepare data for recharts
	const chartData = candidates.map((candidate) => ({
		accuracy: candidate.accuracy * 100, // Convert to percentage
		avgLength: candidate.avgDescriptionLength,
		id: candidate.id,
		isPareto: paretoIds.has(candidate.id),
		isBestAccuracy: candidate.id === bestAccuracy.id,
		isBestBalance: candidate.id === bestBalance.id,
		isMostCompact: candidate.id === mostCompact.id,
	}));

	// Split into datasets for different colors
	const nonParetoData = chartData.filter((d) => !d.isPareto);
	const paretoData = chartData.filter(
		(d) =>
			d.isPareto && !d.isBestAccuracy && !d.isBestBalance && !d.isMostCompact,
	);
	const bestAccuracyData = chartData.filter((d) => d.isBestAccuracy);
	const bestBalanceData = chartData.filter((d) => d.isBestBalance);
	const mostCompactData = chartData.filter((d) => d.isMostCompact);

	// Calculate axis domains based on actual data range
	const accuracies = chartData.map(d => d.accuracy);
	const lengths = chartData.map(d => d.avgLength);

	const minAccuracy = Math.min(...accuracies);
	const maxAccuracy = Math.max(...accuracies);
	const minLength = Math.min(...lengths);
	const maxLength = Math.max(...lengths);

	// Add significant padding to the ranges for better visualization
	const accuracyRange = maxAccuracy - minAccuracy;
	const lengthRange = maxLength - minLength;

	// Use at least 20% of the value or 5 units, whichever is larger
	const accuracyPadding = Math.max(accuracyRange * 0.2, Math.max(minAccuracy * 0.2, 5));
	const lengthPadding = Math.max(lengthRange * 0.2, Math.max(minLength * 0.2, 5));

	const yMin = Math.max(0, minAccuracy - accuracyPadding);
	const yMax = Math.min(100, maxAccuracy + accuracyPadding);
	const xMin = Math.max(0, minLength - lengthPadding);
	const xMax = maxLength + lengthPadding;

	console.log('Chart data range:', {
		accuracy: { min: minAccuracy, max: maxAccuracy, domain: [yMin, yMax] },
		length: { min: minLength, max: maxLength, domain: [xMin, xMax] },
		dataPoints: chartData.length
	});

	const chartConfig = {
		accuracy: {
			label: "Accuracy",
		},
		avgLength: {
			label: "Avg Description Length",
		},
	};

	return (
		<ChartContainer config={chartConfig} className="h-[400px] w-full">
			<ScatterChart
				margin={{
					top: 20,
					right: 20,
					bottom: 60,
					left: 60,
				}}
			>
				<CartesianGrid strokeDasharray="3 3" />
				<XAxis
					type="number"
					dataKey="avgLength"
					name="Avg Description Length"
					domain={[xMin, xMax]}
					allowDataOverflow={false}
					scale="linear"
					label={{
						value: "Average Description Length (chars)",
						position: "bottom",
						offset: 40,
					}}
				/>
				<YAxis
					type="number"
					dataKey="accuracy"
					name="Accuracy"
					domain={[yMin, yMax]}
					allowDataOverflow={false}
					scale="linear"
					label={{
						value: "Accuracy (%)",
						angle: -90,
						position: "left",
						offset: 40,
					}}
				/>
				<ChartTooltip
					cursor={{ strokeDasharray: "3 3" }}
					content={
						<ChartTooltipContent
							formatter={(value, name) => {
								if (name === "accuracy") {
									return `${Number(value).toFixed(1)}%`;
								}
								return `${Math.round(Number(value))} chars`;
							}}
						/>
					}
				/>

				{/* Non-Pareto candidates (gray) */}
				{nonParetoData.length > 0 && (
					<Scatter
						key="scatter-non-pareto"
						name="Non-Pareto"
						data={nonParetoData}
						fill="hsl(var(--muted-foreground))"
						opacity={0.3}
					/>
				)}

				{/* Regular Pareto candidates (blue) */}
				{paretoData.length > 0 && (
					<Scatter
						key="scatter-pareto"
						name="Pareto Front"
						data={paretoData}
						fill="hsl(var(--primary))"
						opacity={0.7}
					/>
				)}

				{/* Highlighted candidates */}
				{bestAccuracyData.length > 0 && (
					<Scatter
						key="scatter-best-accuracy"
						name="Best Accuracy"
						data={bestAccuracyData}
						fill="rgb(34, 197, 94)"
						opacity={1}
						shape="star"
					/>
				)}
				{bestBalanceData.length > 0 && (
					<Scatter
						key="scatter-best-balance"
						name="Best Balance"
						data={bestBalanceData}
						fill="rgb(59, 130, 246)"
						opacity={1}
						shape="diamond"
					/>
				)}
				{mostCompactData.length > 0 && (
					<Scatter
						key="scatter-most-compact"
						name="Most Compact"
						data={mostCompactData}
						fill="rgb(168, 85, 247)"
						opacity={1}
						shape="triangle"
					/>
				)}
			</ScatterChart>
		</ChartContainer>
	);
}
