import { useCallback, useEffect, useMemo, useState, memo } from "react";
import {
	ReactFlow,
	Background,
	Controls,
	MiniMap,
	useNodesState,
	useEdgesState,
	Handle,
	Position,
	type Node,
	type Edge,
	type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import type { CandidateData } from "../queries";
import { Badge } from "./badge";

// Types
interface CandidateNodeData extends Record<string, unknown> {
	iteration: number;
	accuracy: number;
	avgDescriptionLength: number;
	toolDescriptions: Record<string, string>;
	isExpanded: boolean;
	isBaseline: boolean;
	isEvaluating?: boolean;
	rejected?: boolean;
	rejectionReason?: string;
}

type CandidateNode = Node<CandidateNodeData, "candidate">;

// Custom Node Component
const CandidateNodeComponent = memo(
	({ id, data, selected }: NodeProps<CandidateNode>) => {
		// Grey out rejected nodes
		const isRejected = data.rejected;

		// Color code based on accuracy or rejection status
		const accuracyColor = isRejected
			? "#e5e5e5"
			: data.accuracy > 0.9
				? "#d4edda"
				: data.accuracy > 0.7
					? "#fff3cd"
					: "#f8d7da";

		const borderColor = selected
			? "#0066ff"
			: data.isEvaluating
				? "#f59e0b"
				: isRejected
					? "#999"
					: "#1a192b";

		return (
			<div
				className={`candidate-node ${selected ? "selected" : ""} ${data.isEvaluating ? "evaluating" : ""} ${isRejected ? "rejected" : ""}`}
				style={{
					position: "relative",
					padding: "12px 16px",
					borderRadius: "8px",
					border: `2px ${isRejected ? "dashed" : "solid"} ${borderColor}`,
					background: accuracyColor,
					minWidth: "220px",
					maxWidth: "220px",
					boxShadow: selected
						? "0 4px 12px rgba(0,102,255,0.3)"
						: "0 2px 4px rgba(0,0,0,0.1)",
					transition: "all 0.2s ease",
					cursor: "pointer",
					opacity: isRejected ? 0.6 : 1,
				}}
			>
				<Handle
					type="target"
					position={Position.Top}
					style={{ background: "#555" }}
				/>

				<div className="flex items-center justify-between mb-2">
					<div
						style={{
							fontWeight: 600,
							fontSize: "14px",
							display: "flex",
							alignItems: "center",
							gap: "6px",
						}}
					>
						<span>{data.isExpanded ? "▼" : "▶"}</span>
						<span>Iteration {data.iteration}</span>
					</div>
					<div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
						{data.isBaseline && (
							<Badge variant="outline" className="text-xs">
								Baseline
							</Badge>
						)}
						{isRejected && (
							<Badge
								variant="outline"
								className="text-xs bg-red-50 text-red-700 border-red-300"
							>
								Rejected
							</Badge>
						)}
						{data.isEvaluating && (
							<Badge
								variant="outline"
								className="text-xs bg-amber-50 text-amber-700 border-amber-300"
							>
								Evaluating...
							</Badge>
						)}
					</div>
				</div>

				<div style={{ fontSize: "13px", color: isRejected ? "#666" : "#333", marginBottom: "4px" }}>
					{isRejected ? (
						<>
							<div>
								<strong>Status:</strong> {data.rejectionReason || "Rejected"}
							</div>
							{data.avgDescriptionLength > 0 && (
								<div>
									<strong>Avg Length:</strong> {Math.round(data.avgDescriptionLength)}{" "}
									chars
								</div>
							)}
						</>
					) : (
						<>
							<div>
								<strong>Accuracy:</strong> {(data.accuracy * 100).toFixed(1)}%
							</div>
							<div>
								<strong>Avg Length:</strong> {Math.round(data.avgDescriptionLength)}{" "}
								chars
							</div>
						</>
					)}
				</div>

				{data.isExpanded && (
					<div
						style={{
							position: "absolute",
							top: "100%",
							left: 0,
							right: 0,
							marginTop: "8px",
							padding: "12px 16px",
							background: accuracyColor,
							border: `2px ${isRejected ? "dashed" : "solid"} ${borderColor}`,
							borderRadius: "8px",
							boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
							maxHeight: "400px",
							minWidth: "400px",
							overflowY: "auto",
							zIndex: 1000,
							opacity: isRejected ? 0.8 : 1,
						}}
					>
						{Object.keys(data.toolDescriptions).length > 0 ? (
							<div style={{ fontSize: "12px", color: isRejected ? "#666" : "#666" }}>
								{Object.entries(data.toolDescriptions).map(
									([toolName, description]) => (
										<div
											key={toolName}
											style={{ marginBottom: "12px", fontSize: "11px" }}
										>
											<div
												style={{
													fontWeight: 600,
													marginBottom: "4px",
													color: isRejected ? "#666" : "#333",
												}}
											>
												{toolName}
												<span
													style={{
														marginLeft: "6px",
														fontWeight: 400,
														color: "#999",
													}}
												>
													({description.length} chars)
												</span>
											</div>
											<div
												style={{
													padding: "6px 8px",
													background: "rgba(0,0,0,0.05)",
													borderRadius: "4px",
													whiteSpace: "pre-wrap",
													wordBreak: "break-word",
												}}
											>
												{description}
											</div>
										</div>
									),
								)}
							</div>
						) : (
							<div style={{ fontSize: "12px", color: "#999", fontStyle: "italic" }}>
								{isRejected
									? "Rejected before description generation completed"
									: "No tool descriptions available"}
							</div>
						)}
					</div>
				)}

				<Handle
					type="source"
					position={Position.Bottom}
					style={{ background: "#555" }}
				/>
			</div>
		);
	},
);

CandidateNodeComponent.displayName = "CandidateNodeComponent";

const nodeTypes = {
	candidate: CandidateNodeComponent,
};

// Layout constants
const NODE_WIDTH = 220;
const NODE_HEIGHT_COLLAPSED = 120;

// Dagre layout function
const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

function getLayoutedElements(
	nodes: Node[],
	edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
	// Clear the graph for fresh layout
	dagreGraph.setGraph({
		rankdir: "TB",
		nodesep: 60,
		ranksep: 120,
		marginx: 40,
		marginy: 60,
	});

	// Remove all existing nodes and edges
	dagreGraph.nodes().forEach((n) => dagreGraph.removeNode(n));

	// Add all nodes to graph with fixed height (expanded content is absolute positioned)
	nodes.forEach((node) => {
		dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT_COLLAPSED });
	});

	// Add all edges
	edges.forEach((edge) => {
		dagreGraph.setEdge(edge.source, edge.target);
	});

	// Run layout
	dagre.layout(dagreGraph);

	// Apply positions from Dagre
	const layoutedNodes = nodes.map((node) => {
		const nodeWithPosition = dagreGraph.node(node.id);

		return {
			...node,
			targetPosition: Position.Top,
			sourcePosition: Position.Bottom,
			position: {
				x: nodeWithPosition.x - NODE_WIDTH / 2,
				y: nodeWithPosition.y - NODE_HEIGHT_COLLAPSED / 2,
			},
		};
	});

	return { nodes: layoutedNodes, edges };
}

// Main Component
interface CandidateFlowGraphProps {
	candidates: CandidateData[];
	liveMode?: boolean;
	currentlyEvaluatingId?: string;
}

export function CandidateFlowGraph({
	candidates,
	liveMode = false,
	currentlyEvaluatingId,
}: CandidateFlowGraphProps) {
	const [nodes, setNodes, onNodesChange] =
		useNodesState<CandidateNode>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

	// Convert candidates to nodes and edges
	const { rawNodes, rawEdges } = useMemo(() => {
		// Find baseline candidate
		const baselineCandidate = candidates.find(
			(c) => c.iteration === 0 || c.generation === 0 || !c.parentId,
		);

		const rawNodes: CandidateNode[] = candidates.map((c) => ({
			id: c.id,
			type: "candidate",
			position: { x: 0, y: 0 },
			data: {
				iteration: c.iteration ?? c.generation ?? 0,
				accuracy: c.accuracy,
				avgDescriptionLength: c.avgDescriptionLength,
				toolDescriptions: c.toolDescriptions,
				isExpanded: false,
				isBaseline: c.id === baselineCandidate?.id,
				isEvaluating: liveMode && c.id === currentlyEvaluatingId,
				rejected: c.rejected,
				rejectionReason: c.rejectionReason,
			},
		}));

		const rawEdges: Edge[] = candidates
			.filter((c) => c.parentId)
			.map((c) => ({
				id: `edge-${c.parentId}-${c.id}`,
				source: c.parentId!,
				target: c.id,
				animated: liveMode && !c.rejected,
				type: "smoothstep",
				style: c.rejected
					? {
							stroke: "#999",
							strokeDasharray: "5,5",
							opacity: 0.5,
						}
					: undefined,
			}));

		return { rawNodes, rawEdges };
	}, [candidates, liveMode, currentlyEvaluatingId]);

	// Apply layout when candidates structure changes (new candidates added, not just prop updates)
	const candidateSignature = useMemo(
		() => candidates.map(c => `${c.id}-${c.parentId}-${c.rejected}`).join('|'),
		[candidates]
	);

	useEffect(() => {
		if (rawNodes.length === 0) return;

		const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
			rawNodes,
			rawEdges,
		);

		setNodes(layoutedNodes as CandidateNode[]);
		setEdges(layoutedEdges);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [candidateSignature]);

	// Toggle node expansion (doesn't trigger re-layout since expanded content is absolutely positioned)
	const onNodeClick = useCallback(
		(event: React.MouseEvent, clickedNode: Node) => {
			event.stopPropagation();
			setNodes((nds) =>
				nds.map((n) => {
					if (n.id === clickedNode.id) {
						return {
							...n,
							data: { ...n.data, isExpanded: !n.data.isExpanded },
						};
					}
					return n;
				}),
			);
		},
		[setNodes],
	);

	if (candidates.length === 0) {
		return (
			<div
				style={{
					width: "100%",
					height: liveMode ? "calc(100vh - 300px)" : "calc(100vh - 400px)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					color: "#999",
				}}
			>
				No candidates yet. {liveMode ? "Waiting for optimization to start..." : "Run an optimization to see the evolution graph."}
			</div>
		);
	}

	return (
		<div style={{
			width: "100%",
			height: liveMode ? "calc(100vh - 300px)" : "calc(100vh - 400px)",
		}}>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onNodeClick={onNodeClick}
				nodeTypes={nodeTypes}
				fitView
				fitViewOptions={{
					padding: 0.15,
					minZoom: 0.3,
					maxZoom: 1.5,
					duration: 400, // Smooth animation when fitView recalculates
				}}
				minZoom={0.1}
				maxZoom={2}
				nodesDraggable={!liveMode}
				nodesConnectable={false}
				elementsSelectable={true}
				defaultEdgeOptions={{
					animated: liveMode,
				}}
			>
				<Background />
				{!liveMode && <Controls />}
				{!liveMode && <MiniMap />}
			</ReactFlow>

			<style>{`
				.candidate-node.evaluating {
					animation: pulse 2s ease-in-out infinite;
				}

				.candidate-node.rejected {
					filter: grayscale(0.3);
				}

				@keyframes pulse {
					0%, 100% {
						box-shadow: 0 2px 4px rgba(0,0,0,0.1);
					}
					50% {
						box-shadow: 0 4px 16px rgba(245, 158, 11, 0.5);
					}
				}
			`}</style>
		</div>
	);
}
