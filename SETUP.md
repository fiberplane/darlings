# Setup Instructions

## Step 1: Install Bun

If you don't have Bun installed, install it:

```bash
curl -fsSL https://bun.sh/install | bash
```

Or using npm:
```bash
npm install -g bun
```

Verify installation:
```bash
bun --version
```

## Step 2: Install Dependencies

```bash
cd mcp-tool-optimizer
bun install
```

This will install:
- drizzle-orm (database ORM)
- @modelcontextprotocol/sdk (MCP client)
- ai (Vercel AI SDK)
- @ai-sdk/anthropic (Claude models)
- @ai-sdk/openai (OpenAI models)
- preact (UI framework)
- zod (schema validation)
- drizzle-kit (database migrations)

## Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add at least one API key:

```env
# Choose one or more:
ANTHROPIC_API_KEY=sk-ant-...      # For Claude models
OPENAI_API_KEY=sk-...             # For GPT models
MOONSHOT_API_KEY=...              # For Kimi models (optional)
DASHSCOPE_API_KEY=...             # For Qwen models (optional)
```

## Step 4: Initialize Database

```bash
bun run db:push
```

This creates the SQLite database with all necessary tables.

## Step 5: Build Frontend

```bash
bun run build
```

This compiles the Preact app to `dist/client.js`.

## Step 6: Start Development Server

```bash
bun run dev
```

The app will be available at: http://localhost:3000

## Verify Installation

Check that all core files exist:
```bash
ls -la src/
ls -la src/db/
ls -la src/lib/
ls -la src/ui/
ls -la src/ui/components/
```

## Next Steps

1. **Connect to an MCP Server**: Use the UI to connect to a stdio or HTTP MCP server
2. **Generate Test Cases**: Click "Generate Test Cases" to create evaluation queries
3. **Run Optimization**: Click "Start Optimization" to begin GEPA algorithm
4. **View Results**: Monitor the Activity Feed and Metrics Panel

## Troubleshooting

### Bun not found
Make sure Bun is in your PATH. Try:
```bash
export PATH="$HOME/.bun/bin:$PATH"
```

### Dependencies fail to install
Try clearing the cache:
```bash
rm -rf node_modules bun.lockb
bun install
```

### Database errors
Delete and recreate:
```bash
rm optimizer.db*
bun run db:push
```

### Frontend not building
Make sure all source files are present:
```bash
find src/ui -type f
```

## Development Mode

For active development with hot reload:
```bash
bun run dev
```

To open Drizzle Studio (database GUI):
```bash
bun run db:studio
```

## Production Deployment

1. Build the frontend:
```bash
bun run build
```

2. Set production environment variables

3. Start the server:
```bash
NODE_ENV=production bun run start
```

For production, consider:
- Using a reverse proxy (nginx, Caddy)
- Setting up HTTPS
- Configuring firewall rules
- Setting up monitoring/logging
- Regular database backups
