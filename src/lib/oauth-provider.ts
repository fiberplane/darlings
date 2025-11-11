import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
	AuthorizationServerMetadata,
	OAuthClientInformation,
	OAuthClientMetadata,
	OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";

/**
 * Generate PKCE code verifier and challenge
 */
async function generatePKCE(): Promise<{
	codeVerifier: string;
	codeChallenge: string;
}> {
	// Generate a random code verifier (43-128 characters)
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	const codeVerifier = btoa(String.fromCharCode(...array))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");

	// Generate code challenge using SHA256
	const encoder = new TextEncoder();
	const data = encoder.encode(codeVerifier);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const codeChallenge = btoa(String.fromCharCode(...hashArray))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");

	return { codeVerifier, codeChallenge };
}

/**
 * OAuth provider implementation for MCP servers
 */
export class MCPOAuthProvider implements OAuthClientProvider {
	private serverId: string;
	private clientId: string;
	private clientSecret: string | undefined;
	private scopes: string;
	private redirectUrlValue: string | URL;
	private serverUrl: string | URL;

	constructor(
		serverId: string,
		clientId: string,
		clientSecret: string | undefined,
		scopes: string,
		redirectUrl: string | URL,
		serverUrl: string | URL,
	) {
		this.serverId = serverId;
		this.clientId = clientId;
		this.clientSecret = clientSecret;
		this.scopes = scopes;
		this.redirectUrlValue = redirectUrl;
		this.serverUrl = serverUrl;
	}

	async tokens(): Promise<OAuthTokens | undefined> {
		console.log("[OAuthProvider.tokens] Called for serverId:", this.serverId);
		const server = await db
			.select()
			.from(schema.mcpServers)
			.where(eq(schema.mcpServers.id, this.serverId))
			.get();

		console.log("[OAuthProvider.tokens] Found server:", !!server);
		console.log(
			"[OAuthProvider.tokens] Has access token:",
			!!server?.oauthAccessToken,
		);

		if (!server?.oauthAccessToken) {
			console.log(
				"[OAuthProvider.tokens] No access token, returning undefined",
			);
			return undefined;
		}

		// Check if token is expired
		if (server.oauthTokenExpiry && server.oauthTokenExpiry < new Date()) {
			// Token expired, try to refresh
			if (server.oauthRefreshToken) {
				await this.refreshToken(server.oauthRefreshToken);
				// Re-fetch after refresh
				const refreshed = await db
					.select()
					.from(schema.mcpServers)
					.where(eq(schema.mcpServers.id, this.serverId))
					.get();
				if (refreshed?.oauthAccessToken) {
					return {
						access_token: refreshed.oauthAccessToken,
						token_type: "Bearer",
						refresh_token: refreshed.oauthRefreshToken || undefined,
						expires_in: refreshed.oauthTokenExpiry
							? Math.floor(
									(refreshed.oauthTokenExpiry.getTime() - Date.now()) / 1000,
								)
							: undefined,
						scope: refreshed.oauthScopes || undefined,
					};
				}
			}
			return undefined;
		}

		const tokens = {
			access_token: server.oauthAccessToken,
			token_type: "Bearer",
			refresh_token: server.oauthRefreshToken || undefined,
			expires_in: server.oauthTokenExpiry
				? Math.floor((server.oauthTokenExpiry.getTime() - Date.now()) / 1000)
				: undefined,
			scope: server.oauthScopes || undefined,
		};

		console.log("[OAuthProvider.tokens] Returning tokens:");
		console.log("  - expires_in:", tokens.expires_in);
		console.log("  - scope:", tokens.scope);
		console.log(
			"  - access_token (first 20 chars):",
			`${tokens.access_token.substring(0, 20)}...`,
		);
		return tokens;
	}

	async saveTokens(tokens: OAuthTokens): Promise<void> {
		const expiresAt = tokens.expires_in
			? new Date(Date.now() + tokens.expires_in * 1000)
			: undefined;

		await db
			.update(schema.mcpServers)
			.set({
				oauthAccessToken: tokens.access_token,
				oauthRefreshToken: tokens.refresh_token || null,
				oauthTokenExpiry: expiresAt || null,
			})
			.where(eq(schema.mcpServers.id, this.serverId));
	}

	async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
		// Store authorization URL in a way that the UI can access it
		// For now, we'll throw an error that the server can catch and return the URL
		throw new AuthorizationRedirectError(authorizationUrl.toString());
	}

	async saveCodeVerifier(codeVerifier: string): Promise<void> {
		await db
			.update(schema.mcpServers)
			.set({ oauthCodeVerifier: codeVerifier })
			.where(eq(schema.mcpServers.id, this.serverId));
	}

	async codeVerifier(): Promise<string> {
		const server = await db
			.select()
			.from(schema.mcpServers)
			.where(eq(schema.mcpServers.id, this.serverId))
			.get();

		if (!server?.oauthCodeVerifier) {
			throw new Error("Code verifier not found");
		}

		return server.oauthCodeVerifier;
	}

	async addClientAuthentication?(
		headers: Headers,
		params: URLSearchParams,
		_url: string | URL,
		_metadata?: AuthorizationServerMetadata,
	): Promise<void> {
		// Add client credentials to request
		if (this.clientSecret) {
			// Use HTTP Basic Auth or client_secret in body
			const credentials = btoa(`${this.clientId}:${this.clientSecret}`);
			headers.set("Authorization", `Basic ${credentials}`);
		} else {
			// Public client - add client_id to params
			params.set("client_id", this.clientId);
		}
	}

	async invalidateCredentials?(
		scope: "all" | "client" | "tokens" | "verifier",
	): Promise<void> {
		const updates: Partial<typeof schema.mcpServers.$inferInsert> = {};

		if (scope === "all" || scope === "tokens") {
			updates.oauthAccessToken = null;
			updates.oauthRefreshToken = null;
			updates.oauthTokenExpiry = null;
		}

		if (scope === "all" || scope === "verifier") {
			updates.oauthCodeVerifier = null;
		}

		if (scope === "all" || scope === "client") {
			updates.oauthClientId = null;
			updates.oauthClientSecret = null;
		}

		await db
			.update(schema.mcpServers)
			.set(updates)
			.where(eq(schema.mcpServers.id, this.serverId));
	}

	get redirectUrl(): string | URL {
		return this.redirectUrlValue;
	}

	get clientMetadata(): OAuthClientMetadata {
		return {
			redirect_uris: [String(this.redirectUrlValue)],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			scope: this.scopes,
		};
	}

	async clientInformation(): Promise<OAuthClientInformation | undefined> {
		const server = await db
			.select()
			.from(schema.mcpServers)
			.where(eq(schema.mcpServers.id, this.serverId))
			.get();

		if (!server?.oauthClientId) {
			return undefined;
		}

		return {
			client_id: server.oauthClientId,
			client_secret: server.oauthClientSecret || undefined,
		};
	}

	async saveClientInformation?(
		clientInformation: OAuthClientInformation,
	): Promise<void> {
		await db
			.update(schema.mcpServers)
			.set({
				oauthClientId: clientInformation.client_id,
				oauthClientSecret: clientInformation.client_secret || null,
			})
			.where(eq(schema.mcpServers.id, this.serverId));
	}

	async state?(): Promise<string> {
		// Generate a random state for CSRF protection
		const array = new Uint8Array(16);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=/g, "");
	}

	async validateResourceURL?(
		serverUrl: string | URL,
		resource?: string,
	): Promise<URL | undefined> {
		// Validate that the resource URL belongs to the same server
		const serverUrlStr = String(serverUrl);
		const expectedServerUrlStr = String(this.serverUrl);

		if (serverUrlStr.startsWith(expectedServerUrlStr)) {
			return new URL(resource || serverUrlStr, serverUrlStr);
		}

		return undefined;
	}

	/**
	 * Generate PKCE code verifier and challenge for authorization
	 */
	async generatePKCE(): Promise<{
		codeVerifier: string;
		codeChallenge: string;
	}> {
		const { codeVerifier, codeChallenge } = await generatePKCE();
		await this.saveCodeVerifier(codeVerifier);
		return { codeVerifier, codeChallenge };
	}

	/**
	 * Refresh access token using refresh token
	 */
	private async refreshToken(refreshToken: string): Promise<void> {
		// Get OAuth metadata from server
		const serverUrl = new URL(this.serverUrl);
		const metadataUrl = new URL(
			"/.well-known/oauth-authorization-server",
			serverUrl,
		);
		// Or try OIDC discovery
		const oidcUrl = new URL("/.well-known/openid-configuration", serverUrl);

		let metadata: AuthorizationServerMetadata | undefined;

		try {
			const response = await fetch(metadataUrl);
			if (response.ok) {
				metadata = (await response.json()) as AuthorizationServerMetadata;
			}
		} catch {
			// Try OIDC discovery
			try {
				const response = await fetch(oidcUrl);
				if (response.ok) {
					metadata = (await response.json()) as AuthorizationServerMetadata;
				}
			} catch {
				// Metadata discovery failed
			}
		}

		if (!metadata?.token_endpoint) {
			throw new Error("Unable to discover token endpoint");
		}

		const params = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: this.clientId,
		});

		const headers = new Headers({
			"Content-Type": "application/x-www-form-urlencoded",
		});

		if (this.clientSecret) {
			await this.addClientAuthentication?.(
				headers,
				params,
				metadata.token_endpoint,
				metadata,
			);
		}

		const response = await fetch(metadata.token_endpoint, {
			method: "POST",
			headers,
			body: params,
		});

		if (!response.ok) {
			throw new Error(`Token refresh failed: ${response.statusText}`);
		}

		const tokens = (await response.json()) as OAuthTokens;
		await this.saveTokens(tokens);
	}
}

/**
 * Custom error to signal authorization redirect needed
 */
export class AuthorizationRedirectError extends Error {
	constructor(public authorizationUrl: string) {
		super("Authorization redirect required");
		this.name = "AuthorizationRedirectError";
	}
}
