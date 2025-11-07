const API_BASE_URL = "http://localhost:3000";

export const api = {
	baseUrl: API_BASE_URL,

	async get<T>(endpoint: string): Promise<T> {
		const res = await fetch(`${API_BASE_URL}${endpoint}`);
		if (!res.ok) {
			const error = await res.json().catch(() => ({ error: "Request failed" }));
			throw new Error(error.error || "Request failed");
		}
		return res.json();
	},

	async post<T>(endpoint: string, body: unknown): Promise<T> {
		const res = await fetch(`${API_BASE_URL}${endpoint}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const error = await res.json().catch(() => ({ error: "Request failed" }));
			throw new Error(error.error || "Request failed");
		}
		return res.json();
	},

	async put<T>(endpoint: string, body: unknown): Promise<T> {
		const res = await fetch(`${API_BASE_URL}${endpoint}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const error = await res.json().catch(() => ({ error: "Request failed" }));
			throw new Error(error.error || "Request failed");
		}
		return res.json();
	},

	async delete<T>(endpoint: string): Promise<T> {
		const res = await fetch(`${API_BASE_URL}${endpoint}`, {
			method: "DELETE",
		});
		if (!res.ok) {
			const error = await res.json().catch(() => ({ error: "Request failed" }));
			throw new Error(error.error || "Request failed");
		}
		return res.json();
	},

	async postStream(
		endpoint: string,
		body: unknown,
		signal: AbortSignal,
		onChunk: (chunk: string) => void,
	): Promise<void> {
		const response = await fetch(`${API_BASE_URL}${endpoint}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal,
		});

		if (!response.ok) {
			throw new Error("Failed to start stream");
		}

		const reader = response.body?.getReader();
		const decoder = new TextDecoder();

		if (!reader) {
			throw new Error("Failed to get response reader");
		}

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			onChunk(decoder.decode(value));
		}
	},

	async getStream(
		endpoint: string,
		signal: AbortSignal,
		onChunk: (chunk: string) => void,
	): Promise<void> {
		const response = await fetch(`${API_BASE_URL}${endpoint}`, {
			method: "GET",
			signal,
		});

		if (!response.ok) {
			throw new Error("Failed to start stream");
		}

		const reader = response.body?.getReader();
		const decoder = new TextDecoder();

		if (!reader) {
			throw new Error("Failed to get response reader");
		}

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			onChunk(decoder.decode(value));
		}
	},

	async stop(runId: string): Promise<void> {
		const response = await fetch(`${API_BASE_URL}/api/optimize/stop`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ runId }),
		});

		if (!response.ok) {
			throw new Error(`Failed to stop optimization: ${response.statusText}`);
		}
	},
};
