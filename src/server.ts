import { db } from './db';
import * as schema from './db/schema';
import { eq } from 'drizzle-orm';
import { connectMCP, listTools, disconnectMCP } from './lib/mcp-client';
import { generateTestCases } from './lib/test-generator';
import { runGEPA } from './lib/optimizer';
import type { MCPConfig, OptimizationConfig, ProgressEvent } from './types';

const PORT = parseInt(process.env.PORT || '3000');

// Store active MCP clients
const mcpClients = new Map<string, any>();

// Store active optimization runs (for cancellation)
const activeRuns = new Map<string, AbortController>();

export default {
  port: PORT,

  async fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route handlers
      if (path === '/') {
        const html = await Bun.file('src/ui/index.html').text();
        return new Response(html, {
          headers: { 'Content-Type': 'text/html', ...corsHeaders }
        });
      }

      // Serve static files from dist
      if (path.startsWith('/dist/')) {
        const file = Bun.file(path.slice(1));
        if (await file.exists()) {
          return new Response(file, { headers: corsHeaders });
        }
      }

      // API Routes
      if (path === '/api/mcp/connect' && req.method === 'POST') {
        return handleConnectMCP(req, corsHeaders);
      }

      if (path === '/api/mcp/servers' && req.method === 'GET') {
        return handleListServers(corsHeaders);
      }

      if (path === '/api/mcp/tools' && req.method === 'GET') {
        return handleListTools(url, corsHeaders);
      }

      if (path === '/api/tests/generate' && req.method === 'POST') {
        return handleGenerateTests(req, corsHeaders);
      }

      if (path === '/api/tests' && req.method === 'GET') {
        return handleGetTests(url, corsHeaders);
      }

      if (path === '/api/tests/add' && req.method === 'POST') {
        return handleAddTest(req, corsHeaders);
      }

      if (path.startsWith('/api/tests/') && req.method === 'DELETE') {
        const testId = path.split('/').pop();
        return handleDeleteTest(testId!, corsHeaders);
      }

      if (path === '/api/optimize/start' && req.method === 'POST') {
        return handleStartOptimization(req, corsHeaders);
      }

      if (path === '/api/optimize/stop' && req.method === 'POST') {
        return handleStopOptimization(req, corsHeaders);
      }

      if (path === '/api/runs' && req.method === 'GET') {
        return handleGetRuns(corsHeaders);
      }

      if (path.startsWith('/api/runs/') && path.endsWith('/events') && req.method === 'GET') {
        const runId = path.split('/')[3];
        return handleGetEvents(runId!, corsHeaders);
      }

      return new Response('Not Found', {
        status: 404,
        headers: corsHeaders
      });

    } catch (error) {
      console.error('Server error:', error);
      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  },
};

// Handler functions
async function handleConnectMCP(req: Request, corsHeaders: Record<string, string>) {
  const { name, config }: { name: string; config: MCPConfig } = await req.json();

  try {
    const client = await connectMCP(config);
    const tools = await listTools(client);

    const serverId = crypto.randomUUID();

    // Save to DB
    await db.insert(schema.mcpServers).values({
      id: serverId,
      name,
      config: JSON.stringify(config),
      createdAt: new Date(),
    });

    for (const tool of tools) {
      await db.insert(schema.tools).values({
        ...tool,
        serverId,
      });
    }

    // Store client for later use
    mcpClients.set(serverId, client);

    return Response.json({ serverId, tools }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Connection failed' },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handleListServers(corsHeaders: Record<string, string>) {
  const servers = await db.select().from(schema.mcpServers);
  return Response.json(servers, { headers: corsHeaders });
}

async function handleListTools(url: URL, corsHeaders: Record<string, string>) {
  const serverId = url.searchParams.get('serverId');

  if (!serverId) {
    return Response.json(
      { error: 'serverId parameter required' },
      { status: 400, headers: corsHeaders }
    );
  }

  const tools = await db.select()
    .from(schema.tools)
    .where(eq(schema.tools.serverId, serverId));

  return Response.json(tools, { headers: corsHeaders });
}

async function handleGenerateTests(req: Request, corsHeaders: Record<string, string>) {
  const { serverId, testsPerTool, model } = await req.json();

  const tools = await db.select()
    .from(schema.tools)
    .where(eq(schema.tools.serverId, serverId));

  const testCases = await generateTestCases(
    tools.map(t => ({
      ...t,
      inputSchema: JSON.parse(t.inputSchema),
    })),
    testsPerTool,
    model
  );

  // Save to DB
  for (const testCase of testCases) {
    await db.insert(schema.testCases).values(testCase);
  }

  return Response.json({ testCases }, { headers: corsHeaders });
}

async function handleGetTests(url: URL, corsHeaders: Record<string, string>) {
  const serverId = url.searchParams.get('serverId');

  if (!serverId) {
    // Get all test cases
    const tests = await db.select().from(schema.testCases);
    return Response.json(tests, { headers: corsHeaders });
  }

  // Get test cases for specific server
  const tools = await db.select()
    .from(schema.tools)
    .where(eq(schema.tools.serverId, serverId));

  const toolIds = tools.map(t => t.id);
  const tests = await db.select()
    .from(schema.testCases);

  const filteredTests = tests.filter(t => toolIds.includes(t.toolId!));

  return Response.json(filteredTests, { headers: corsHeaders });
}

async function handleAddTest(req: Request, corsHeaders: Record<string, string>) {
  const testCase = await req.json();

  await db.insert(schema.testCases).values({
    id: crypto.randomUUID(),
    ...testCase,
    userCreated: true,
  });

  return Response.json({ success: true }, { headers: corsHeaders });
}

async function handleDeleteTest(testId: string, corsHeaders: Record<string, string>) {
  await db.delete(schema.testCases)
    .where(eq(schema.testCases.id, testId));

  return Response.json({ success: true }, { headers: corsHeaders });
}

async function handleStartOptimization(req: Request, corsHeaders: Record<string, string>) {
  const { serverId, config }: { serverId: string; config: OptimizationConfig } = await req.json();

  // Get tools and test cases
  const toolsData = await db.select()
    .from(schema.tools)
    .where(eq(schema.tools.serverId, serverId));

  const tools = toolsData.map(t => ({
    ...t,
    inputSchema: JSON.parse(t.inputSchema),
  }));

  const testCasesData = await db.select().from(schema.testCases);

  // Filter test cases for this server's tools
  const toolIds = tools.map(t => t.id);
  const testCases = testCasesData.filter(t => toolIds.includes(t.toolId!));

  const runId = crypto.randomUUID();

  // Create run record
  await db.insert(schema.optimizationRuns).values({
    id: runId,
    serverId,
    startedAt: new Date(),
    config: JSON.stringify(config),
    status: 'running',
  });

  // Create SSE stream
  const abortController = new AbortController();
  activeRuns.set(runId, abortController);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runGEPA({
          tools,
          testCases,
          ...config,
          onProgress: (event: ProgressEvent) => {
            // Check if aborted
            if (abortController.signal.aborted) {
              controller.close();
              return;
            }

            // Send event to client
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));

            // Save to DB for replay
            db.insert(schema.events).values({
              id: crypto.randomUUID(),
              runId,
              timestamp: new Date(),
              event: JSON.stringify(event),
            }).run();
          },
        });

        // Mark as completed
        await db.update(schema.optimizationRuns)
          .set({
            completedAt: new Date(),
            status: 'completed',
          })
          .where(eq(schema.optimizationRuns.id, runId));

        controller.close();
        activeRuns.delete(runId);
      } catch (error) {
        console.error('Optimization error:', error);

        // Mark as failed
        await db.update(schema.optimizationRuns)
          .set({ status: 'failed' })
          .where(eq(schema.optimizationRuns.id, runId));

        const errorEvent = {
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        };
        const data = `data: ${JSON.stringify(errorEvent)}\n\n`;
        controller.enqueue(new TextEncoder().encode(data));

        controller.close();
        activeRuns.delete(runId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...corsHeaders,
    },
  });
}

async function handleStopOptimization(req: Request, corsHeaders: Record<string, string>) {
  const { runId } = await req.json();

  const abortController = activeRuns.get(runId);
  if (abortController) {
    abortController.abort();
    activeRuns.delete(runId);

    // Update status in DB
    await db.update(schema.optimizationRuns)
      .set({ status: 'failed' })
      .where(eq(schema.optimizationRuns.id, runId));
  }

  return Response.json({ success: true }, { headers: corsHeaders });
}

async function handleGetRuns(corsHeaders: Record<string, string>) {
  const runs = await db.select().from(schema.optimizationRuns);
  return Response.json(runs, { headers: corsHeaders });
}

async function handleGetEvents(runId: string, corsHeaders: Record<string, string>) {
  const events = await db.select()
    .from(schema.events)
    .where(eq(schema.events.runId, runId));

  const parsed = events.map(e => ({
    ...e,
    event: JSON.parse(e.event),
  }));

  return Response.json(parsed, { headers: corsHeaders });
}

console.log(`🚀 Server running at http://localhost:${PORT}`);
