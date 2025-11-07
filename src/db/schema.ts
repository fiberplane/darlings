import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  config: text('config').notNull(), // JSON: MCPConfig
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const tools = sqliteTable('tools', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  inputSchema: text('input_schema').notNull(), // JSON
  serverId: text('server_id').references(() => mcpServers.id),
});

export const testCases = sqliteTable('test_cases', {
  id: text('id').primaryKey(),
  toolId: text('tool_id').references(() => tools.id),
  query: text('query').notNull(),
  expectedTool: text('expected_tool').notNull(),
  userCreated: integer('user_created', { mode: 'boolean' }).default(false),
});

export const optimizationRuns = sqliteTable('optimization_runs', {
  id: text('id').primaryKey(),
  serverId: text('server_id').references(() => mcpServers.id),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  config: text('config').notNull(), // JSON: OptimizationConfig
  status: text('status').notNull(), // "running" | "completed" | "failed"
});

export const candidates = sqliteTable('candidates', {
  id: text('id').primaryKey(),
  runId: text('run_id').references(() => optimizationRuns.id),
  generation: integer('generation').notNull(),
  toolDescriptions: text('tool_descriptions').notNull(), // JSON: Record<toolName, description>
  accuracy: real('accuracy').notNull(),
  avgDescriptionLength: real('avg_description_length').notNull(),
  isPareto: integer('is_pareto', { mode: 'boolean' }).default(false),
});

export const evaluations = sqliteTable('evaluations', {
  id: text('id').primaryKey(),
  candidateId: text('candidate_id').references(() => candidates.id),
  testCaseId: text('test_case_id').references(() => testCases.id),
  selectedTool: text('selected_tool'),
  correct: integer('correct', { mode: 'boolean' }).notNull(),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  runId: text('run_id').references(() => optimizationRuns.id),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  event: text('event').notNull(), // JSON: ProgressEvent
});
