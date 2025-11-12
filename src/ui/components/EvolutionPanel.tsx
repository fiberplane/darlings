import { useMemo, useState } from "react";
import type { CandidateData } from "../queries";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { ScrollArea } from "./scroll-area";
import { Separator } from "./separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

interface EvolutionPanelProps {
	candidates: CandidateData[];
}

export function EvolutionPanel({ candidates }: EvolutionPanelProps) {
	const [selectedTool, setSelectedTool] = useState<string | null>(null);
	const [expandedGen, setExpandedGen] = useState<number | null>(null);

	const { generationData, toolNames, baselineDescriptions } = useMemo(() => {
		const genMap = new Map<number, CandidateData[]>();
		const toolNamesSet = new Set<string>();
		let baseline: Record<string, string> = {};

		for (const candidate of candidates) {
			if (!genMap.has(candidate.generation)) {
				genMap.set(candidate.generation, []);
			}
			genMap.get(candidate.generation)?.push(candidate);

			// Collect all tool names
			for (const toolName of Object.keys(candidate.toolDescriptions)) {
				toolNamesSet.add(toolName);
			}

			// Use generation 0 as baseline
			if (candidate.generation === 0 && Object.keys(baseline).length === 0) {
				baseline = candidate.toolDescriptions;
			}
		}

		const gens = Array.from(genMap.entries())
			.sort(([a], [b]) => a - b)
			.map(([gen, cands]) => ({
				generation: gen,
				candidates: cands.sort((a, b) => b.accuracy - a.accuracy),
			}));

		return {
			generationData: gens,
			toolNames: Array.from(toolNamesSet).sort(),
			baselineDescriptions: baseline,
		};
	}, [candidates]);

	if (candidates.length === 0) {
		return (
			<Card className="min-h-[calc(100vh-200px)] max-h-[calc(100vh-200px)] overflow-y-auto">
				<CardHeader>
					<CardTitle>Evolution History</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center h-32 text-muted-foreground">
						No evolution data yet
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="min-h-[calc(100vh-200px)] max-h-[calc(100vh-200px)] flex flex-col">
			<CardHeader>
				<CardTitle>Evolution History</CardTitle>
			</CardHeader>
			<CardContent className="flex-1 overflow-hidden p-0">
				<Tabs defaultValue="by-generation" className="h-full flex flex-col">
					<TabsList className="mx-6 mt-4">
						<TabsTrigger value="by-generation">By Generation</TabsTrigger>
						<TabsTrigger value="by-tool">By Tool</TabsTrigger>
					</TabsList>

					<TabsContent
						value="by-generation"
						className="flex-1 overflow-hidden m-0"
					>
						<ScrollArea className="h-full">
							<div className="p-6 space-y-4">
								{generationData.map(
									({ generation, candidates: genCandidates }) => {
										const bestCandidate = genCandidates[0];
										const isExpanded = expandedGen === generation;

										if (!bestCandidate) return null;

										return (
											<div key={generation} className="border rounded-lg">
												<Button
													variant="ghost"
													className="w-full justify-between p-4 h-auto"
													onClick={() =>
														setExpandedGen(isExpanded ? null : generation)
													}
												>
													<div className="flex items-center gap-3">
														<span className="font-semibold">
															Generation {generation + 1}
														</span>
														<Badge variant="secondary">
															{genCandidates.length} candidates
														</Badge>
														<Badge variant="default">
															Best: {(bestCandidate.accuracy * 100).toFixed(1)}%
														</Badge>
													</div>
													<span className="text-muted-foreground">
														{isExpanded ? "▼" : "▶"}
													</span>
												</Button>

												{isExpanded && (
													<div className="p-4 space-y-4 border-t">
														{genCandidates.map((candidate, idx) => (
															<CandidateCard
																key={candidate.id}
																candidate={candidate}
																rank={idx + 1}
																baseline={
																	generation === 0
																		? undefined
																		: baselineDescriptions
																}
															/>
														))}
													</div>
												)}
											</div>
										);
									},
								)}
							</div>
						</ScrollArea>
					</TabsContent>

					<TabsContent value="by-tool" className="flex-1 overflow-hidden m-0">
						<div className="h-full flex">
							<div className="w-48 border-r">
								<ScrollArea className="h-full">
									<div className="p-4 space-y-2">
										{toolNames.map((toolName) => (
											<Button
												key={toolName}
												variant={
													selectedTool === toolName ? "secondary" : "ghost"
												}
												className="w-full justify-start text-sm"
												onClick={() => setSelectedTool(toolName)}
											>
												{toolName}
											</Button>
										))}
									</div>
								</ScrollArea>
							</div>

							<div className="flex-1">
								{selectedTool ? (
									<ToolEvolution
										toolName={selectedTool}
										generationData={generationData}
										baseline={baselineDescriptions[selectedTool] ?? ""}
									/>
								) : (
									<div className="flex items-center justify-center h-full text-muted-foreground">
										Select a tool to view its evolution
									</div>
								)}
							</div>
						</div>
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}

function CandidateCard({
	candidate,
	rank,
	baseline,
}: {
	candidate: CandidateData;
	rank: number;
	baseline?: Record<string, string>;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="border rounded-lg">
			<Button
				variant="ghost"
				className="w-full justify-between p-3 h-auto"
				onClick={() => setExpanded(!expanded)}
			>
				<div className="flex items-center gap-2">
					<span className="font-semibold">#{rank}</span>
					{candidate.isPareto && (
						<Badge variant="default" className="text-xs">
							Pareto
						</Badge>
					)}
					<span className="text-sm text-muted-foreground">
						{(candidate.accuracy * 100).toFixed(1)}% ·{" "}
						{Math.round(candidate.avgDescriptionLength)} ch
					</span>
				</div>
				<span className="text-sm text-muted-foreground">
					{expanded ? "▼" : "▶"}
				</span>
			</Button>

			{expanded && (
				<div className="p-3 border-t space-y-3">
					{Object.entries(candidate.toolDescriptions).map(
						([toolName, description]) => {
							const baselineDesc = baseline?.[toolName];
							const hasChanged = baselineDesc && baselineDesc !== description;

							return (
								<div key={toolName} className="space-y-2">
									<div className="font-semibold text-sm">{toolName}</div>
									{hasChanged ? (
										<div className="grid gap-2">
											<div className="p-2 rounded bg-red-50 dark:bg-red-950 border-l-4 border-l-red-500">
												<div className="text-xs font-semibold mb-1 text-red-700 dark:text-red-400">
													Baseline:
												</div>
												<div className="text-xs">{baselineDesc}</div>
											</div>
											<div className="p-2 rounded bg-green-50 dark:bg-green-950 border-l-4 border-l-green-500">
												<div className="text-xs font-semibold mb-1 text-green-700 dark:text-green-400">
													Optimized:
												</div>
												<div className="text-xs">{description}</div>
											</div>
										</div>
									) : (
										<div className="p-2 rounded bg-muted text-xs">
											{description}
										</div>
									)}
								</div>
							);
						},
					)}
				</div>
			)}
		</div>
	);
}

function ToolEvolution({
	toolName,
	generationData,
	baseline,
}: {
	toolName: string;
	generationData: Array<{
		generation: number;
		candidates: CandidateData[];
	}>;
	baseline: string;
}) {
	return (
		<ScrollArea className="h-full">
			<div className="p-6 space-y-4">
				<div className="space-y-2">
					<h3 className="font-semibold">Baseline Description</h3>
					<div className="p-3 rounded bg-muted text-sm">{baseline}</div>
				</div>

				<Separator />

				{generationData.map(({ generation, candidates }) => {
					// Get all unique descriptions in this generation
					const descriptionsInGen = new Map<string, CandidateData[]>();
					for (const candidate of candidates) {
						const desc = candidate.toolDescriptions[toolName];
						if (desc) {
							if (!descriptionsInGen.has(desc)) {
								descriptionsInGen.set(desc, []);
							}
							descriptionsInGen.get(desc)?.push(candidate);
						}
					}

					if (descriptionsInGen.size === 0) {
						return null;
					}

					return (
						<div key={generation} className="space-y-3">
							<div className="flex items-center gap-2">
								<h4 className="font-semibold">Generation {generation + 1}</h4>
								<Badge variant="secondary" className="text-xs">
									{descriptionsInGen.size} variant
									{descriptionsInGen.size !== 1 ? "s" : ""}
								</Badge>
							</div>

							<div className="space-y-2">
								{Array.from(descriptionsInGen.entries()).map(
									([desc, cands], idx) => {
										const hasChanged = desc !== baseline;
										const bestCandidate = cands.reduce((best, curr) =>
											curr.accuracy > best.accuracy ? curr : best,
										);

										return (
											<div
												key={idx}
												className={`p-3 rounded border-l-4 ${
													hasChanged
														? "bg-blue-50 dark:bg-blue-950 border-l-blue-500"
														: "bg-muted border-l-gray-300"
												}`}
											>
												<div className="flex items-center gap-2 mb-2">
													<span className="text-xs font-semibold">
														{cands.length} candidate
														{cands.length !== 1 ? "s" : ""}
													</span>
													<Badge variant="outline" className="text-xs">
														{(bestCandidate.accuracy * 100).toFixed(1)}%
													</Badge>
													{hasChanged && (
														<Badge variant="default" className="text-xs">
															Modified
														</Badge>
													)}
												</div>
												<div className="text-sm">{desc}</div>
											</div>
										);
									},
								)}
							</div>
						</div>
					);
				})}
			</div>
		</ScrollArea>
	);
}
