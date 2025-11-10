import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const mcpServers = sqliteTable("mcp_servers", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	config: text("config").notNull(), // JSON: MCPConfig
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	oauthAccessToken: text("oauth_access_token"),
	oauthRefreshToken: text("oauth_refresh_token"),
	oauthTokenExpiry: integer("oauth_token_expiry", { mode: "timestamp" }),
	oauthClientId: text("oauth_client_id"),
	oauthClientSecret: text("oauth_client_secret"),
	oauthScopes: text("oauth_scopes"),
	oauthCodeVerifier: text("oauth_code_verifier"),
});

export const tools = sqliteTable("tools", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	description: text("description").notNull(),
	inputSchema: text("input_schema").notNull(), // JSON
	serverId: text("server_id").references(() => mcpServers.id),
	optimizationStatus: text("optimization_status").notNull().default("selected"), // "selected" | "unselected"
});

export const testCases = sqliteTable("test_cases", {
	id: text("id").primaryKey(),
	toolId: text("tool_id").references(() => tools.id),
	query: text("query").notNull(),
	expectedTool: text("expected_tool").notNull(),
	userCreated: integer("user_created", { mode: "boolean" }).default(false),
	// Golden optimizer fields
	runId: text("run_id").references(() => optimizationRuns.id), // If generated for specific run
	invocationType: text("invocation_type"), // "direct" | "indirect" | "negative" for golden optimizer
	shouldCall: integer("should_call", { mode: "boolean" }), // For golden optimizer
});

export const optimizationRuns = sqliteTable("optimization_runs", {
	id: text("id").primaryKey(),
	serverId: text("server_id").references(() => mcpServers.id),
	startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
	completedAt: integer("completed_at", { mode: "timestamp" }),
	config: text("config").notNull(), // JSON: OptimizationConfig or GEPAConfig
	status: text("status").notNull(), // "running" | "completed" | "failed"
	// GEPA-specific fields (nullable for backwards compatibility)
	maxEvaluations: integer("max_evaluations"),
	subsampleSize: integer("subsample_size"),
});

export const candidates = sqliteTable("candidates", {
	id: text("id").primaryKey(),
	runId: text("run_id").references(() => optimizationRuns.id),
	generation: integer("generation"), // For old optimizer (now nullable)
	toolDescriptions: text("tool_descriptions").notNull(), // JSON: Record<toolName, description>
	accuracy: real("accuracy").notNull(),
	avgDescriptionLength: real("avg_description_length").notNull(),
	isPareto: integer("is_pareto", { mode: "boolean" }).default(false),
	// GEPA-specific fields
	parentId: text("parent_id"),
	iteration: integer("iteration"), // For GEPA iterations
	archiveIndex: integer("archive_index"), // Position in archive
	subsampleScore: real("subsample_score"), // Score on subsample before full eval
	dominanceCount: integer("dominance_count").default(0), // Tasks dominated
	status: text("status").default("accepted"), // "accepted" | "rejected" - for tracking rejected candidates
	rejectionReason: text("rejection_reason"), // Reason if rejected
	// Golden optimizer specific fields
	precision: real("precision"), // Precision metric for golden optimizer
	recall: real("recall"), // Recall metric for golden optimizer
	variationType: text("variation_type"), // Type of variation used to generate this candidate
});

export const evaluations = sqliteTable("evaluations", {
	id: text("id").primaryKey(),
	candidateId: text("candidate_id").references(() => candidates.id),
	testCaseId: text("test_case_id").references(() => testCases.id),
	selectedTool: text("selected_tool"),
	correct: integer("correct", { mode: "boolean" }).notNull(),
});

export const events = sqliteTable("events", {
	id: text("id").primaryKey(),
	runId: text("run_id").references(() => optimizationRuns.id),
	timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
	event: text("event").notNull(), // JSON: ProgressEvent
});

// GEPA iterations - captures iteration-level metadata for evolution
export const iterations = sqliteTable("iterations", {
	id: text("id").primaryKey(),
	runId: text("run_id").references(() => optimizationRuns.id).notNull(),
	iterationNumber: integer("iteration_number").notNull(),
	parentCandidateId: text("parent_candidate_id").references(() => candidates.id),
	offspringCandidateId: text("offspring_candidate_id").references(() => candidates.id),
	subsampleScore: real("subsample_score"), // Offspring score on subsample
	parentSubsampleScore: real("parent_subsample_score"), // Parent score on same subsample
	subsampleSize: integer("subsample_size"), // Number of test cases in subsample
	accepted: integer("accepted", { mode: "boolean" }), // Whether offspring was accepted
	rejectionReason: text("rejection_reason"), // Reason if rejected
	startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
	completedAt: integer("completed_at", { mode: "timestamp" }),
	totalEvaluations: integer("total_evaluations"), // Running count of evaluations
});

// Subsample evaluations - captures test results during subsample phase
export const subsampleEvaluations = sqliteTable("subsample_evaluations", {
	id: text("id").primaryKey(),
	iterationId: text("iteration_id").references(() => iterations.id).notNull(),
	candidateId: text("candidate_id").references(() => candidates.id).notNull(),
	testCaseId: text("test_case_id").references(() => testCases.id).notNull(),
	selectedTool: text("selected_tool"),
	expectedTool: text("expected_tool").notNull(),
	correct: integer("correct", { mode: "boolean" }).notNull(),
	timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
});
