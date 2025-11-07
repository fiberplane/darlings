# Vercel AI SDK Research - Latest Capabilities & API Patterns (January 2025)

## 1. Latest Version and Installation

### Current Version
- **Latest Stable**: AI SDK 5.0.89 (published within the last 24 hours)
- **Status**: AI SDK 5 is the production-ready version; AI SDK 6 is in Beta

### Installation
```bash
npm i ai
```

Also install provider-specific packages as needed:
```bash
npm i @ai-sdk/anthropic
npm i @ai-sdk/openai
```

### Package Versions (5.x)
```json
{
  "ai": "5.0.89",
  "@ai-sdk/anthropic": "2.0.0+",
  "@ai-sdk/openai": "2.0.0+",
  "@ai-sdk/provider": "2.0.0+",
  "@ai-sdk/provider-utils": "3.0.0+",
  "zod": "4.1.8+"
}
```

**Download Statistics**: Over 2 million weekly downloads, with 1,615+ other npm packages depending on it.

---

## 2. Using generateText() with Tools/Function Calling

### Basic API Pattern

```typescript
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const result = await generateText({
  model: openai('gpt-4o'),
  system: 'You are a helpful assistant.',
  prompt: 'What is the weather in San Francisco?',

  // Tool definitions
  tools: {
    getWeather: tool({
      description: 'Get the weather for a location',
      inputSchema: z.object({
        location: z.string().describe('The location to get weather for'),
        unit: z.enum(['C', 'F']).describe('Temperature unit')
      }),
      execute: async ({ location, unit }) => {
        // Execute function - returns typed results
        return {
          location,
          temperature: 72,
          unit,
          condition: 'Sunny'
        };
      }
    }),

    getPopulation: tool({
      description: 'Get population of a city',
      inputSchema: z.object({
        city: z.string().describe('City name')
      }),
      execute: async ({ city }) => {
        return { city, population: 873_965 };
      }
    })
  },

  // Optional: control loop behavior
  maxSteps: 5,
  stopWhen: ({ toolCalls }) => toolCalls.length === 0
});

// Access results
console.log(result.text);           // Generated text
console.log(result.toolCalls);      // Tool calls made
console.log(result.toolResults);    // Results from tools
console.log(result.steps);          // All generation steps
console.log(result.usage);          // Token usage
```

### Key Features of generateText()

| Feature | Details |
|---------|---------|
| **Tool Schema** | Accepts Zod schemas or JSON schemas via `jsonSchema()` |
| **Tool Execution** | Optional `execute` function runs automatically |
| **Multi-Step** | Automatically handles agentic loops with tool results |
| **Response Details** | Returns: text, toolCalls, toolResults, steps, usage, metadata |
| **Configuration** | Temperature, maxTokens→maxOutputTokens, stopSequences, retry settings |
| **Observability** | Telemetry tracking, provider-specific options |
| **Streaming** | Use `streamText()` for streaming responses |

### Tool Helper Function
The `tool()` function is essential for **TypeScript type inference**:
```typescript
import { tool } from 'ai';

const myTool = tool({
  description: 'Tool description',
  inputSchema: z.object({
    param1: z.string(),
    param2: z.number()
  }),
  execute: async ({ param1, param2 }) => {
    // TypeScript properly infers types of param1 and param2
    return { result: 'value' };
  }
});
```

---

## 3. Model Provider Setup

### @ai-sdk/anthropic (Claude Models)

#### Installation
```bash
npm i @ai-sdk/anthropic
```

#### Basic Usage
```typescript
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const result = await generateText({
  model: anthropic('claude-opus-4-1-20250805'),
  prompt: 'Hello, Claude!'
});
```

#### Custom Provider Configuration
```typescript
import { createAnthropic } from '@ai-sdk/anthropic';

const customAnthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // defaults to ANTHROPIC_API_KEY env var
  baseURL: 'https://api.anthropic.com/v1',  // custom URL prefix (optional)
  headers: {
    'Custom-Header': 'value'  // custom headers (optional)
  },
  fetch: customFetchFunction  // custom fetch implementation (optional)
});

const model = customAnthropic('claude-sonnet-4-5-20250929');
```

#### Supported Configuration Options
- `apiKey`: API authentication (defaults to ANTHROPIC_API_KEY environment variable)
- `baseURL`: Custom API endpoint prefix (default: https://api.anthropic.com/v1)
- `headers`: Custom HTTP headers
- `fetch`: Custom fetch function for middleware/testing

---

### @ai-sdk/openai (OpenAI and OpenAI-Compatible APIs)

#### Installation
```bash
npm i @ai-sdk/openai
```

#### Basic Usage
```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Hello, OpenAI!'
});
```

#### Custom Provider Configuration
```typescript
import { createOpenAI } from '@ai-sdk/openai';

const customOpenAI = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,          // defaults to OPENAI_API_KEY env var
  baseURL: 'https://api.openai.com/v1',        // custom endpoint (optional)
  organization: 'org-123',                       // OpenAI organization (optional)
  project: 'proj-123',                           // OpenAI project (optional)
  headers: {
    'Custom-Header': 'value'
  },
  fetch: customFetchFunction                    // custom fetch implementation (optional)
});

const model = customOpenAI('gpt-4o');
```

#### OpenAI Responses API (Default in AI SDK 5)
The OpenAI Responses API is called by default since AI SDK 5. You can still use the chat API explicitly:
```typescript
const model = openai.chat('gpt-4o');
```

#### Key Configuration Options
- `baseURL`: API endpoint prefix (for OpenAI-compatible providers)
- `apiKey`: Authentication (defaults to OPENAI_API_KEY env var)
- `name`: Provider name (useful for OpenAI-compatible providers)
- `organization`: OpenAI organization ID
- `project`: OpenAI project ID
- `headers`: Custom HTTP headers
- `fetch`: Custom fetch implementation

#### Advanced Features Supported
- Web search and file search tools
- Image generation (DALL-E)
- Code interpreter
- Audio input (gpt-4o-audio-preview)
- Structured outputs with schema validation
- Reasoning models (o1, o3, o4) with configurable effort levels
- Prompt caching for performance
- Predicted outputs to reduce latency
- Logprobs for token probability analysis

---

## 4. Latest Claude Model Names

### Current Production Models

#### Claude Sonnet 4.5 (Latest - September 2025)
- **API Model ID**: `claude-sonnet-4-5-20250929`
- **Alias**: `claude-sonnet-4-5`
- **AWS Bedrock**: `anthropic.claude-sonnet-4-5-20250929-v1:0`
- **GCP Vertex AI**: `claude-sonnet-4-5@20250929`
- **Vercel AI SDK**: `anthropic('claude-sonnet-4-5-20250929')`
- **Features**:
  - Best model for coding tasks
  - Smaller than Opus 4.1 but smarter in almost every way
  - Can run autonomously for 30 hours on complex tasks
  - Reasoning support
  - **Pricing**: $3/MTok input, $15/MTok output

#### Claude Haiku 4.5 (October 2025)
- **API Model ID**: `claude-haiku-4-5-20251001`
- **Alias**: `claude-haiku-4-5`
- **AWS Bedrock**: `anthropic.claude-haiku-4-5-20251001-v1:0`
- **GCP Vertex AI**: `claude-haiku-4-5@20251001`
- **Vercel AI SDK**: `anthropic('claude-haiku-4-5-20251001')`
- **Features**:
  - Fast, low-latency, cost-optimized
  - Optimized for real-time assistants, customer support, parallel sub-agent work
  - **Pricing**: $1/MTok input, $5/MTok output

#### Claude Opus 4.1 (August 2025)
- **API Model ID**: `claude-opus-4-1-20250805`
- **Alias**: `claude-opus-4-1`
- **AWS Bedrock**: `anthropic.claude-opus-4-1-20250805-v1:0`
- **GCP Vertex AI**: `claude-opus-4-1@20250805`
- **Vercel AI SDK**: `anthropic('claude-opus-4-1-20250805')`
- **Features**:
  - Focused on agentic tasks and real-world coding
  - Advanced planning and multi-step task execution
  - Reasoning support

#### Reasoning Models (New)
- `claude-opus-4-20250514` - Reasoning support
- `claude-sonnet-4-20250514` - Reasoning support
- `claude-3-7-sonnet-20250219` - Reasoning support

#### Additional Available Models
- `claude-3-5-sonnet-20241022` - Supports PDF file reading
- `claude-3-5-haiku-latest`
- `claude-opus-4-0`

### Model Selection Guide
- **Best Overall**: Claude Sonnet 4.5 (new default recommendation)
- **Best for Reasoning**: Claude Sonnet 4.5 or Opus 4.1
- **Fast & Cheap**: Claude Haiku 4.5
- **Maximum Capability**: Claude Opus 4.1
- **Previous Gen**: Claude 3.5 Sonnet, Claude 3 (use latest instead)

---

## 5. Latest OpenAI GPT Model Names

### Current Production Models

#### GPT-5 (Latest - 2025)
- **API Model ID**: `gpt-5`
- **Vercel AI SDK**: `openai('gpt-5')`
- **Features**:
  - OpenAI's flagship language model
  - Excels at complex reasoning and multi-step tasks
  - Best for code-intensive and agentic applications
  - 50% cheaper processing with 'flex' service tier option
  - Knowledge: Updated 2024+
  - Context window: 128,000 tokens

#### GPT-4o (Recommended for Most Use Cases)
- **API model ID**: `gpt-4o`
- **Vercel AI SDK**: `openai('gpt-4o')`
- **Multimodal**: Text and image inputs
- **Features**:
  - Matches GPT-4 Turbo on English text and code
  - Superior performance on non-English languages
  - 2x faster than GPT-4 Turbo
  - 50% cheaper than GPT-4 Turbo
  - 5x higher rate limits
  - Knowledge cutoff: April 2024
  - Context window: 128,000 tokens

#### GPT-4 Turbo
- **API model ID**: `gpt-4-turbo`
- **Vercel AI SDK**: `openai('gpt-4-turbo')`
- **Features**:
  - Large multimodal model (text + images)
  - High accuracy for complex problems
  - Broad domain knowledge
  - Knowledge cutoff: April 2023
  - Context window: 128,000 tokens

#### GPT-4 mini / GPT-4o mini
- **API model ID**: `gpt-4o-mini`
- **Vercel AI SDK**: `openai('gpt-4o-mini')`
- **Features**:
  - Lightweight and cost-effective
  - Good for simpler tasks
  - Faster inference

#### Specialized Models
- **o3-mini** (2025-01-31): Reasoning model with enhanced reasoning abilities
- **gpt-4o-audio-preview**: Audio input support
- **gpt-5-thinking** (reasoning model): Multi-step reasoning

### Model Selection Guide
- **Default Choice**: GPT-4o (best balance of cost and capability)
- **Complex Reasoning**: GPT-5 or o3-mini
- **Budget Conscious**: GPT-4o-mini
- **Speed Priority**: GPT-4o (faster than Turbo)
- **Previous Gen**: GPT-4 Turbo (still available but use GPT-4o instead)

### Usage Pattern via Vercel AI SDK
```typescript
import { openai } from '@ai-sdk/openai';

// Direct usage
const gpt5 = openai('gpt-5');
const gpt4o = openai('gpt-4o');

// Via Vercel AI Gateway
const model = openai('openai/gpt-4o');
```

---

## 6. Creating Custom OpenAI-Compatible Providers

### Option 1: Using createOpenAI() for Custom Endpoints

#### Basic Pattern
```typescript
import { createOpenAI } from '@ai-sdk/openai';

const customProvider = createOpenAI({
  baseURL: 'https://api-endpoint.com/v1',
  apiKey: process.env.CUSTOM_API_KEY,
  name: 'custom-provider'  // optional: custom provider name
});

// Use it like any other model
const model = customProvider('model-name-from-api');
```

#### For Moonshot AI (Kimi)
```typescript
import { createOpenAI } from '@ai-sdk/openai';

const moonshot = createOpenAI({
  baseURL: 'https://api.moonshot.ai/v1',
  apiKey: process.env.MOONSHOT_API_KEY,
  name: 'moonshot'
});

// Use Kimi models
const model = moonshot('moonshot-v1-8k');
// or newer: moonshot('kimi-k2');

// With generateText
const result = await generateText({
  model: moonshot('moonshot-v1-8k'),
  prompt: 'Your prompt here'
});
```

#### For Qwen/Alibaba Models
```typescript
import { createOpenAI } from '@ai-sdk/openai';

const qwen = createOpenAI({
  baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.QWEN_API_KEY,
  name: 'qwen'
});

// Use Qwen models
const model = qwen('qwen-plus');  // or qwen-turbo, qwen-max, etc.
```

**Alternative: Community Qwen Provider**
```bash
npm i qwen-ai-provider
```

```typescript
import { createQwen } from 'qwen-ai-provider';

const qwen = createQwen({
  apiKey: process.env.DASHSCOPE_API_KEY,  // defaults to DASHSCOPE_API_KEY
  baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
});

const model = qwen('qwen-plus');
```

---

### Option 2: Using @ai-sdk/openai-compatible Package

#### Installation
```bash
npm i @ai-sdk/openai-compatible
```

#### Pattern
```typescript
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const provider = createOpenAICompatible({
  baseURL: 'https://api-endpoint.com/v1',
  apiKey: process.env.API_KEY,
  headers: {
    'Custom-Header': 'value'
  },
  includeUsage: true,
  supportsStructuredOutputs: true
});

const model = provider.chat('model-id');
```

---

### Option 3: Building a Full Custom Provider

#### File Structure
```
my-provider/
├── src/
│  ├── index.ts              # public exports
│  ├── provider.ts           # main provider factory
│  ├── models/
│  │  ├── chat.ts           # chat model settings
│  │  ├── completion.ts     # completion model (if needed)
│  │  ├── embedding.ts      # embedding model (if needed)
│  │  └── image.ts          # image generation (if needed)
│  └── types.ts             # TypeScript types
├── package.json
└── README.md
```

#### Basic Provider Implementation Example
```typescript
// src/provider.ts
import {
  LanguageModelV1,
  createOpenAICompatible,
  OpenAICompatibleChatSettings,
  OpenAICompatibleChatMessage,
} from '@ai-sdk/openai-compatible';

interface CustomProviderConfig {
  apiKey: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

export function createCustomProvider(config: CustomProviderConfig) {
  return createOpenAICompatible({
    baseURL: config.baseURL || 'https://api.provider.com/v1',
    apiKey: config.apiKey,
    headers: config.headers,
    name: 'custom-provider'
  });
}

// src/index.ts
export { createCustomProvider };

// Usage:
import { createCustomProvider } from 'my-provider';

const provider = createCustomProvider({
  apiKey: process.env.CUSTOM_API_KEY,
  baseURL: 'https://custom-api.example.com/v1'
});

const model = provider.chat('custom-model-id');
```

#### Publishing to NPM
```json
{
  "name": "@myorg/custom-provider",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "dependencies": {
    "@ai-sdk/openai-compatible": "^1.0.0"
  }
}
```

---

### Custom Provider Features You Can Support
- **Custom query parameters** for provider-specific requirements
- **Provider options** through `providerOptions` field
- **Metadata extraction** for non-standard response fields
- **Type-safe model IDs** with TypeScript auto-completion
- **Custom headers** per request
- **Custom fetch implementations** for middleware

### Vercel AI Gateway Support
For Moonshot (Kimi K2), you can also use Vercel's AI Gateway for:
- Unified API interface
- Observable usage and costs
- Intelligent provider routing
- Failover support

---

## 7. Tool Calling API Format

### Tool Definition Structure

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const myTool = tool({
  description: 'Description of what the tool does',

  inputSchema: z.object({
    parameter1: z.string()
      .describe('Description of parameter1 for the model'),
    parameter2: z.number()
      .describe('Description of parameter2'),
    parameter3: z.enum(['option1', 'option2'])
      .describe('Enum parameter with choices')
  }),

  execute: async ({ parameter1, parameter2, parameter3 }) => {
    // Execute the tool with the provided parameters
    // Return the result
    return {
      success: true,
      data: `Processed ${parameter1} with value ${parameter2}`
    };
  },

  // Optional properties:
  outputSchema: z.object({
    success: z.boolean(),
    data: z.string()
  }),

  // Optional lifecycle hooks (for streaming):
  onInputStart: (input) => console.log('Input started', input),
  onInputDelta: (delta) => console.log('Input delta', delta),

  // Provider-specific options
  providerOptions: {
    // Provider-specific tool settings
  }
});
```

### Schema Input Options

#### 1. Using Zod (Recommended)
```typescript
import { z } from 'zod';

const tool = tool({
  description: 'Get weather information',
  inputSchema: z.object({
    location: z.string()
      .describe('City name or coordinates'),
    unit: z.enum(['C', 'F'])
      .describe('Temperature unit'),
    includeForecst: z.boolean()
      .optional()
      .describe('Include 5-day forecast')
  }),
  execute: async (input) => {
    // input is properly typed based on schema
    return weatherData;
  }
});
```

#### 2. Using JSON Schema
```typescript
import { jsonSchema } from 'ai';

const tool = tool({
  description: 'Get weather information',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name or coordinates'
      },
      unit: {
        type: 'string',
        enum: ['C', 'F'],
        description: 'Temperature unit'
      }
    },
    required: ['location', 'unit']
  }),
  execute: async (input) => {
    return weatherData;
  }
});
```

### Full generateText() with Tools Example

```typescript
import { generateText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const result = await generateText({
  model: anthropic('claude-sonnet-4-5-20250929'),

  system: 'You are a weather assistant. When users ask about weather, use the getWeather tool.',

  prompt: 'What is the weather in San Francisco and New York?',

  tools: {
    getWeather: tool({
      description: 'Get current weather for a location',
      inputSchema: z.object({
        location: z.string()
          .describe('City name'),
        unit: z.enum(['C', 'F'])
          .describe('Temperature unit'),
        includeForecst: z.boolean()
          .optional()
          .default(false)
          .describe('Include 5-day forecast')
      }),
      execute: async ({ location, unit, includeForecst }) => {
        // Simulate API call
        return {
          location,
          temperature: unit === 'C' ? 20 : 68,
          unit,
          condition: 'Sunny',
          forecast: includeForecst ? ['Sunny', 'Cloudy', 'Rainy', 'Sunny', 'Cloudy'] : undefined
        };
      }
    }),

    getPopulation: tool({
      description: 'Get population data for a city',
      inputSchema: z.object({
        city: z.string()
          .describe('City name')
      }),
      execute: async ({ city }) => {
        const populations: Record<string, number> = {
          'San Francisco': 873_965,
          'New York': 8_336_817
        };
        return { city, population: populations[city] || 0 };
      }
    })
  },

  // Control multi-step behavior
  maxSteps: 5,
  stopWhen: ({ toolCalls }) => toolCalls.length === 0,

  // Optional configuration
  temperature: 0.7,
  maxOutputTokens: 1000
});

// Access comprehensive results
console.log('Response text:', result.text);
console.log('Tool calls:', result.toolCalls);
console.log('Tool results:', result.toolResults);
console.log('Number of steps:', result.steps.length);
console.log('Token usage:', result.usage);
```

### Tool Result Flow

1. **Model generates tool calls** - Based on user prompt and tool descriptions
2. **SDK executes tools** - Calls the `execute` function with validated inputs
3. **Tool results collected** - Results are fed back to the model
4. **Model generates response** - Generates final text response considering tool results
5. **Return all information** - Result object contains text, toolCalls, toolResults, and steps

### Response Object Structure

```typescript
interface GenerateTextResult {
  text: string;                    // Final generated text
  toolCalls: Array<{              // All tool calls made
    toolName: string;
    args: Record<string, any>;
    id: string;
  }>;
  toolResults: Array<{            // Results from tool calls
    toolName: string;
    result: any;
    id: string;
  }>;
  steps: Array<{                  // All generation steps
    type: 'tool-call' | 'finish';
    toolCalls?: Array<...>;
    text?: string;
  }>;
  usage: {                        // Token usage
    inputTokens: number;
    outputTokens: number;
  };
  metadata: {                     // Provider metadata
    finishReason: string;
    usage?: Record<string, any>;
  };
}
```

### Key Changes from AI SDK 4.0 to 5.0

The `parameters` property has been renamed to **`inputSchema`** to align with the Model Context Protocol (MCP) specification:

```typescript
// AI SDK 4.x (deprecated)
tools: {
  myTool: {
    description: 'Tool description',
    parameters: z.object({ /* ... */ }),  // OLD
    execute: async (input) => { /* ... */ }
  }
}

// AI SDK 5.x (current)
tools: {
  myTool: tool({
    description: 'Tool description',
    inputSchema: z.object({ /* ... */ }),  // NEW
    execute: async (input) => { /* ... */ }
  })
}
```

### Tool Execution Streaming (Advanced)

The `execute` function can return an async iterable for streaming results:

```typescript
const streamingTool = tool({
  description: 'Tool that streams results',
  inputSchema: z.object({ query: z.string() }),
  execute: async function* ({ query }) {
    // Yield preliminary results
    yield { status: 'processing', query };

    // Do work...
    const results = await fetchLargeData(query);

    // Yield final result (last one only is returned)
    yield { status: 'complete', results };
  }
});
```

---

## Summary: Key API Patterns (2025)

### Installation
```bash
npm i ai @ai-sdk/anthropic @ai-sdk/openai
```

### Basic Pattern
```typescript
import { generateText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const result = await generateText({
  model: anthropic('claude-sonnet-4-5-20250929'),
  prompt: 'Your prompt',
  tools: {
    toolName: tool({
      description: 'What it does',
      inputSchema: z.object({ /* schema */ }),
      execute: async (input) => { /* implementation */ }
    })
  }
});
```

### Model References
- **Claude**: `anthropic('claude-sonnet-4-5-20250929')`
- **GPT-4o**: `openai('gpt-4o')`
- **GPT-5**: `openai('gpt-5')`
- **Custom**: `createOpenAI({ baseURL: '...' })('model-id')`

### Custom OpenAI-Compatible Providers
```typescript
const provider = createOpenAI({
  baseURL: 'https://api-endpoint.com/v1',
  apiKey: process.env.API_KEY
});
```

---

## Official Documentation References

- **Main Docs**: https://ai-sdk.dev/docs
- **Anthropic Provider**: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
- **OpenAI Provider**: https://ai-sdk.dev/providers/ai-sdk-providers/openai
- **Tool Calling Guide**: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- **generateText Reference**: https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text
- **OpenAI-Compatible Providers**: https://ai-sdk.dev/providers/openai-compatible-providers
- **Migration Guide (4→5)**: https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0
- **Claude Models**: https://docs.claude.com/en/docs/about-claude/models/overview
- **OpenAI Models**: https://platform.openai.com/docs/models

---

## Integration Examples by Provider

### Using with Vercel AI Gateway
```typescript
import { openai } from '@ai-sdk/openai';

// Route through AI Gateway
const model = openai('openai/gpt-4o');      // OpenAI models
const model = openai('anthropic/claude-sonnet-4-5-20250929');  // Claude via AI Gateway
```

### Using Multiple Providers
```typescript
import { generateText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

// Use different models in sequence
const result1 = await generateText({
  model: anthropic('claude-sonnet-4-5-20250929'),
  prompt: 'Analyze this...'
});

const result2 = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Based on: ' + result1.text
});
```

---

**Last Updated**: January 2025
**AI SDK Version**: 5.0.89
**Information Source**: Official Vercel AI SDK documentation and provider documentation
