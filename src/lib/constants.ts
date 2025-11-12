// Model mapping with latest IDs from research
// This file contains only constants - no process.env or provider instances
export const MODEL_PROVIDERS = {
	// Claude models (latest)
	"claude-haiku-4-5": "claude-haiku-4-5-20251001",
	"claude-sonnet-4-5": "claude-sonnet-4-5-20250929",
	"claude-opus-4-1": "claude-opus-4-1-20250805",

	// OpenAI models (latest)
	"gpt-5": "gpt-5",
	"gpt-5-mini": "gpt-5-mini",
	"gpt-4o": "gpt-4o",
} as const;
