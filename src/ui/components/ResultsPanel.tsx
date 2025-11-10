import { Check, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { useState } from "react";
import type { CandidateData } from "../queries";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Label } from "./label";
import { Separator } from "./separator";
import { Slider } from "./slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { CandidateFlowGraph } from "./CandidateFlowGraph";

interface ResultsPanelProps {
	candidates: CandidateData[];
}

function RankedCandidateList({ candidates, isGEPA }: { candidates: CandidateData[]; isGEPA: boolean }) {
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [accuracyWeight, setAccuracyWeight] = useState(70); // 0-100 percentage

	// Calculate combined score: higher accuracy + shorter length = better
	const calculateScore = (candidate: CandidateData) => {
		const accuracyWeightDecimal = accuracyWeight / 100;
		const lengthWeightDecimal = (100 - accuracyWeight) / 100;

		const accuracyScore = candidate.accuracy * accuracyWeightDecimal;
		const maxLength = 200; // Assume reasonable max
		const lengthScore = Math.max(0, (maxLength - candidate.avgDescriptionLength) / maxLength) * lengthWeightDecimal;
		return accuracyScore + lengthScore;
	};

	// Sort by combined score (descending)
	const sortedCandidates = [...candidates].sort((a, b) => calculateScore(b) - calculateScore(a));

	// Find baseline candidate (iteration 0 or no parent)
	const baselineCandidate = candidates.find(
		c => (c.iteration === 0 || c.generation === 0) || (!c.parentId)
	);

	function copyToClipboard(candidate: CandidateData) {
		const formatted = JSON.stringify(candidate.toolDescriptions, null, 2);
		navigator.clipboard.writeText(formatted);
		setCopiedId(candidate.id);
		setTimeout(() => setCopiedId(null), 2000);
	}

	const concisenessWeight = 100 - accuracyWeight;

	return (
		<div className="space-y-6">
			{/* Weight Controls */}
			<div className="p-4 bg-muted/30 rounded-lg border">
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<Label htmlFor="accuracy-weight" className="text-sm font-medium">
							Ranking Weights
						</Label>
						<div className="text-sm text-muted-foreground">
							Accuracy: <span className="font-semibold">{accuracyWeight}%</span> • Conciseness: <span className="font-semibold">{concisenessWeight}%</span>
						</div>
					</div>
					<Slider
						id="accuracy-weight"
						min={0}
						max={100}
						step={5}
						value={[accuracyWeight]}
						onValueChange={(value) => {
							const newValue = value[0];
							if (newValue !== undefined) {
								setAccuracyWeight(newValue);
							}
						}}
					/>
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>Prioritize Conciseness</span>
						<span>Prioritize Accuracy</span>
					</div>
				</div>
			</div>

			{/* Candidate List */}
			<div className="space-y-3">
				{sortedCandidates.map((candidate, index) => {
				const rank = index + 1;
				const iterationNum = candidate.iteration ?? candidate.generation ?? 0;
				const isBaseline = candidate.id === baselineCandidate?.id;

				// Count evaluations from the evaluations array if available
				const totalEvals = candidate.evaluations?.length ?? 0;
				const passedEvals = candidate.evaluations?.filter(e => e.correct).length ?? 0;

				return (
					<Card key={candidate.id} className={`${rank === 1 ? 'border-2 border-green-500' : ''}`}>
						<CardContent className="pt-6">
							<div className="flex items-start gap-4 mb-4">
								<div className={`text-3xl font-bold ${rank === 1 ? 'text-green-600' : 'text-muted-foreground'} flex-shrink-0`}>
									#{rank}
								</div>
								<div className="flex-1">
									<div className="flex items-center gap-2 mb-2">
										<span className="text-sm text-muted-foreground">
											{isGEPA ? `Iteration ${iterationNum}` : `Candidate ${rank}`}
										</span>
										<code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
											{candidate.id.slice(0, 8)}
										</code>
										{isBaseline && (
											<Badge variant="outline" className="text-xs">
												Baseline
											</Badge>
										)}
									</div>
									<div className="flex items-center gap-6 mb-3">
										<div>
											<div className="text-3xl font-bold">
												{(candidate.accuracy * 100).toFixed(1)}%
											</div>
											<div className="text-sm text-muted-foreground">
												{passedEvals}/{totalEvals} evals passed
											</div>
										</div>
										<div className="text-sm text-muted-foreground">
											{Math.round(candidate.avgDescriptionLength)} chars avg
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => copyToClipboard(candidate)}
											className="ml-auto"
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
									</div>
									<Separator className="mb-4" />
									<div className="space-y-4">
										{Object.entries(candidate.toolDescriptions).map(
											([toolName, description]) => {
												return (
													<div key={toolName} className="space-y-2">
														<div className="flex items-center justify-between">
															<h4 className="font-semibold text-sm">
																{toolName}
															</h4>
															<Badge variant="outline" className="text-xs">
																{description.length} chars
															</Badge>
														</div>
														<div className="p-3 rounded-md bg-muted">
															<p className="text-sm whitespace-pre-wrap">
																{description}
															</p>
														</div>
													</div>
												);
											}
										)}
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				);
			})}
			</div>
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

	// Detect optimizer type: if any candidate has parentId, it's GEPA, otherwise Golden
	const isGEPA = candidates.some(c => c.parentId !== undefined && c.parentId !== null);

	// Calculate global Pareto front
	const paretoFront = calculateParetoFront(candidates);

	return (
		<div className="space-y-6 p-6">
			<div>
				<h2 className="text-2xl font-bold mb-2">Optimization Results</h2>
				<p className="text-muted-foreground">
					{candidates.length} candidates evaluated, {paretoFront.length} on Pareto front
				</p>
			</div>

			<Tabs defaultValue="ranked" className="w-full">
				<TabsList className="w-full">
					<TabsTrigger value="ranked" className="flex-1">
						Ranked List
					</TabsTrigger>
					<TabsTrigger value="graph" className="flex-1">
						Evolution Graph
					</TabsTrigger>
				</TabsList>

				<TabsContent value="ranked">
					{/* Ranked Candidate List */}
					<Card>
						<CardHeader>
							<CardTitle>Results Ranked by Score</CardTitle>
							<p className="text-sm text-muted-foreground">
								Adjust the slider to balance between accuracy and conciseness
							</p>
						</CardHeader>
						<CardContent>
							<RankedCandidateList candidates={candidates} isGEPA={isGEPA} />
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="graph">
					<Card>
						<CardHeader>
							<CardTitle>Candidate Evolution Graph</CardTitle>
							<p className="text-sm text-muted-foreground">
								Interactive tree showing how candidates evolved through optimization
							</p>
						</CardHeader>
						<CardContent>
							<CandidateFlowGraph
								candidates={candidates}
								liveMode={false}
							/>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
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
