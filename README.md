# Tool Description Optimizer

> ![NOTE]
> This is a **research project**. We will not be adding features, fixing the numerous bugs, or porting it to other platforms. If you break it you can keep both halves.

Evolutionary optimization of tool descriptions for LLM function calling using the GEPA (Genetic-Pareto) algorithm.

## Problem

LLMs select tools based on their descriptions. Poor descriptions lead to incorrect tool selection. This optimizer automatically improves descriptions through iterative testing and LLM-guided refinement.

## How GEPA Works

GEPA is an evolutionary algorithm that optimizes tool descriptions across two objectives: accuracy (correct tool selection) and conciseness (shorter descriptions).

### Process

1. **Generate test cases** - LLM creates queries that should trigger each tool
2. **Evaluate baseline** - Test original descriptions against all queries
3. **Evolution loop** - Until budget exhausted:
   - **Select parent**: Probabilistic selection weighted by dominance count (how many test cases this candidate is best at)
   - **Mutate**: LLM analyzes one random failure and rewrites that tool's description to fix it
   - **Subsample filter**: Test offspring on 5 random cases, reject if accuracy drops
   - **Full evaluation**: If passed subsample, test on all cases
   - **Archive**: Add offspring to unbounded archive, update per-task Pareto fronts
4. **Return results** - All candidates stored, best selected from Pareto front

### Key Mechanisms

**Parent-Offspring**:
- Parent is selected from archive (weighted random based on performance)
- Offspring is created by mutating ONE tool description in parent
- Both coexist in archive independently
- Lineage tracked via `parentOf` map

**Mutation strategies**:
- If candidate has failures: Pick random failure, ask LLM to fix that tool's description
- If candidate perfect (100% accuracy): Pick random tool, ask LLM to make it more concise

**Per-task Pareto fronts**:
- Each test case maintains its own Pareto front
- Candidate is on a front if: correct answer OR (correct + shorter than others)
- Dominance count = number of test cases where candidate is on front
- Drives parent selection probability

**Subsample filtering**:
- Evaluate offspring on 5 random tests first
- Only do full evaluation (15+ tests) if subsample shows improvement
- Saves ~70% of LLM call budget

## Installation

```bash
bun install
cp .env.example .env
# Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env
bun run db:start
bun run build
bun run dev
```

Open http://localhost:3000

## Usage

1. **Connect to MCP server** - Load tools from any MCP server (stdio or HTTP)
2. **Generate test cases** - Create queries for each tool (default: 5 per tool)
3. **Configure optimizer** - Set budget (max evaluations), models, subsample size
4. **Run optimization** - Watch real-time progress via Server-Sent Events
5. **View results** - Pareto front shows accuracy vs conciseness tradeoffs

## Configuration

**GEPA config** (`src/types.ts`):
```typescript
{
  maxEvaluations: 500,           // Budget (stop after N LLM calls)
  subsampleSize: 5,              // Cheap filter before full eval
  maxConcurrentEvaluations: 3,   // Rate limit
  evaluationModel: "claude-sonnet-4-5",
  generationModel: "claude-sonnet-4-5",
  minAccuracy: 0.7,              // Reject if below threshold
  selectionTemperature: 1.0      // 0.1=exploit, 5.0=explore
}
```

**Golden Set Optimizer** (alternative exhaustive approach):
- Generates all candidates upfront (10 variations per tool)
- Evaluates all combinations exhaustively
- Tests include direct, indirect, and negative invocations
- No evolution, just brute force + best selection

## LLM Call Budget

**GEPA** (default config: 3 tools, 15 tests, 50 iterations, 30% acceptance):
```
Test generation:     3 calls (1 per tool)
Initial eval:        15 calls (1 per test)
Iterations:          50 × (1 mutation + 5 subsample + 0.3×15 full) = 525 calls
Total:               ~543 LLM calls
```

**Golden** (10 candidates, 3 tools, 27 tests):
```
Test generation:     3 calls
Candidate gen:       27 calls (9 candidates × 3 tools)
Evaluation:          270 calls (10 candidates × 27 tests)
Total:               300 LLM calls
```

## Architecture

```
src/
├── server.ts                  # Bun HTTP server + SSE streaming
├── types.ts                   # Shared types
├── lib/
│   ├── gepa.ts               # Main GEPA algorithm
│   ├── golden-optimizer.ts   # Alternative exhaustive optimizer
│   ├── llm.ts                # LLM interface (Vercel AI SDK)
│   ├── evaluator.ts          # Test case evaluation
│   ├── mutator.ts            # LLM reflection + mutation
│   ├── test-generator.ts     # Simple test case generation
│   ├── golden-set-generator.ts # Comprehensive test generation
│   ├── candidate-generator.ts  # Variation generation (Golden)
│   ├── pareto.ts             # Pareto front logic + parent selection
│   ├── archive.ts            # Candidate storage + lineage
│   ├── subsample.ts          # Subsample filtering
│   └── concurrency.ts        # Rate limiting (p-limit)
└── ui/                        # Preact frontend
```

## Models

Supports Claude (Anthropic), GPT (OpenAI) via Vercel AI SDK:
- `claude-sonnet-4-5`, `claude-opus-4-1`, `claude-haiku-4-5`
- `gpt-5`, `gpt-5-mini`, `gpt-4o`

Evaluation uses `temperature: 0` for deterministic results.

## Database

SQLite with Drizzle ORM:
- `mcp_servers` - Connected servers
- `tools` - Tool definitions
- `test_cases` - Generated + user tests
- `optimization_runs` - Run metadata
- `candidates` - Tool description variants
- `evaluations` - Individual test results
- `events` - SSE event log for replay

## API

**MCP**:
- `POST /api/mcp/connect` - Connect to server
- `GET /api/mcp/tools?serverId={id}` - List tools

**Tests**:
- `POST /api/tests/generate` - Generate test cases
- `GET /api/tests?serverId={id}` - List tests

**Optimization**:
- `POST /api/optimize/start` - Start run (SSE stream)
- `GET /api/runs/{id}/events` - Replay events

## Development

```bash
bun run dev          # Start dev server
bun run build        # Build frontend
bun run db:push      # Apply schema changes
bun run db:studio    # Open Drizzle Studio
```

## License

MIT
