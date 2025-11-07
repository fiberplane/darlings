import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { MCPConfig, Tool } from '../types';

/**
 * Connect to an MCP server (stdio or HTTP)
 */
export async function connectMCP(config: MCPConfig): Promise<Client> {
  const client = new Client({
    name: "mcp-tool-optimizer",
    version: "1.0.0"
  }, {
    capabilities: {}
  });

  const transport = config.type === "stdio"
    ? new StdioClientTransport({
        command: config.command,
        args: config.args,
      })
    : new SSEClientTransport(new URL(config.url));

  await client.connect(transport);
  return client;
}

/**
 * List all tools from a connected MCP server
 */
export async function listTools(client: Client): Promise<Tool[]> {
  const result = await client.listTools();

  return result.tools.map(tool => ({
    id: crypto.randomUUID(),
    name: tool.name,
    description: tool.description || '',
    inputSchema: tool.inputSchema || {},
    serverId: '', // Will be set by caller
  }));
}

/**
 * Disconnect from MCP server
 */
export async function disconnectMCP(client: Client): Promise<void> {
  await client.close();
}
