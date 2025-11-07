import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MCPConfig, Tool } from "../types";

/**
 * Connect to an MCP server (stdio or HTTP)
 */
export async function connectMCP(
	config: MCPConfig,
	authProvider?: OAuthClientProvider,
): Promise<Client> {
	console.log("[connectMCP] config.type:", config.type);
	console.log("[connectMCP] authProvider present:", !!authProvider);

	// Create client
	const client = new Client(
		{
			name: "mcp-tool-optimizer",
			version: "1.0.0",
		},
		{
			capabilities: {},
		},
	);

	// Create transport based on config type
	let transport: StdioClientTransport | StreamableHTTPClientTransport;
	if (config.type === "stdio") {
		transport = new StdioClientTransport({
			command: config.command,
			args: config.args,
		});
	} else {
		// HTTP transport
		const url = new URL(config.url);
		transport = new StreamableHTTPClientTransport(url, {
			authProvider,
			requestInit: config.headers
				? {
						headers: config.headers,
					}
				: undefined,
		});
	}

	console.log(
		"[connectMCP] transport config:",
		JSON.stringify({
			type: config.type,
			url: config.type === "http" ? config.url : undefined,
			hasAuthProvider: !!authProvider,
		}),
	);

	// Connect to server
	await client.connect(transport);

	console.log("[connectMCP] client connected successfully");

	return client;
}

/**
 * List all tools from a connected MCP server
 */
export async function listTools(client: Client): Promise<Tool[]> {
	console.log("[listTools] Starting to call client.listTools()...");
	const startTime = Date.now();

	let toolsResult: { tools: Tool[] } | undefined;
	try {
		// Add a 30 second timeout for HTTP connections
		const timeoutPromise = new Promise((_, reject) => {
			setTimeout(
				() =>
					reject(new Error("client.listTools() timed out after 30 seconds")),
				30000,
			);
		});

		toolsResult = (await Promise.race([client.listTools(), timeoutPromise])) as
			| { tools: Tool[] }
			| undefined;
		console.log(
			`[listTools] client.listTools() completed in ${Date.now() - startTime}ms`,
		);
	} catch (error) {
		console.error(
			"[listTools] client.listTools() failed after",
			Date.now() - startTime,
			"ms",
		);
		console.error("[listTools] Error:", error);
		console.error(
			"[listTools] This usually means the MCP server is not responding to the tools/list request",
		);
		throw error;
	}

	console.log("=== RAW TOOLS RESULT FROM MCP CLIENT ===");
	console.log("Type:", typeof toolsResult);
	console.log("Tools array length:", toolsResult.tools?.length || 0);
	console.log(
		"First tool:",
		JSON.stringify(toolsResult.tools?.[0], null, 2) || "none",
	);
	console.log("=== END RAW TOOLS ===\n");

	// MCP SDK returns { tools: [...] } format
	return (toolsResult.tools || []).map((tool) => ({
		id: crypto.randomUUID(),
		name: tool.name,
		description: tool.description || "",
		inputSchema: tool.inputSchema || {},
		serverId: "", // Will be set by caller
	}));
}

/**
 * Disconnect from MCP server
 */
export async function disconnectMCP(client: Client): Promise<void> {
	await client.close();
}
