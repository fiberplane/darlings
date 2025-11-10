import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { BunRequest } from "bun";
import { eq } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./db/schema";
import { runGEPA } from "./lib/gepa";
import { runGoldenOptimizer } from "./lib/golden-optimizer";
import { connectMCP, listTools } from "./lib/mcp-client";
import { MCPOAuthProvider } from "./lib/oauth-provider";
import { generateTestCases } from "./lib/test-generator";
import type { MCPConfig, OptimizationConfig, ProgressEvent } from "./types";
import homepage from "./ui/index.html";

const PORT = parseInt(process.env.PORT || "3000", 10);

// Store active MCP clients
const mcpClients = new Map<string, Client>();

// Store active optimization runs (for cancellation)
const activeRuns = new Map<string, AbortController>();

// CORS headers helper
const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

// HTTP logging helper
function logRequest(req: Request, status: number, startTime: number): void {
	const url = new URL(req.url);
	const method = req.method;
	const path = url.pathname;
	const duration = Date.now() - startTime;
	const statusColor =
		status >= 500
			? "\x1b[31m"
			: status >= 400
				? "\x1b[33m"
				: status >= 300
					? "\x1b[36m"
					: "\x1b[32m";
	const resetColor = "\x1b[0m";

	console.log(
		`${statusColor}${method}${resetColor} ${path} ${statusColor}${status}${resetColor} ${duration}ms`,
	);
}

export default {
	port: PORT,

	// Enable development mode for hot reloading and better error messages
	development: true,

	// Increase timeout for slow MCP operations
	idleTimeout: 60,

	routes: {
		// Bun automatically bundles HTML and transpiles TypeScript/TSX
		// According to Bun docs: https://bun.com/docs/bundler/fullstack
		// Pass HTML import directly - Bun handles bundling automatically
		// When passed directly (not in a function), Bun automatically:
		// - Scans for <script> and <link> tags
		// - Bundles and transpiles TypeScript/TSX
		// - Serves everything with proper paths
		"/": homepage,

		// API routes with parameters
		"/api/runs/:runId/events": async (
			req: BunRequest<"/api/runs/:runId/events">,
		) => {
			const startTime = Date.now();
			if (req.method !== "GET") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleGetEvents(req.params.runId, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/tests/:testId": async (req: BunRequest<"/api/tests/:testId">) => {
			const startTime = Date.now();
			if (req.method !== "DELETE") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleDeleteTest(req.params.testId, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		// API routes
		"/api/mcp/connect": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "POST") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleConnectMCP(req, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/mcp/servers/:serverId": async (
			req: BunRequest<"/api/mcp/servers/:serverId">,
		) => {
			const startTime = Date.now();
			if (req.method !== "DELETE") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleDeleteServer(
				req.params.serverId,
				corsHeaders,
			);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/mcp/servers": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "GET") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleListServers(corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/mcp/oauth/authorize": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "POST") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleOAuthAuthorize(req, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/mcp/oauth/callback": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "GET") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleOAuthCallback(req, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/mcp/oauth/refresh": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "POST") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleOAuthRefresh(req, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/mcp/tools": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "GET") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const url = new URL(req.url);
			const response = await handleListTools(url, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/tools/:toolId/selection": async (
			req: BunRequest<"/api/tools/:toolId/selection">,
		) => {
			const startTime = Date.now();
			if (req.method !== "PUT") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleUpdateToolSelection(
				req.params.toolId,
				req,
				corsHeaders,
			);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/tools/select-all": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "POST") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleSelectAllTools(req, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/tools/deselect-all": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "POST") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleDeselectAllTools(req, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/tests/generate": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "POST") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleGenerateTests(req, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/tests/add": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "POST") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleAddTest(req, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/tests": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "GET") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const url = new URL(req.url);
			const response = await handleGetTests(url, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/optimize/start": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "POST") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleStartOptimization(req, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/optimize/stop": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "POST") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleStopOptimization(req, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/runs": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "GET") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleGetRuns(corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/runs/active": async (req: Request) => {
			const startTime = Date.now();
			if (req.method !== "GET") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleGetActiveRuns(corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/runs/:runId/candidates": async (
			req: BunRequest<"/api/runs/:runId/candidates">,
		) => {
			const startTime = Date.now();
			if (req.method !== "GET") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const response = await handleGetCandidates(req.params.runId, corsHeaders);
			logRequest(req, response.status, startTime);
			return response;
		},

		"/api/runs/:runId/stream": async (
			req: BunRequest<"/api/runs/:runId/stream">,
		) => {
			const startTime = Date.now();
			if (req.method !== "GET") {
				const response = new Response("Method Not Allowed", {
					status: 405,
					headers: corsHeaders,
				});
				logRequest(req, 405, startTime);
				return response;
			}
			const url = new URL(req.url);
			const response = await handleStreamReconnect(
				req.params.runId,
				url,
				corsHeaders,
			);
			logRequest(req, response.status, startTime);
			return response;
		},
	},

	async fetch(req: Request) {
		const startTime = Date.now();

		// Handle CORS preflight
		if (req.method === "OPTIONS") {
			const response = new Response(null, { headers: corsHeaders });
			logRequest(req, 200, startTime);
			return response;
		}

		// Log all requests (routes handle their own responses)
		const url = new URL(req.url);
		const _path = url.pathname;

		// Routes handle matched paths, fetch handles unmatched
		try {
			const response = new Response("Not Found", {
				status: 404,
				headers: corsHeaders,
			});
			logRequest(req, 404, startTime);
			return response;
		} catch (error) {
			console.error("Server error:", error);
			const response = new Response(
				JSON.stringify({
					error:
						error instanceof Error ? error.message : "Internal server error",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json", ...corsHeaders },
				},
			);
			logRequest(req, 500, startTime);
			return response;
		}
	},
};

// OAuth Helper Functions
interface OAuthMetadata {
	authorization_endpoint: string;
	token_endpoint: string;
	registration_endpoint?: string;
	defaultScopes?: string;
}

async function discoverOAuthMetadata(
	serverUrl: string,
): Promise<OAuthMetadata | null> {
	const baseUrl = new URL(serverUrl);

	// Try OAuth 2.0 Authorization Server Metadata
	try {
		const metadataUrl = new URL(
			"/.well-known/oauth-authorization-server",
			baseUrl,
		);
		const response = await fetch(metadataUrl);
		if (response.ok) {
			const metadata = await response.json();
			return {
				authorization_endpoint: metadata.authorization_endpoint,
				token_endpoint: metadata.token_endpoint,
				registration_endpoint: metadata.registration_endpoint,
				defaultScopes: metadata.scopes_supported?.join(" "),
			};
		}
	} catch {
		// Continue to next attempt
	}

	// Try OpenID Connect Discovery
	try {
		const oidcUrl = new URL("/.well-known/openid-configuration", baseUrl);
		const response = await fetch(oidcUrl);
		if (response.ok) {
			const metadata = await response.json();
			return {
				authorization_endpoint: metadata.authorization_endpoint,
				token_endpoint: metadata.token_endpoint,
				registration_endpoint: metadata.registration_endpoint,
				defaultScopes: metadata.scopes_supported?.join(" "),
			};
		}
	} catch {
		// Continue to next attempt
	}

	return null;
}

async function registerOAuthClient(
	metadata: OAuthMetadata,
	serverId: string,
): Promise<{ client_id: string; client_secret?: string }> {
	const redirectUrl = `http://localhost:${PORT}/api/mcp/oauth/callback`;

	// If registration endpoint is available, use dynamic client registration
	if (metadata.registration_endpoint) {
		const registrationRequest = {
			client_name: `MCP Tool Optimizer - ${serverId.slice(0, 8)}`,
			redirect_uris: [redirectUrl],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none", // Public client with PKCE
		};

		try {
			const response = await fetch(metadata.registration_endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(registrationRequest),
			});

			if (response.ok) {
				const clientInfo = await response.json();
				return {
					client_id: clientInfo.client_id,
					client_secret: clientInfo.client_secret,
				};
			}
		} catch (error) {
			console.error("Dynamic client registration failed:", error);
		}
	}

	// Fallback: generate a client ID (for servers that don't require registration)
	// This is common in OAuth 2.1 with PKCE-only flows
	const generatedClientId = `mcp-optimizer-${serverId.slice(0, 8)}`;
	return {
		client_id: generatedClientId,
	};
}

// Handler functions
async function handleConnectMCP(
	req: Request,
	corsHeaders: Record<string, string>,
) {
	const { name, config }: { name: string; config: MCPConfig } =
		await req.json();

	try {
		const serverId = crypto.randomUUID();

		// Save to DB first (needed for OAuth provider)
		await db.insert(schema.mcpServers).values({
			id: serverId,
			name,
			config: JSON.stringify(config),
			createdAt: new Date(),
		});

		// Try to connect - detect OAuth from 401 response
		if (config.type === "http") {
			try {
				// Attempt initial connection without auth
				const client = await connectMCP(config);
				const tools = await listTools(client);

				for (const tool of tools) {
					await db.insert(schema.tools).values({
						id: tool.id,
						name: tool.name,
						description: tool.description,
						inputSchema: JSON.stringify(tool.inputSchema),
						serverId,
						optimizationStatus: "selected",
					});
				}

				mcpClients.set(serverId, client);
				return Response.json({ serverId, tools }, { headers: corsHeaders });
			} catch (error) {
				// Check if this is a 401 requiring OAuth
				const isUnauthorized =
					error instanceof Error &&
					(error.message.includes("401") ||
						error.message.includes("Unauthorized"));

				if (!isUnauthorized) {
					throw error;
				}

				// Try to get OAuth metadata from WWW-Authenticate header or discovery
				const oauthMetadata = await discoverOAuthMetadata(config.url);
				if (!oauthMetadata) {
					throw new Error(
						"Server requires authentication but OAuth metadata not found",
					);
				}

				// Perform dynamic client registration
				const clientInfo = await registerOAuthClient(oauthMetadata, serverId);

				// Save OAuth configuration
				await db
					.update(schema.mcpServers)
					.set({
						oauthClientId: clientInfo.client_id,
						oauthClientSecret: clientInfo.client_secret || null,
						oauthScopes: oauthMetadata.defaultScopes || null,
					})
					.where(eq(schema.mcpServers.id, serverId));

				// Create OAuth provider
				const redirectUrl = `http://localhost:${PORT}/api/mcp/oauth/callback`;
				const authProvider = new MCPOAuthProvider(
					serverId,
					clientInfo.client_id,
					clientInfo.client_secret,
					oauthMetadata.defaultScopes || "",
					redirectUrl,
					config.url,
				);

				// Generate authorization URL
				const { codeChallenge } = await authProvider.generatePKCE();

				// Use serverId as state to track which server this is for
				const state = serverId;

				const authUrl = new URL(oauthMetadata.authorization_endpoint);
				authUrl.searchParams.set("response_type", "code");
				authUrl.searchParams.set("client_id", clientInfo.client_id);
				authUrl.searchParams.set("redirect_uri", redirectUrl);
				authUrl.searchParams.set("code_challenge", codeChallenge);
				authUrl.searchParams.set("code_challenge_method", "S256");
				if (oauthMetadata.defaultScopes) {
					authUrl.searchParams.set("scope", oauthMetadata.defaultScopes);
				}
				authUrl.searchParams.set("state", state);

				return Response.json(
					{
						serverId,
						requiresAuth: true,
						authorizationUrl: authUrl.toString(),
					},
					{ headers: corsHeaders },
				);
			}
		}

		// Connect to MCP server (stdio)
		const client = await connectMCP(config);
		const tools = await listTools(client);

		for (const tool of tools) {
			await db.insert(schema.tools).values({
				id: tool.id,
				name: tool.name,
				description: tool.description,
				inputSchema: JSON.stringify(tool.inputSchema),
				serverId,
				optimizationStatus: "selected",
			});
		}

		// Store client for later use
		mcpClients.set(serverId, client);

		return Response.json({ serverId, tools }, { headers: corsHeaders });
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : "Connection failed" },
			{ status: 500, headers: corsHeaders },
		);
	}
}

async function handleListServers(corsHeaders: Record<string, string>) {
	const servers = await db.select().from(schema.mcpServers);
	return Response.json(servers, { headers: corsHeaders });
}

async function handleDeleteServer(
	serverId: string,
	corsHeaders: Record<string, string>,
) {
	try {
		// Delete associated tools first (cascade)
		await db.delete(schema.tools).where(eq(schema.tools.serverId, serverId));

		// Delete associated test cases
		const tools = await db
			.select()
			.from(schema.tools)
			.where(eq(schema.tools.serverId, serverId));
		const toolIds = tools.map((t) => t.id);
		if (toolIds.length > 0) {
			for (const toolId of toolIds) {
				await db
					.delete(schema.testCases)
					.where(eq(schema.testCases.toolId, toolId));
			}
		}

		// Delete the server
		await db
			.delete(schema.mcpServers)
			.where(eq(schema.mcpServers.id, serverId));

		// Clean up MCP client if exists
		const client = mcpClients.get(serverId);
		if (client) {
			try {
				await client.close();
			} catch (error) {
				console.error("Error closing MCP client:", error);
			}
			mcpClients.delete(serverId);
		}

		return Response.json({ success: true }, { headers: corsHeaders });
	} catch (error) {
		console.error("Error deleting server:", error);
		return Response.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to delete server",
			},
			{ status: 500, headers: corsHeaders },
		);
	}
}

async function handleOAuthAuthorize(
	req: Request,
	corsHeaders: Record<string, string>,
) {
	const { serverId }: { serverId: string } = await req.json();

	const server = await db
		.select()
		.from(schema.mcpServers)
		.where(eq(schema.mcpServers.id, serverId))
		.get();

	if (!server) {
		return Response.json(
			{ error: "Server not found" },
			{ status: 404, headers: corsHeaders },
		);
	}

	if (!server.oauthClientId) {
		return Response.json(
			{ error: "Server does not have OAuth configured" },
			{ status: 400, headers: corsHeaders },
		);
	}

	const config = JSON.parse(server.config) as MCPConfig;
	if (config.type !== "http") {
		return Response.json(
			{ error: "Server is not HTTP type" },
			{ status: 400, headers: corsHeaders },
		);
	}

	const redirectUrl = `http://localhost:${PORT}/api/mcp/oauth/callback`;
	const authProvider = new MCPOAuthProvider(
		serverId,
		server.oauthClientId,
		server.oauthClientSecret || undefined,
		server.oauthScopes || "",
		redirectUrl,
		config.url,
	);

	// Generate PKCE
	const { codeChallenge } = await authProvider.generatePKCE();

	// Use serverId as state to track which server this is for
	const state = serverId;

	// Discover authorization endpoint
	const serverUrl = new URL(config.url);
	const metadataUrl = new URL(
		"/.well-known/oauth-authorization-server",
		serverUrl,
	);

	let authorizationEndpoint: string;
	try {
		const metadataResponse = await fetch(metadataUrl);
		if (metadataResponse.ok) {
			const metadata = await metadataResponse.json();
			authorizationEndpoint = metadata.authorization_endpoint;
		} else {
			throw new Error("Failed to discover authorization endpoint");
		}
	} catch {
		// Try OIDC discovery
		const oidcUrl = new URL("/.well-known/openid-configuration", serverUrl);
		const oidcResponse = await fetch(oidcUrl);
		if (oidcResponse.ok) {
			const metadata = await oidcResponse.json();
			authorizationEndpoint = metadata.authorization_endpoint;
		} else {
			return Response.json(
				{ error: "Failed to discover authorization endpoint" },
				{ status: 500, headers: corsHeaders },
			);
		}
	}

	const authUrl = new URL(authorizationEndpoint);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("client_id", server.oauthClientId);
	authUrl.searchParams.set("redirect_uri", redirectUrl);
	authUrl.searchParams.set("code_challenge", codeChallenge);
	authUrl.searchParams.set("code_challenge_method", "S256");
	if (server.oauthScopes) {
		authUrl.searchParams.set("scope", server.oauthScopes);
	}
	authUrl.searchParams.set("state", state);

	return Response.json(
		{ authorizationUrl: authUrl.toString() },
		{ headers: corsHeaders },
	);
}

async function handleOAuthCallback(
	req: Request,
	corsHeaders: Record<string, string>,
) {
	const url = new URL(req.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");

	if (error) {
		return Response.json(
			{ error: `OAuth error: ${error}` },
			{ status: 400, headers: corsHeaders },
		);
	}

	if (!code) {
		return Response.json(
			{ error: "Authorization code not provided" },
			{ status: 400, headers: corsHeaders },
		);
	}

	// Get serverId from state parameter
	const serverId = state;
	if (!serverId) {
		return Response.json(
			{ error: "Server ID not found" },
			{ status: 400, headers: corsHeaders },
		);
	}

	const server = await db
		.select()
		.from(schema.mcpServers)
		.where(eq(schema.mcpServers.id, serverId))
		.get();

	if (!server) {
		return Response.json(
			{ error: "Server not found" },
			{ status: 404, headers: corsHeaders },
		);
	}

	const config = JSON.parse(server.config) as MCPConfig;
	if (config.type !== "http") {
		return Response.json(
			{ error: "Server is not HTTP type" },
			{ status: 400, headers: corsHeaders },
		);
	}

	if (!server.oauthClientId) {
		return Response.json(
			{ error: "Server does not have OAuth configured" },
			{ status: 400, headers: corsHeaders },
		);
	}

	const redirectUrl = `http://localhost:${PORT}/api/mcp/oauth/callback`;
	const authProvider = new MCPOAuthProvider(
		serverId,
		server.oauthClientId,
		server.oauthClientSecret || undefined,
		server.oauthScopes || "",
		redirectUrl,
		config.url,
	);

	// Exchange authorization code for tokens
	const codeVerifier = await authProvider.codeVerifier();

	// Discover token endpoint
	const serverUrl = new URL(config.url);
	const metadataUrl = new URL(
		"/.well-known/oauth-authorization-server",
		serverUrl,
	);

	let tokenEndpoint: string;
	try {
		const metadataResponse = await fetch(metadataUrl);
		if (metadataResponse.ok) {
			const metadata = await metadataResponse.json();
			tokenEndpoint = metadata.token_endpoint;
		} else {
			throw new Error("Failed to discover token endpoint");
		}
	} catch {
		// Try OIDC discovery
		const oidcUrl = new URL("/.well-known/openid-configuration", serverUrl);
		const oidcResponse = await fetch(oidcUrl);
		if (oidcResponse.ok) {
			const metadata = await oidcResponse.json();
			tokenEndpoint = metadata.token_endpoint;
		} else {
			return Response.json(
				{ error: "Failed to discover token endpoint" },
				{ status: 500, headers: corsHeaders },
			);
		}
	}

	const params = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		redirect_uri: String(redirectUrl),
		code_verifier: codeVerifier,
	});

	const headers = new Headers({
		"Content-Type": "application/x-www-form-urlencoded",
	});

	// Add client authentication
	if (server.oauthClientSecret && server.oauthClientId) {
		const credentials = btoa(
			`${server.oauthClientId}:${server.oauthClientSecret}`,
		);
		headers.set("Authorization", `Basic ${credentials}`);
	} else if (server.oauthClientId) {
		params.set("client_id", server.oauthClientId);
	}

	const tokenResponse = await fetch(tokenEndpoint, {
		method: "POST",
		headers,
		body: params,
	});

	if (!tokenResponse.ok) {
		const errorText = await tokenResponse.text();
		return Response.json(
			{ error: `Token exchange failed: ${errorText}` },
			{ status: tokenResponse.status, headers: corsHeaders },
		);
	}

	const tokens = (await tokenResponse.json()) as {
		access_token: string;
		refresh_token?: string;
		expires_in?: number;
		token_type?: string;
		scope?: string;
	};

	await authProvider.saveTokens({
		access_token: tokens.access_token,
		token_type: tokens.token_type || "Bearer",
		refresh_token: tokens.refresh_token,
		expires_in: tokens.expires_in,
		scope: tokens.scope,
	});

	// OAuth is complete! Don't try to fetch tools here - it causes issues.
	// The user can manually connect/refresh after authentication.
	console.log("[OAuth Callback] OAuth tokens saved successfully");
	console.log(
		"[OAuth Callback] User should reconnect or refresh to fetch tools",
	);

	// Return HTML that closes the popup and notifies parent
	return new Response(
		`<!DOCTYPE html>
<html>
<head>
	<title>Authorization Successful</title>
</head>
<body>
	<script>
		if (window.opener) {
			window.opener.postMessage({ type: 'oauth-success', serverId: '${serverId}' }, '*');
			window.close();
		} else {
			document.body.innerHTML = '<h1>Authorization Successful</h1><p>You can close this window.</p>';
		}
	</script>
</body>
</html>`,
		{
			headers: { "Content-Type": "text/html", ...corsHeaders },
		},
	);
}

async function handleOAuthRefresh(
	req: Request,
	corsHeaders: Record<string, string>,
) {
	const { serverId }: { serverId: string } = await req.json();

	const server = await db
		.select()
		.from(schema.mcpServers)
		.where(eq(schema.mcpServers.id, serverId))
		.get();

	if (!server) {
		return Response.json(
			{ error: "Server not found" },
			{ status: 404, headers: corsHeaders },
		);
	}

	if (!server.oauthRefreshToken) {
		return Response.json(
			{ error: "No refresh token available" },
			{ status: 400, headers: corsHeaders },
		);
	}

	const config = JSON.parse(server.config) as MCPConfig;
	if (config.type !== "http") {
		return Response.json(
			{ error: "Server is not HTTP type" },
			{ status: 400, headers: corsHeaders },
		);
	}

	if (!server.oauthClientId) {
		return Response.json(
			{ error: "Server does not have OAuth configured" },
			{ status: 400, headers: corsHeaders },
		);
	}

	const redirectUrl = `http://localhost:${PORT}/api/mcp/oauth/callback`;
	const authProvider = new MCPOAuthProvider(
		serverId,
		server.oauthClientId,
		server.oauthClientSecret || undefined,
		server.oauthScopes || "",
		redirectUrl,
		config.url,
	);

	// The provider's refreshToken method will be called automatically
	// when tokens() detects expired token, but we can also trigger it manually
	const tokens = await authProvider.tokens();

	return Response.json({ success: true, tokens }, { headers: corsHeaders });
}

async function handleListTools(url: URL, corsHeaders: Record<string, string>) {
	const serverId = url.searchParams.get("serverId");

	console.log("[List Tools] Called with serverId:", serverId);

	if (!serverId) {
		return Response.json(
			{ error: "serverId parameter required" },
			{ status: 400, headers: corsHeaders },
		);
	}

	// Check if we have cached tools
	let tools = await db
		.select()
		.from(schema.tools)
		.where(eq(schema.tools.serverId, serverId));

	console.log("[List Tools] Found", tools.length, "cached tools");

	// If no tools, initialize the connection and fetch them
	if (tools.length === 0) {
		console.log(
			"[List Tools] No cached tools, initializing connection for:",
			serverId,
		);

		const servers = await db
			.select()
			.from(schema.mcpServers)
			.where(eq(schema.mcpServers.id, serverId));

		if (servers.length === 0) {
			return Response.json(
				{ error: "Server not found" },
				{ status: 404, headers: corsHeaders },
			);
		}

		const server = servers[0];
		if (!server) {
			return Response.json(
				{ error: "Server not found" },
				{ status: 404, headers: corsHeaders },
			);
		}

		// Check if server needs OAuth but doesn't have a token
		if (server.oauthClientId && !server.oauthAccessToken) {
			return Response.json(
				{ error: "needsAuth", message: "Server requires authentication" },
				{ status: 401, headers: corsHeaders },
			);
		}

		const config = JSON.parse(server.config);

		// Build auth provider if we have OAuth credentials
		let authProvider: OAuthClientProvider | undefined;
		if (server.oauthClientId && server.oauthAccessToken) {
			authProvider = new MCPOAuthProvider(
				serverId,
				server.oauthClientId,
				server.oauthClientSecret || undefined,
				server.oauthScopes || "",
				`http://localhost:${PORT}/api/mcp/oauth/callback`,
				config.type === "http" ? config.url : "",
			);
		}

		console.log("[List Tools] Connecting to MCP server:", serverId);
		const client = await connectMCP(config, authProvider);
		console.log("[List Tools] Connected, fetching tools...");

		const fetchedTools = await listTools(client);
		console.log(`[List Tools] Fetched ${fetchedTools.length} tools`);

		// Delete existing tools for this server (if any)
		await db.delete(schema.tools).where(eq(schema.tools.serverId, serverId));

		// Insert new tools
		for (const tool of fetchedTools) {
			await db.insert(schema.tools).values({
				id: tool.id,
				name: tool.name,
				description: tool.description,
				inputSchema: JSON.stringify(tool.inputSchema),
				serverId,
				optimizationStatus: "selected",
			});
		}

		mcpClients.set(serverId, client);

		// Re-fetch from DB to return the same format
		tools = await db
			.select()
			.from(schema.tools)
			.where(eq(schema.tools.serverId, serverId));
	}

	return Response.json(tools, { headers: corsHeaders });
}

async function handleUpdateToolSelection(
	toolId: string,
	req: Request,
	corsHeaders: Record<string, string>,
) {
	const {
		optimizationStatus,
	}: { optimizationStatus: "selected" | "unselected" } = await req.json();

	if (
		optimizationStatus !== "selected" &&
		optimizationStatus !== "unselected"
	) {
		return Response.json(
			{
				error: "Invalid optimizationStatus. Must be 'selected' or 'unselected'",
			},
			{ status: 400, headers: corsHeaders },
		);
	}

	await db
		.update(schema.tools)
		.set({ optimizationStatus })
		.where(eq(schema.tools.id, toolId));

	return Response.json({ success: true }, { headers: corsHeaders });
}

async function handleSelectAllTools(
	req: Request,
	corsHeaders: Record<string, string>,
) {
	const { serverId }: { serverId: string } = await req.json();

	await db
		.update(schema.tools)
		.set({ optimizationStatus: "selected" })
		.where(eq(schema.tools.serverId, serverId));

	return Response.json({ success: true }, { headers: corsHeaders });
}

async function handleDeselectAllTools(
	req: Request,
	corsHeaders: Record<string, string>,
) {
	const { serverId }: { serverId: string } = await req.json();

	await db
		.update(schema.tools)
		.set({ optimizationStatus: "unselected" })
		.where(eq(schema.tools.serverId, serverId));

	return Response.json({ success: true }, { headers: corsHeaders });
}

async function handleGenerateTests(
	req: Request,
	corsHeaders: Record<string, string>,
) {
	const { serverId, testsPerTool, model, customPrompt } = await req.json();

	const toolsData = await db
		.select()
		.from(schema.tools)
		.where(eq(schema.tools.serverId, serverId));

	const tools = toolsData
		.filter(
			(t): t is typeof t & { serverId: string } =>
				t.serverId !== null && t.optimizationStatus === "selected",
		)
		.map((t) => ({
			id: t.id,
			name: t.name,
			description: t.description,
			inputSchema: JSON.parse(t.inputSchema),
			serverId: t.serverId,
		}));

	// Delete existing auto-generated test cases for these tools
	const toolIds = tools.map((t) => t.id);
	const existingTests = await db.select().from(schema.testCases);
	const autoGeneratedTests = existingTests.filter(
		(t) =>
			t.toolId !== null &&
			toolIds.includes(t.toolId) &&
			t.userCreated === false,
	);

	for (const test of autoGeneratedTests) {
		await db.delete(schema.testCases).where(eq(schema.testCases.id, test.id));
	}

	const testCases = await generateTestCases(
		tools,
		testsPerTool,
		model,
		customPrompt,
	);

	// Save to DB
	for (const testCase of testCases) {
		await db.insert(schema.testCases).values(testCase);
	}

	return Response.json({ testCases }, { headers: corsHeaders });
}

async function handleGetTests(url: URL, corsHeaders: Record<string, string>) {
	const serverId = url.searchParams.get("serverId");

	if (!serverId) {
		// Get all test cases
		const tests = await db.select().from(schema.testCases);
		return Response.json(tests, { headers: corsHeaders });
	}

	// Get test cases for specific server
	const tools = await db
		.select()
		.from(schema.tools)
		.where(eq(schema.tools.serverId, serverId));

	const toolIds = tools.map((t) => t.id);
	const tests = await db.select().from(schema.testCases);

	const filteredTests = tests.filter(
		(t): t is typeof t & { toolId: string } =>
			t.toolId !== null && toolIds.includes(t.toolId),
	);

	return Response.json(filteredTests, { headers: corsHeaders });
}

async function handleAddTest(
	req: Request,
	corsHeaders: Record<string, string>,
) {
	const testCase = await req.json();

	await db.insert(schema.testCases).values({
		id: crypto.randomUUID(),
		...testCase,
		userCreated: true,
	});

	return Response.json({ success: true }, { headers: corsHeaders });
}

async function handleDeleteTest(
	testId: string,
	corsHeaders: Record<string, string>,
) {
	await db.delete(schema.testCases).where(eq(schema.testCases.id, testId));

	return Response.json({ success: true }, { headers: corsHeaders });
}

async function handleStartOptimization(
	req: Request,
	corsHeaders: Record<string, string>,
) {
	const { serverId, config }: { serverId: string; config: OptimizationConfig } =
		await req.json();

	// Get tools and test cases
	const toolsData = await db
		.select()
		.from(schema.tools)
		.where(eq(schema.tools.serverId, serverId));

	const tools = toolsData
		.filter(
			(t): t is typeof t & { serverId: string } =>
				t.serverId !== null && t.optimizationStatus === "selected",
		)
		.map((t) => ({
			id: t.id,
			name: t.name,
			description: t.description,
			inputSchema: JSON.parse(t.inputSchema),
			serverId: t.serverId,
		}));

	const testCasesData = await db.select().from(schema.testCases);

	// Filter test cases for this server's selected tools
	const toolIds = tools.map((t) => t.id);
	const testCases = testCasesData
		.filter(
			(t): t is typeof t & { toolId: string; userCreated: boolean } =>
				t.toolId !== null &&
				toolIds.includes(t.toolId) &&
				t.userCreated !== null,
		)
		.map((t) => ({
			id: t.id,
			toolId: t.toolId,
			query: t.query,
			expectedTool: t.expectedTool,
			userCreated: t.userCreated,
		}));

	const runId = crypto.randomUUID();

	// Create run record
	await db.insert(schema.optimizationRuns).values({
		id: runId,
		serverId,
		startedAt: new Date(),
		config: JSON.stringify(config),
		status: "running",
	});

	// Create SSE stream
	const abortController = new AbortController();
	activeRuns.set(runId, abortController);

	const stream = new ReadableStream({
		async start(controller) {
			let clientConnected = true;

			// Helper to safely send events to client
			const sendToClient = (data: string) => {
				if (!clientConnected) return;
				try {
					controller.enqueue(new TextEncoder().encode(data));
				} catch (_error) {
					// Stream closed - client disconnected
					console.log(`Client disconnected from optimization ${runId}`);
					clientConnected = false;
				}
			};

			try {
				// Emit optimization start event with runId
				const startEvent: ProgressEvent = {
					type: "optimization_start",
					runId,
				};
				const startData = `data: ${JSON.stringify(startEvent)}\n\n`;
				sendToClient(startData);

				// Choose optimizer based on config
				if (config.optimizer === "golden") {
					await runGoldenOptimizer({
						runId,
						tools,
						model: config.model,
						maxConcurrentEvaluations: config.maxConcurrentEvaluations,
						testCasesPerCategory: config.testCasesPerCategory || 10,
						candidateCount: config.candidateCount || 10,
						onProgress: async (event: ProgressEvent) => {
							// Check if aborted
							if (abortController.signal.aborted) {
								if (clientConnected) {
									try {
										controller.close();
									} catch {
										// Already closed
									}
								}
								return;
							}

							// Send event to client (non-blocking if disconnected)
							const data = `data: ${JSON.stringify(event)}\n\n`;
							sendToClient(data);

							// Save to DB for replay (await to ensure persistence)
							await db.insert(schema.events).values({
								id: crypto.randomUUID(),
								runId,
								timestamp: new Date(),
								event: JSON.stringify(event),
							});

							// Persist golden test cases
							if (event.type === "test_case_generated") {
								await db.insert(schema.testCases).values({
									id: event.testCaseId,
									toolId: event.toolId,
									query: event.query,
									expectedTool: event.expectedTool,
									userCreated: false,
									runId,
									invocationType: event.invocationType,
									shouldCall: event.shouldCall,
								});
							}

							// Persist candidate data (Golden optimizer)
							if (event.type === "candidate_done") {
								await db.insert(schema.candidates).values({
									id: event.candidateId,
									runId,
									generation: event.generation,
									toolDescriptions: JSON.stringify(event.toolDescriptions),
									accuracy: event.accuracy,
									avgDescriptionLength: event.avgLength,
									isPareto: event.isPareto,
									precision: event.precision,
									recall: event.recall,
									variationType: event.variationType,
									status: event.status,
									rejectionReason: event.rejectionReason,
									parentId: event.parentId,
								});
							}

							// Persist evaluation data
							if (event.type === "evaluation") {
								await db.insert(schema.evaluations).values({
									id: crypto.randomUUID(),
									candidateId: event.candidateId,
									testCaseId: event.testCase, // Using query as testCaseId
									selectedTool: event.result.selected,
									correct: event.result.correct,
								});
							}
						},
					});
				} else {
					await runGEPA({
						runId,
						tools,
						testCases,
						...config,
						onProgress: async (event: ProgressEvent) => {
							// Check if aborted
							if (abortController.signal.aborted) {
								if (clientConnected) {
									try {
										controller.close();
									} catch {
										// Already closed
									}
								}
								return;
							}

							// Send event to client (non-blocking if disconnected)
							const data = `data: ${JSON.stringify(event)}\n\n`;
							sendToClient(data);

							// Save to DB for replay (await to ensure persistence)
							await db.insert(schema.events).values({
								id: crypto.randomUUID(),
								runId,
								timestamp: new Date(),
								event: JSON.stringify(event),
							});

							// Persist candidate data (GEPA)
							if (event.type === "candidate_done") {
								await db.insert(schema.candidates).values({
									id: event.candidateId,
									runId,
									generation: event.generation,
									toolDescriptions: JSON.stringify(event.toolDescriptions),
									accuracy: event.accuracy,
									avgDescriptionLength: event.avgLength,
									isPareto: event.isPareto,
									precision: event.precision,
									recall: event.recall,
									variationType: event.variationType,
									status: event.status,
									rejectionReason: event.rejectionReason,
									parentId: event.parentId,
								});
							}

							// Persist evaluation data
							if (event.type === "evaluation") {
								await db.insert(schema.evaluations).values({
									id: crypto.randomUUID(),
									candidateId: event.candidateId,
									testCaseId: event.testCase, // Using query as testCaseId
									selectedTool: event.result.selected,
									correct: event.result.correct,
								});
							}

							// Handle GEPA-specific events
							if (event.type === "iteration_start") {
								// Create iteration record
								await db.insert(schema.iterations).values({
									id: `${runId}-iter-${event.iteration}`,
									runId,
									iterationNumber: event.iteration,
									startedAt: new Date(),
									totalEvaluations: event.totalEvaluations,
								});
							}

							if (event.type === "parent_selected") {
								// Update iteration with parent candidate
								await db
									.update(schema.iterations)
									.set({
										parentCandidateId: event.candidateId,
									})
									.where(
										eq(
											schema.iterations.id,
											`${runId}-iter-${event.iteration}`,
										),
									);
							}

							if (event.type === "subsample_eval") {
								// Update iteration with subsample scores
								await db
									.update(schema.iterations)
									.set({
										subsampleScore: event.subsampleScore,
										parentSubsampleScore: event.parentSubsampleScore,
										subsampleSize: event.subsampleSize,
									})
									.where(
										eq(
											schema.iterations.id,
											`${runId}-iter-${event.iteration ?? 0}`,
										),
									);
							}

							if (event.type === "offspring_accepted") {
								// Update candidate with GEPA metadata
								await db
									.update(schema.candidates)
									.set({
										iteration: event.iteration,
										archiveIndex: event.archiveIndex,
										parentId: event.parentId,
									})
									.where(eq(schema.candidates.id, event.candidateId));

								// Update iteration with offspring and acceptance
								await db
									.update(schema.iterations)
									.set({
										offspringCandidateId: event.candidateId,
										accepted: true,
										completedAt: new Date(),
									})
									.where(
										eq(
											schema.iterations.id,
											`${runId}-iter-${event.iteration}`,
										),
									);
							}

							if (event.type === "offspring_rejected") {
								// Update iteration with rejection
								await db
									.update(schema.iterations)
									.set({
										accepted: false,
										rejectionReason: event.reason,
										completedAt: new Date(),
									})
									.where(
										eq(
											schema.iterations.id,
											`${runId}-iter-${event.iteration}`,
										),
									);
							}

							if (event.type === "iteration_done") {
								// Update iteration with final stats
								await db
									.update(schema.iterations)
									.set({
										totalEvaluations: event.totalEvaluations,
										completedAt: new Date(),
									})
									.where(
										eq(
											schema.iterations.id,
											`${runId}-iter-${event.iteration}`,
										),
									);
							}
						},
					});
				}

				// Mark as completed
				await db
					.update(schema.optimizationRuns)
					.set({
						completedAt: new Date(),
						status: "completed",
					})
					.where(eq(schema.optimizationRuns.id, runId));

				if (clientConnected) {
					try {
						controller.close();
					} catch {
						// Already closed
					}
				}
				activeRuns.delete(runId);
			} catch (error) {
				console.error("Optimization error:", error);

				// Mark as failed
				await db
					.update(schema.optimizationRuns)
					.set({ status: "failed" })
					.where(eq(schema.optimizationRuns.id, runId));

				const errorEvent = {
					type: "error",
					message: error instanceof Error ? error.message : "Unknown error",
				};
				const data = `data: ${JSON.stringify(errorEvent)}\n\n`;
				sendToClient(data);

				if (clientConnected) {
					try {
						controller.close();
					} catch {
						// Already closed
					}
				}
				activeRuns.delete(runId);
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			...corsHeaders,
		},
	});
}

async function handleStopOptimization(
	req: Request,
	corsHeaders: Record<string, string>,
) {
	const { runId } = await req.json();

	const abortController = activeRuns.get(runId);
	if (abortController) {
		abortController.abort();
		activeRuns.delete(runId);

		// Update status in DB - mark as completed (user stopped)
		await db
			.update(schema.optimizationRuns)
			.set({
				status: "completed",
				completedAt: new Date(),
			})
			.where(eq(schema.optimizationRuns.id, runId));
	}

	return Response.json({ success: true }, { headers: corsHeaders });
}

async function handleGetRuns(corsHeaders: Record<string, string>) {
	const runs = await db.select().from(schema.optimizationRuns);
	return Response.json(runs, { headers: corsHeaders });
}

async function handleGetActiveRuns(corsHeaders: Record<string, string>) {
	// Get runs with status "running"
	const runningRuns = await db
		.select()
		.from(schema.optimizationRuns)
		.where(eq(schema.optimizationRuns.status, "running"));

	// Enrich with current state from activeRuns map
	const activeRuns_enriched = runningRuns.map((run) => {
		const isActive = activeRuns.has(run.id);
		return {
			...run,
			isActive, // Still has active controller
		};
	});

	return Response.json(activeRuns_enriched, { headers: corsHeaders });
}

async function handleStreamReconnect(
	runId: string,
	url: URL,
	corsHeaders: Record<string, string>,
) {
	// Check if run exists
	const run = await db
		.select()
		.from(schema.optimizationRuns)
		.where(eq(schema.optimizationRuns.id, runId))
		.get();

	if (!run) {
		return new Response(JSON.stringify({ error: "Run not found" }), {
			status: 404,
			headers: { ...corsHeaders, "Content-Type": "application/json" },
		});
	}

	// Get replay starting point
	const fromParam = url.searchParams.get("from");
	const fromTimestamp = fromParam ? new Date(fromParam) : null;

	// Fetch past events from database
	const allEvents = await db
		.select()
		.from(schema.events)
		.where(eq(schema.events.runId, runId));

	const eventsToReplay = fromTimestamp
		? allEvents.filter((e) => e.timestamp > fromTimestamp)
		: allEvents;

	// Sort by timestamp
	eventsToReplay.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

	const stream = new ReadableStream({
		start(controller) {
			// First, replay all past events
			for (const eventRow of eventsToReplay) {
				const data = `data: ${eventRow.event}\n\n`;
				try {
					controller.enqueue(new TextEncoder().encode(data));
				} catch {
					// Client disconnected during replay
					return;
				}
			}

			// If optimization is completed or failed, close stream
			if (run.status !== "running") {
				try {
					controller.close();
				} catch {
					// Already closed
				}
				return;
			}

			// TODO: If still running, attach to live stream
			// For now, just close after replay
			// In a full implementation, we'd need to refactor the optimization
			// stream to support multiple listeners
			try {
				controller.close();
			} catch {
				// Already closed
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			...corsHeaders,
		},
	});
}

async function handleGetEvents(
	runId: string,
	corsHeaders: Record<string, string>,
) {
	const events = await db
		.select()
		.from(schema.events)
		.where(eq(schema.events.runId, runId));

	const parsed = events.map((e) => ({
		...e,
		event: JSON.parse(e.event),
	}));

	return Response.json(parsed, { headers: corsHeaders });
}

async function handleGetCandidates(
	runId: string,
	corsHeaders: Record<string, string>,
) {
	const candidatesData = await db
		.select()
		.from(schema.candidates)
		.where(eq(schema.candidates.runId, runId))
		.orderBy(schema.candidates.generation, schema.candidates.accuracy);

	// Fetch evaluations for all candidates
	const candidates = await Promise.all(
		candidatesData.map(async (c) => {
			const evaluationsData = await db
				.select()
				.from(schema.evaluations)
				.where(eq(schema.evaluations.candidateId, c.id));

			const evaluations = evaluationsData.map((e) => ({
				testCaseId: e.testCaseId ?? "",
				selectedTool: e.selectedTool,
				expectedTool: "", // We don't store this separately, could derive from testCase
				correct: e.correct,
			}));

			return {
				id: c.id,
				generation: c.generation,
				iteration: c.iteration,
				parentId: c.parentId,
				toolDescriptions: JSON.parse(c.toolDescriptions),
				accuracy: c.accuracy,
				avgDescriptionLength: c.avgDescriptionLength,
				isPareto: c.isPareto,
				rejected: c.status === "rejected",
				rejectionReason: c.rejectionReason ?? undefined,
				evaluations,
			};
		}),
	);

	return Response.json(candidates, { headers: corsHeaders });
}

console.log(`🚀 Server running at http://localhost:${PORT}`);
