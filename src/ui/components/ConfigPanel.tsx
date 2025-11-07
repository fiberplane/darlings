import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { MODEL_PROVIDERS } from "../../lib/constants";
import type { MCPConfig, ModelName, OptimizationConfig } from "../../types";
import {
	useAddTestCase,
	useConnectMCP,
	useDeleteServer,
	useDeleteTestCase,
	useDeselectAllTools,
	useGenerateTests,
	useMCPServers,
	useOAuthAuthorize,
	useSelectAllTools,
	useTestCases,
	useTools,
	useUpdateToolSelection,
} from "../queries";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "./alert-dialog";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Input } from "./input";
import { Label } from "./label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./select";
import { Separator } from "./separator";
import { Slider } from "./slider";

interface ConfigPanelProps {
	onStart: (serverId: string, config: OptimizationConfig) => void;
	onStop: () => void | Promise<void>;
	isRunning: boolean;
}

function formatModelName(modelName: string): string {
	// Handle special cases
	if (modelName.startsWith("gpt-")) {
		return modelName
			.split("-")
			.map((word, index) => {
				if (index === 0) return "GPT";
				return word.toUpperCase();
			})
			.join("-");
	}

	// Handle Claude models and others
	const parts = modelName.split("-");
	return parts
		.map((word, index) => {
			// Capitalize first letter of each word
			const capitalized = word.charAt(0).toUpperCase() + word.slice(1);
			// Handle version numbers (e.g., "4-5" -> "4.5")
			if (index > 0 && /^\d+$/.test(word) && index < parts.length - 1) {
				const nextWord = parts[index + 1];
				if (nextWord && /^\d+$/.test(nextWord)) {
					return word;
				}
			}
			return capitalized;
		})
		.join(" ")
		.replace(/(\d+) (\d+)/g, "$1.$2"); // Convert "4 5" to "4.5"
}

export function ConfigPanel({ onStart, onStop, isRunning }: ConfigPanelProps) {
	const [selectedServer, setSelectedServer] = useState<string>("");

	// Configuration
	const [maxEvaluations, setMaxEvaluations] = useState(500);
	const [subsampleSize, setSubsampleSize] = useState(5);
	const [testsPerTool, setTestsPerTool] = useState(5);
	const [model, setModel] = useState<ModelName>("claude-haiku-4-5");
	const [maxConcurrentEvaluations, _setMaxConcurrentEvaluations] = useState(3);
	const [customTestPrompt, setCustomTestPrompt] = useState("");

	// MCP connection
	const [mcpType, setMcpType] = useState<"stdio" | "http">("http");
	const [mcpCommand, setMcpCommand] = useState("");
	const [mcpArgs, setMcpArgs] = useState("");
	const [mcpUrl, setMcpUrl] = useState("");
	const [mcpName, setMcpName] = useState("");
	const [, setPendingAuthServerId] = useState<string | null>(null);

	// Alert state
	const [alertMessage, setAlertMessage] = useState<string | null>(null);
	const [alertVariant, setAlertVariant] = useState<"default" | "destructive">(
		"destructive",
	);

	// Delete dialog state
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [serverToDelete, setServerToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);

	// Add test case form state
	const [showAddTestForm, setShowAddTestForm] = useState(false);
	const [newTestQuery, setNewTestQuery] = useState("");
	const [newTestTool, setNewTestTool] = useState("");

	// Queries
	const queryClient = useQueryClient();
	const { data: servers = [] } = useMCPServers();
	const { data: tools = [] } = useTools(selectedServer);
	const { data: testCases = [] } = useTestCases(selectedServer);
	const connectMCPMutation = useConnectMCP();
	const deleteServerMutation = useDeleteServer();
	const generateTestsMutation = useGenerateTests();
	const addTestCaseMutation = useAddTestCase();
	const deleteTestCaseMutation = useDeleteTestCase();
	const updateToolSelectionMutation = useUpdateToolSelection();
	const selectAllToolsMutation = useSelectAllTools();
	const deselectAllToolsMutation = useDeselectAllTools();
	const oauthAuthorizeMutation = useOAuthAuthorize();

	// Set first server as selected when servers load
	useEffect(() => {
		if (servers.length > 0 && !selectedServer && servers[0]) {
			setSelectedServer(servers[0].id);
		}
	}, [servers, selectedServer]);

	// Handle OAuth callback messages
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.data?.type === "oauth-success") {
				setPendingAuthServerId(null);
				setAlertMessage("OAuth authorization successful!");
				setAlertVariant("default");
				// Invalidate queries - the backend will auto-initialize when tools are fetched
				queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
				queryClient.invalidateQueries({ queryKey: ["tools"] });
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [queryClient]);

	// Handle OAuth authorize success
	useEffect(() => {
		if (oauthAuthorizeMutation.isSuccess && oauthAuthorizeMutation.data) {
			const authUrl = oauthAuthorizeMutation.data.authorizationUrl;
			if (authUrl) {
				const newTab = window.open(authUrl, "_blank");
				if (!newTab) {
					setAlertMessage("Popup blocked. Please allow popups and try again.");
					setAlertVariant("destructive");
				}
			}
		}
	}, [oauthAuthorizeMutation.isSuccess, oauthAuthorizeMutation.data]);

	useEffect(() => {
		if (
			oauthAuthorizeMutation.isError &&
			oauthAuthorizeMutation.error instanceof Error
		) {
			setAlertMessage(
				`Authentication failed: ${oauthAuthorizeMutation.error.message}`,
			);
			setAlertVariant("destructive");
		}
	}, [oauthAuthorizeMutation.isError, oauthAuthorizeMutation.error]);

	// Handle connect MCP success/error
	useEffect(() => {
		if (connectMCPMutation.isSuccess && connectMCPMutation.data) {
			const data = connectMCPMutation.data;
			if (data.requiresAuth && data.authorizationUrl) {
				// OAuth flow needed
				setPendingAuthServerId(data.serverId);
				// Open authorization URL in new tab
				const newTab = window.open(data.authorizationUrl, "_blank");
				if (!newTab) {
					setAlertMessage("Popup blocked. Please allow popups and try again.");
					setAlertVariant("destructive");
				}
			} else {
				// Connection successful
				setMcpName("");
				setMcpCommand("");
				setMcpArgs("");
				setMcpUrl("");
				setAlertMessage(null);
			}
		}
	}, [connectMCPMutation.isSuccess, connectMCPMutation.data]);

	useEffect(() => {
		if (
			connectMCPMutation.isError &&
			connectMCPMutation.error instanceof Error
		) {
			setAlertMessage(`Connection failed: ${connectMCPMutation.error.message}`);
			setAlertVariant("destructive");
		}
	}, [connectMCPMutation.isError, connectMCPMutation.error]);

	useEffect(() => {
		if (
			generateTestsMutation.isError &&
			generateTestsMutation.error instanceof Error
		) {
			setAlertMessage(
				`Failed to generate tests: ${generateTestsMutation.error.message}`,
			);
			setAlertVariant("destructive");
		}
	}, [generateTestsMutation.isError, generateTestsMutation.error]);

	const handleConnectMCP = () => {
		const config: MCPConfig =
			mcpType === "stdio"
				? {
						type: "stdio",
						command: mcpCommand,
						args: mcpArgs.split(" ").filter(Boolean),
					}
				: { type: "http", url: mcpUrl };

		connectMCPMutation.mutate({ name: mcpName, config });
	};

	const handleGenerateTests = () => {
		generateTestsMutation.mutate({
			serverId: selectedServer,
			testsPerTool,
			model,
			customPrompt: customTestPrompt.trim() || undefined,
		});
	};

	const handleAddTestCase = () => {
		if (!newTestQuery.trim() || !newTestTool) {
			setAlertMessage("Please fill in both query and expected tool");
			setAlertVariant("destructive");
			return;
		}

		const toolId = tools.find((t) => t.name === newTestTool)?.id;
		if (!toolId) {
			setAlertMessage("Selected tool not found");
			setAlertVariant("destructive");
			return;
		}

		addTestCaseMutation.mutate(
			{
				toolId,
				query: newTestQuery.trim(),
				expectedTool: newTestTool,
			},
			{
				onSuccess: () => {
					setNewTestQuery("");
					setNewTestTool("");
					setShowAddTestForm(false);
					setAlertMessage("Test case added successfully");
					setAlertVariant("default");
				},
				onError: (error) => {
					setAlertMessage(
						`Failed to add test case: ${error instanceof Error ? error.message : "Unknown error"}`,
					);
					setAlertVariant("destructive");
				},
			},
		);
	};

	const handleDeleteTestCase = (testId: string) => {
		deleteTestCaseMutation.mutate({ testId });
	};

	const handleAuthenticate = (serverId: string, event: React.MouseEvent) => {
		event.stopPropagation();
		oauthAuthorizeMutation.mutate({ serverId });
	};

	const needsAuthentication = (server: (typeof servers)[0]): boolean => {
		if (!server.oauthClientId) {
			return false;
		}
		if (!server.oauthAccessToken) {
			return true;
		}
		if (server.oauthTokenExpiry && server.oauthTokenExpiry < new Date()) {
			return true;
		}
		return false;
	};

	// Filter test cases to only show those for selected tools
	const selectedToolIds = new Set(
		tools.filter((t) => t.optimizationStatus === "selected").map((t) => t.id),
	);
	const filteredTestCases = testCases.filter(
		(tc) => tc.toolId && selectedToolIds.has(tc.toolId),
	);

	const handleStart = () => {
		if (!selectedServer) {
			setAlertMessage("Please connect to an MCP server first");
			setAlertVariant("destructive");
			return;
		}

		if (filteredTestCases.length === 0) {
			setAlertMessage("Please generate test cases first");
			setAlertVariant("destructive");
			return;
		}

		setAlertMessage(null);
		onStart(selectedServer, {
			maxEvaluations,
			subsampleSize,
			testsPerTool,
			model,
			maxConcurrentEvaluations,
		});
	};

	return (
		<Card className="rounded-none border-x-0 border-t-0">
			<CardHeader>
				<CardTitle>Configuration</CardTitle>
			</CardHeader>
			<CardContent className="space-y-8">
				{alertMessage && (
					<Alert variant={alertVariant} className="relative">
						<AlertTitle>
							{alertVariant === "destructive" ? "Error" : "Notice"}
						</AlertTitle>
						<AlertDescription>{alertMessage}</AlertDescription>
						<Button
							variant="ghost"
							size="sm"
							className="absolute right-2 top-2 h-6 w-6 p-0"
							onClick={() => setAlertMessage(null)}
						>
							<X className="h-4 w-4" />
						</Button>
					</Alert>
				)}
				<div className="space-y-4">
					<h3 className="text-lg font-semibold">MCP Server Connection</h3>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="server-name">Server Name</Label>
							<Input
								id="server-name"
								type="text"
								value={mcpName}
								onChange={(e) => setMcpName(e.target.value)}
								placeholder="My MCP Server"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="connection-type">Connection Type</Label>
							<Select
								value={mcpType}
								onValueChange={(value) => setMcpType(value as "stdio" | "http")}
							>
								<SelectTrigger id="connection-type">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="stdio">stdio</SelectItem>
									<SelectItem value="http">HTTP</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{mcpType === "stdio" ? (
						<div className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="command">Command</Label>
								<Input
									id="command"
									type="text"
									value={mcpCommand}
									onChange={(e) => setMcpCommand(e.target.value)}
									placeholder="node"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="args">Arguments</Label>
								<Input
									id="args"
									type="text"
									value={mcpArgs}
									onChange={(e) => setMcpArgs(e.target.value)}
									placeholder="server.js"
								/>
							</div>
						</div>
					) : (
						<div className="space-y-2">
							<Label htmlFor="url">URL</Label>
							<Input
								id="url"
								type="text"
								value={mcpUrl}
								onChange={(e) => setMcpUrl(e.target.value)}
								placeholder="http://localhost:8080"
							/>
						</div>
					)}

					<Button
						onClick={handleConnectMCP}
						disabled={!mcpName || connectMCPMutation.isPending}
						className="w-full md:w-auto md:min-w-[200px]"
					>
						{connectMCPMutation.isPending
							? "Connecting..."
							: "Connect to MCP Server"}
					</Button>
				</div>

				{servers.length > 0 && (
					<>
						<Separator />
						<div className="space-y-4">
							<h3 className="text-lg font-semibold">MCP Servers</h3>
							<div className="space-y-2">
								{servers.map((server) => {
									const isSelected = selectedServer === server.id;
									const needsAuth = needsAuthentication(server);
									return (
										<div
											key={server.id}
											className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
												isSelected
													? "border-primary bg-primary/5"
													: "border-border"
											}`}
										>
											<button
												type="button"
												onClick={() => setSelectedServer(server.id)}
												className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-muted/50 rounded-md p-1 -m-1 transition-colors"
											>
												<div
													className={`h-2 w-2 rounded-full flex-shrink-0 ${
														isSelected ? "bg-primary" : "bg-muted-foreground"
													}`}
												/>
												<span
													className={`text-sm font-medium truncate ${
														isSelected
															? "text-foreground"
															: "text-muted-foreground"
													}`}
												>
													{server.name}
												</span>
												{needsAuth && (
													<Badge variant="outline" className="flex-shrink-0">
														Auth Required
													</Badge>
												)}
											</button>
											<div className="flex items-center gap-2">
												{needsAuth && (
													<Button
														variant="outline"
														size="sm"
														onClick={(e) => handleAuthenticate(server.id, e)}
														disabled={oauthAuthorizeMutation.isPending}
														className="flex-shrink-0"
													>
														{oauthAuthorizeMutation.isPending
															? "Authenticating..."
															: "Authenticate"}
													</Button>
												)}
												<Button
													variant="ghost"
													size="sm"
													onClick={() => {
														setServerToDelete({
															id: server.id,
															name: server.name,
														});
														setDeleteDialogOpen(true);
													}}
													disabled={deleteServerMutation.isPending}
													className="flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
												>
													<X className="h-4 w-4" />
												</Button>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</>
				)}

				<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete Server</AlertDialogTitle>
							<AlertDialogDescription>
								Are you sure you want to delete server "{serverToDelete?.name}"?
								This action cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								onClick={() => {
									if (serverToDelete) {
										deleteServerMutation.mutate({
											serverId: serverToDelete.id,
										});
										if (selectedServer === serverToDelete.id) {
											setSelectedServer("");
										}
										setServerToDelete(null);
									}
								}}
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				{tools.length > 0 && (
					<>
						<Separator />
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h3 className="text-lg font-semibold">Tools to Optimize</h3>
								<Badge variant="secondary">
									{
										tools.filter((t) => t.optimizationStatus === "selected")
											.length
									}{" "}
									selected
								</Badge>
							</div>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										if (selectedServer) {
											selectAllToolsMutation.mutate({
												serverId: selectedServer,
											});
										}
									}}
									disabled={!selectedServer || selectAllToolsMutation.isPending}
								>
									Select All
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										if (selectedServer) {
											deselectAllToolsMutation.mutate({
												serverId: selectedServer,
											});
										}
									}}
									disabled={
										!selectedServer || deselectAllToolsMutation.isPending
									}
								>
									Deselect All
								</Button>
							</div>
							<div className="border rounded-lg p-4 bg-muted/30">
								<div className="space-y-2 max-h-64 overflow-y-auto">
									{tools.map((tool) => (
										<label
											key={tool.id}
											className="flex items-center space-x-3 p-2 rounded-md hover:bg-background cursor-pointer transition-colors"
										>
											<input
												type="checkbox"
												checked={tool.optimizationStatus === "selected"}
												onChange={(e) => {
													updateToolSelectionMutation.mutate({
														toolId: tool.id,
														optimizationStatus: e.target.checked
															? "selected"
															: "unselected",
													});
												}}
												disabled={updateToolSelectionMutation.isPending}
												className="h-4 w-4 rounded border-gray-300"
											/>
											<span className="text-sm flex-1">{tool.name}</span>
										</label>
									))}
								</div>
							</div>
						</div>
					</>
				)}

				<Separator />
				<div className="space-y-6">
					<div className="space-y-2">
						<h3 className="text-lg font-semibold">Optimization Settings</h3>
						<p className="text-sm text-muted-foreground">
							Uses a genetic algorithm (GEPA) to evolve tool descriptions across
							generations, optimizing for accuracy and conciseness.
						</p>
					</div>

					<div className="space-y-6">
						<div className="space-y-3">
							<div className="flex justify-between items-center">
								<Label htmlFor="max-evals">Max Evaluations (Budget)</Label>
								<span className="text-sm font-medium text-foreground">
									{maxEvaluations}
								</span>
							</div>
							<Slider
								id="max-evals"
								min={100}
								max={2000}
								step={50}
								value={[maxEvaluations]}
								onValueChange={(value) => {
									const newValue = value[0];
									if (newValue !== undefined) {
										setMaxEvaluations(newValue);
									}
								}}
							/>
							<p className="text-xs text-muted-foreground">
								Total LLM evaluation budget. Each iteration costs subsample (5)
								+ full (~{filteredTestCases.length}) = ~
								{5 + filteredTestCases.length} evals if accepted. With{" "}
								{maxEvaluations} evals and 50% acceptance: expect ~
								{Math.floor(
									maxEvaluations / ((5 + filteredTestCases.length) / 2),
								)}
								-{Math.floor(maxEvaluations / (5 + filteredTestCases.length))}{" "}
								candidates.
							</p>
						</div>

						<div className="space-y-3">
							<div className="flex justify-between items-center">
								<Label htmlFor="subsample">Subsample Size</Label>
								<span className="text-sm font-medium text-foreground">
									{subsampleSize}
								</span>
							</div>
							<Slider
								id="subsample"
								min={3}
								max={Math.min(20, filteredTestCases.length || 20)}
								step={1}
								value={[subsampleSize]}
								onValueChange={(value) => {
									const newValue = value[0];
									if (newValue !== undefined) {
										setSubsampleSize(newValue);
									}
								}}
							/>
							<p className="text-xs text-muted-foreground">
								Quick filter before full evaluation. Lower = faster but less
								accurate filtering. Must be ≤ {filteredTestCases.length} test
								cases. Recommended: 5-10.
							</p>
						</div>

						<div className="space-y-3">
							<div className="flex justify-between items-center">
								<Label htmlFor="tests-per-tool">Auto-Generate Count</Label>
								<Input
									type="number"
									min={1}
									max={50}
									value={testsPerTool}
									onChange={(e) => {
										const val = Number.parseInt(e.target.value, 10);
										if (val >= 1 && val <= 50) {
											setTestsPerTool(val);
										}
									}}
									className="w-20 h-8 text-sm"
								/>
							</div>
							<Slider
								id="tests-per-tool"
								min={1}
								max={50}
								step={1}
								value={[testsPerTool]}
								onValueChange={(value) => {
									const newValue = value[0];
									if (newValue !== undefined) {
										setTestsPerTool(newValue);
									}
								}}
							/>
							<p className="text-xs text-muted-foreground">
								Number of test cases to auto-generate per tool (1-50).
							</p>
						</div>

						<div className="space-y-3">
							<Label htmlFor="custom-test-prompt">
								Custom Test Generation Prompt (Optional)
							</Label>
							<textarea
								id="custom-test-prompt"
								value={customTestPrompt}
								onChange={(e) => setCustomTestPrompt(e.target.value)}
								placeholder="Add custom instructions for test generation (e.g., 'Focus on edge cases', 'Include multi-step scenarios', etc.)"
								className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md resize-y"
							/>
							<p className="text-xs text-muted-foreground">
								Optional: Add specific instructions to guide test case generation.
								This will be appended to the default prompt.
							</p>
						</div>
					</div>

					<div className="space-y-2 max-w-md">
						<Label htmlFor="model">Model</Label>
						<Select
							value={model}
							onValueChange={(value) => setModel(value as ModelName)}
						>
							<SelectTrigger id="model">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Object.keys(MODEL_PROVIDERS).map((modelKey) => (
									<SelectItem key={modelKey} value={modelKey}>
										{formatModelName(modelKey)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							LLM used for test generation, evaluation, and description
							optimization. Faster models reduce cost/time.
						</p>
					</div>
				</div>

				<Separator />
				<div className="space-y-4">
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<h3 className="text-lg font-semibold">Test Cases</h3>
							<Badge variant="secondary">
								{filteredTestCases.length} total
							</Badge>
						</div>
						<p className="text-sm text-muted-foreground">
							These queries evaluate how well descriptions help select the
							correct tool. Use the slider above to set count, then generate or
							add manually.
						</p>
					</div>

					<div className="flex flex-wrap gap-2">
						<Button
							onClick={handleGenerateTests}
							disabled={!selectedServer || generateTestsMutation.isPending}
							variant="outline"
						>
							{generateTestsMutation.isPending
								? "Generating..."
								: `Generate ${testsPerTool} per tool`}
						</Button>
						<Button
							onClick={() => setShowAddTestForm(!showAddTestForm)}
							disabled={!selectedServer}
							variant="outline"
						>
							{showAddTestForm ? "Cancel" : "Add Test Case"}
						</Button>
					</div>

					{showAddTestForm && (
						<div className="border rounded-lg p-4 bg-muted/30 space-y-3">
							<div className="space-y-2">
								<Label htmlFor="test-query">Query</Label>
								<Input
									id="test-query"
									type="text"
									value={newTestQuery}
									onChange={(e) => setNewTestQuery(e.target.value)}
									placeholder="What should this query match?"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="test-tool">Expected Tool</Label>
								<Select value={newTestTool} onValueChange={setNewTestTool}>
									<SelectTrigger id="test-tool">
										<SelectValue placeholder="Select expected tool" />
									</SelectTrigger>
									<SelectContent>
										{tools
											.filter((t) => t.optimizationStatus === "selected")
											.map((tool) => (
												<SelectItem key={tool.id} value={tool.name}>
													{tool.name}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							</div>
							<Button
								onClick={handleAddTestCase}
								disabled={addTestCaseMutation.isPending}
							>
								{addTestCaseMutation.isPending ? "Adding..." : "Add Test Case"}
							</Button>
						</div>
					)}

					{filteredTestCases.length > 0 && (
						<div className="border rounded-lg p-4 bg-muted/30">
							<div className="space-y-2 max-h-64 overflow-y-auto">
								{filteredTestCases.map((tc) => {
									const _tool = tools.find((t) => t.id === tc.toolId);
									return (
										<div
											key={tc.id}
											className="flex items-start gap-3 p-3 bg-background rounded-md border"
										>
											<div className="flex-1 space-y-1">
												<div className="text-sm">{tc.query}</div>
												<div className="flex items-center gap-2">
													<Badge variant="outline" className="text-xs">
														{tc.expectedTool}
													</Badge>
													{tc.userCreated && (
														<Badge variant="secondary" className="text-xs">
															Manual
														</Badge>
													)}
												</div>
											</div>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleDeleteTestCase(tc.id)}
												disabled={deleteTestCaseMutation.isPending}
												className="flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
											>
												<X className="h-4 w-4" />
											</Button>
										</div>
									);
								})}
							</div>
						</div>
					)}
				</div>

				<Separator />
				<div className="space-y-4">
					<h3 className="text-lg font-semibold">Run Optimization</h3>
					<div className="flex gap-3">
						{isRunning ? (
							<Button
								onClick={async () => {
									await onStop();
								}}
								variant="destructive"
								disabled={!isRunning}
								className="flex-1 md:flex-initial md:min-w-[200px]"
							>
								Stop Optimization
							</Button>
						) : (
							<Button
								onClick={handleStart}
								className="flex-1 md:flex-initial md:min-w-[200px]"
							>
								Start Optimization
							</Button>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
