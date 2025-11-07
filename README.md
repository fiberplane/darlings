# MCP Tool Description Optimizer

A web application for optimizing MCP (Model Context Protocol) tool descriptions using the GEPA (Genetic-Pareto) algorithm with LLM reflection.

## Overview

This tool helps improve tool descriptions for MCP servers by:
1. Connecting to an MCP server and loading its tools
2. Generating test cases for each tool
3. Running an evolutionary optimization loop that uses LLM reflection to iteratively improve descriptions
4. Displaying real-time progress and Pareto-optimal solutions

### Key Features

- **GEPA Algorithm**: Genetic-Pareto evolutionary optimization with LLM reflection
- **Multi-Model Support**: Latest Claude, GPT, Kimi, and Qwen models
- **Real-time UI**: Live activity feed with SSE streaming
- **Pareto Front**: Visualize tradeoffs between accuracy and description complexity
- **Persistent Storage**: SQLite database with Drizzle ORM

## Technology Stack

- **Runtime**: Bun 1.3+
- **Backend**: Bun.serve() with native routing
- **Frontend**: Preact
- **Database**: SQLite (via Bun's built-in support) + Drizzle ORM
- **AI**: Vercel AI SDK with multiple providers
- **MCP**: Model Context Protocol SDK

## Prerequisites

- [Bun](https://bun.sh) v1.3 or later
- API keys for at least one LLM provider:
  - Anthropic (Claude models)
  - OpenAI (GPT models)
  - Moonshot AI (Kimi models)
  - Alibaba Dashscope (Qwen models)

## Installation

1. **Clone and install dependencies:**

```bash
cd mcp-tool-optimizer
bun install
```

2. **Configure environment variables:**

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
# Required: At least one API key
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
MOONSHOT_API_KEY=...
DASHSCOPE_API_KEY=...

# Optional
DATABASE_URL=optimizer.db
PORT=3000
```

3. **Initialize database:**

```bash
bun run db:push
```

4. **Build frontend:**

```bash
bun run build
```

5. **Start the server:**

```bash
bun run dev
```

Open http://localhost:3000 in your browser.

## Usage

### 1. Connect to an MCP Server

**Stdio Example:**
- Server Name: `weather-mcp`
- Connection Type: `stdio`
- Command: `node`
- Arguments: `path/to/mcp-server.js`

**HTTP Example:**
- Server Name: `api-server`
- Connection Type: `HTTP`
- URL: `http://localhost:8080`

Click **Connect to MCP Server** to load tools.

### 2. Generate Test Cases

1. Select the connected server
2. Adjust "Tests Per Tool" (default: 5)
3. Click **Generate Test Cases**

The system will use the selected LLM to generate diverse queries for each tool.

### 3. Configure Optimization

- **Iterations**: Number of GEPA generations (default: 10)
- **Population Size**: Candidates per generation (default: 8)
- **Model**: Choose LLM for evaluation and reflection
- **Tests Per Tool**: Number of test cases per tool

### 4. Run Optimization

Click **Start Optimization** to begin. The Activity Feed will show:
- Each test case evaluation (✓ success / ✗ failure)
- LLM reflection on failures
- Tool description mutations
- Pareto front updates

### 5. View Results

The Metrics Panel displays:
- **Best Accuracy**: Highest achieved accuracy
- **Pareto Front**: Non-dominated solutions (accuracy vs complexity)
- **Progress**: Accuracy improvement over generations

## Model Selection

### Recommended Models

| Tier | Model | Best For |
|------|-------|----------|
| **Premium** | `claude-sonnet-4-5` | Best overall quality |
| | `gpt-5` | OpenAI flagship |
| | `claude-opus-4-1` | Maximum reasoning |
| **Balanced** | `claude-sonnet-4` | Proven reliability |
| | `gpt-4o` | Fast and accurate |
| | `qwq-32b-preview` | Reasoning at lower cost |
| **Fast** | `kimi-v1.5` | Rapid iteration |
| | `qwen-turbo` | Cost-effective |

### Available Models

**Claude (Anthropic)**
- `claude-sonnet-4-5` - Latest Sonnet (Nov 2025)
- `claude-opus-4-1` - Highest capability
- `claude-haiku-4-5` - Fast and economical

**OpenAI**
- `gpt-5` - Latest flagship
- `gpt-4o` - Recommended default
- `o3-mini` - Enhanced reasoning

**Kimi (Moonshot AI)**
- `moonshot-v1-8k` - 8k context
- `moonshot-v1-32k` - 32k context
- `moonshot-v1-128k` - 128k context

**Qwen (Alibaba)**
- `qwen-turbo` - Fast
- `qwen-plus` - Balanced
- `qwen-max` - Highest quality
- `qwq-32b-preview` - Reasoning model

## Architecture

### Backend (`src/`)

```
src/
├── server.ts              # Bun.serve() with API routes
├── types.ts               # Shared TypeScript types
├── db/
│   ├── schema.ts          # Drizzle schema
│   └── index.ts           # Database connection
└── lib/
    ├── llm.ts             # Vercel AI SDK wrapper
    ├── mcp-client.ts      # MCP connection handler
    ├── test-generator.ts  # Auto-generate test cases
    ├── evaluator.ts       # Test case evaluation
    ├── mutator.ts         # LLM reflection mutations
    └── optimizer.ts       # GEPA algorithm
```

### Frontend (`src/ui/`)

```
src/ui/
├── index.html             # Entry point
├── client.tsx             # Main Preact app
└── components/
    ├── ConfigPanel.tsx    # MCP connection & settings
    ├── ActivityFeed.tsx   # Real-time event stream
    └── MetricsPanel.tsx   # Charts and statistics
```

## GEPA Algorithm

The Genetic-Pareto algorithm optimizes tool descriptions through:

1. **Initialization**: Start with original tool descriptions
2. **Evaluation**: Test each candidate against all test cases
3. **Pareto Selection**: Identify non-dominated solutions
4. **Reflection**: LLM analyzes failures and suggests improvements
5. **Mutation**: Update tool descriptions based on reflection
6. **Iteration**: Repeat for configured number of generations

### Objectives

- **Maximize Accuracy**: Correct tool selection rate
- **Minimize Complexity**: Average description length

The Pareto front contains all solutions where improving one objective would worsen the other.

## Database Schema

- `mcp_servers`: Connected MCP servers
- `tools`: Tools from each server
- `test_cases`: Generated and user-created test cases
- `optimization_runs`: Historical optimization runs
- `candidates`: Tool description variants
- `evaluations`: Individual test results
- `events`: Real-time progress events (for replay)

## Development

### Run in development mode:

```bash
bun run dev
```

### Database management:

```bash
# Generate migrations
bun run db:generate

# Apply schema changes
bun run db:push

# Open Drizzle Studio
bun run db:studio
```

### Build frontend:

```bash
bun run build
```

## API Endpoints

### MCP Operations
- `POST /api/mcp/connect` - Connect to MCP server
- `GET /api/mcp/servers` - List connected servers
- `GET /api/mcp/tools?serverId={id}` - List tools for server

### Test Cases
- `POST /api/tests/generate` - Generate test cases
- `GET /api/tests?serverId={id}` - Get test cases
- `POST /api/tests/add` - Add custom test case
- `DELETE /api/tests/{id}` - Delete test case

### Optimization
- `POST /api/optimize/start` - Start optimization (SSE stream)
- `POST /api/optimize/stop` - Stop running optimization
- `GET /api/runs` - List optimization runs
- `GET /api/runs/{id}/events` - Get events for run

## Troubleshooting

### "Failed to connect to MCP server"

- Verify the command/arguments for stdio servers
- Check that HTTP servers are running and accessible
- Review MCP server logs for errors

### "No test cases generated"

- Ensure you have a valid API key configured
- Try a different model (e.g., switch from Claude to GPT)
- Check server logs for API errors

### Frontend not loading

- Run `bun run build` to rebuild
- Check that dist/client.js exists
- Verify port 3000 is not in use

### Database errors

- Delete `optimizer.db` and run `bun run db:push`
- Check file permissions on the database file

## License

MIT

## Contributing

Pull requests welcome! Please ensure:
1. Code follows TypeScript best practices
2. All tests pass
3. Documentation is updated

## Acknowledgments

- Built with [Bun](https://bun.sh)
- Powered by [Vercel AI SDK](https://sdk.vercel.ai)
- Uses [Drizzle ORM](https://orm.drizzle.team)
- Implements [Model Context Protocol](https://modelcontextprotocol.io)
