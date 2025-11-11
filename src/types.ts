import type { InferSelectModel } from "drizzle-orm";
import type * as schema from "./db/schema";
import type { MODEL_PROVIDERS } from "./lib/constants";

// MCP Configuration
export type MCPConfig =
	| { type: "stdio"; command: string; args?: string[] }
	| {
			type: "http";
			url: string;
			headers?: Record<string, string>;
	  };

// Database row types
export type MCPServer = InferSelectModel<typeof schema.mcpServers>;
export type ToolRow = InferSelectModel<typeof schema.tools>;
export type TestCaseRow = InferSelectModel<typeof schema.testCases>;

// Core Domain Types - Tool
export type Tool = {
	id: string;
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	serverId: string;
};

export type TestCase = {
	id: string;
	toolId: string;
	query: string;
	expectedTool: string;
	userCreated: boolean;
};

export type GoldenTestCase = TestCase & {
	invocationType: "direct" | "indirect" | "negative";
	shouldCall: boolean;
};

export type Candidate = {
	id: string;
	tools: Tool[];
};

export type EvaluatedCandidate = Candidate & {
	accuracy: number;
	avgDescriptionLength: number;
	evaluations: EvalResult[];
};

export type EvalResult = {
	testCaseId: string;
	selectedTool: string | null;
	expectedTool: string;
	correct: boolean;
};

// Optimization Configuration
export type OptimizationConfig = {
	optimizer: "gepa" | "golden"; // Optimizer algorithm to use
	maxEvaluations: number; // Total LLM call budget (default: 500) - GEPA only
	subsampleSize: number; // Quick filter size (default: 5) - GEPA only
	testsPerTool: number; // Auto-generated tests (default: 5) - GEPA only
	testCasesPerCategory?: number; // Golden optimizer: test cases per category (default: 10)
	candidateCount?: number; // Golden optimizer: number of candidates (default: 10)
	evaluationModel: ModelName; // LLM to use for evaluations
	generationModel: ModelName; // LLM to use for reflection and test generation
	maxConcurrentEvaluations: number; // Concurrent evaluations (default: 3)
	// GEPA multi-objective parameters
	minAccuracy?: number; // Minimum accuracy threshold 0-1 (default: 0, no minimum)
	accuracyWeight?: number; // Balance: 0=all conciseness, 1=all accuracy (default: 0.5)
	selectionTemperature?: number; // Exploration: higher=more exploration (default: 1.0)
};

// GEPA Configuration (replaces iterations/populationSize with budget-based approach)
export type GEPAConfig = {
	runId: string; // Optimization run ID
	maxEvaluations: number; // Total LLM call budget (default: 500)
	subsampleSize: number; // Cheap filter size (default: 5)
	testsPerTool: number; // Auto-generated tests (same as before)
	evaluationModel: ModelName; // LLM to use for evaluations
	generationModel: ModelName; // LLM to use for reflection and test generation
	maxConcurrentEvaluations: number; // Rate limiting
	tools: Tool[];
	testCases: TestCase[];
	onProgress: (event: ProgressEvent) => void;
	// Multi-objective parameters
	minAccuracy?: number; // Minimum accuracy threshold 0-1 (default: 0)
	accuracyWeight?: number; // Balance: 0=all conciseness, 1=all accuracy (default: 0.5)
	selectionTemperature?: number; // Exploration: higher=more exploration (default: 1.0)
};

// Golden Optimizer Configuration
export type GoldenOptimizerConfig = {
	runId: string;
	evaluationModel: ModelName;
	generationModel: ModelName;
	maxConcurrentEvaluations: number;
	tools: Tool[];
	testCasesPerCategory: number; // Number of direct/indirect/negative test cases to generate (default: 10)
	candidateCount: number; // Number of candidate variations to generate (default: 10)
	onProgress: (event: ProgressEvent) => void;
};

export type ModelName = keyof typeof MODEL_PROVIDERS;

// Progress Events for SSE
export type ProgressEvent =
	| { type: "optimization_start"; runId: string }
	| { type: "generation_start"; generation: number }
	| {
			type: "candidate_start";
			candidateId: string;
			generation?: number;
			iteration?: number;
	  }
	| {
			type: "evaluation";
			candidateId: string;
			testCase: string;
			result: {
				correct: boolean;
				selected: string | null;
				expected: string;
			};
	  }
	| {
			type: "candidate_done";
			candidateId: string;
			accuracy: number;
			avgLength: number;
			generation?: number;
			toolDescriptions: Record<string, string>;
			isPareto: boolean;
			// GEPA specific fields
			status?: "accepted" | "rejected";
			rejectionReason?: string;
			parentId?: string;
			// Golden optimizer specific fields
			variationType?: string;
			precision?: number;
			recall?: number;
	  }
	| {
			type: "pareto_front";
			candidates: Array<{
				id: string;
				accuracy: number;
				avgLength: number;
			}>;
	  }
	| {
			type: "mutation_start";
			candidateId: string;
	  }
	| {
			type: "reflection_start";
			candidateId: string;
			tool: string;
			failure: {
				query: string;
				selected: string | null;
				expected: string;
			};
	  }
	| {
			type: "reflection_done";
			candidateId: string;
			tool: string;
			oldDesc: string;
			newDesc: string;
	  }
	| {
			type: "generation_done";
			generation: number;
			bestAccuracy: number;
	  }
	| { type: "iteration_start"; iteration: number; totalEvaluations: number }
	| {
			type: "parent_selected";
			candidateId: string;
			iteration: number;
			dominanceCount: number;
	  }
	| {
			type: "subsample_eval";
			candidateId: string;
			iteration: number;
			subsampleScore: number;
			parentSubsampleScore: number;
			subsampleSize: number;
	  }
	| {
			type: "offspring_rejected";
			candidateId: string;
			reason: string;
			iteration: number;
	  }
	| {
			type: "offspring_accepted";
			candidateId: string;
			accuracy: number;
			avgLength: number;
			archiveIndex: number;
			parentId: string;
			iteration: number;
	  }
	| {
			type: "archive_update";
			archiveSize: number;
			totalEvaluations: number;
			acceptedCount: number;
			rejectedCount: number;
	  }
	| {
			type: "iteration_done";
			iteration: number;
			totalEvaluations: number;
			archiveSize: number;
	  }
	| {
			type: "optimization_complete";
			runId: string;
			archiveSize: number;
			totalEvaluations: number;
			acceptedCount: number;
			rejectedCount: number;
	  }
	| { type: "test_case_generation_start"; toolCount: number }
	| {
			type: "test_case_generated";
			testCaseId: string;
			toolId: string;
			expectedTool: string;
			invocationType: "direct" | "indirect" | "negative";
			query: string;
			shouldCall: boolean;
	  }
	| {
			type: "test_case_generation_done";
			totalGenerated: number;
			directCount: number;
			indirectCount: number;
			negativeCount: number;
	  }
	| { type: "candidate_generation_start"; targetCount: number }
	| {
			type: "candidate_generated";
			candidateId: string;
			variationType: string;
	  }
	| {
			type: "candidate_generation_done";
			totalGenerated: number;
	  }
	| {
			type: "evaluation_phase_start";
			candidateCount: number;
			testCaseCount: number;
	  }
	| {
			type: "evaluation_phase_done";
			evaluatedCount: number;
	  }
	| {
			type: "best_candidate_selected";
			candidateId: string;
			accuracy: number;
			avgLength: number;
			precision: number;
			recall: number;
	  };
