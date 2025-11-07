// MCP Configuration
export type MCPConfig =
  | { type: "stdio"; command: string; args?: string[] }
  | { type: "http"; url: string };

// Core Domain Types
export type Tool = {
  id: string;
  name: string;
  description: string;
  inputSchema: object;
  serverId: string;
};

export type TestCase = {
  id: string;
  toolId: string;
  query: string;
  expectedTool: string;
  userCreated: boolean;
};

export type Candidate = {
  id: string;
  tools: Tool[];
};

export type EvaluatedCandidate = Candidate & {
  accuracy: number;
  avgDescriptionLength: number;
  evaluations: EvalResult[];
};

export type EvalResult = {
  testCaseId: string;
  selectedTool: string | null;
  expectedTool: string;
  correct: boolean;
};

// Optimization Configuration
export type OptimizationConfig = {
  iterations: number;          // GEPA generations (default: 10)
  populationSize: number;      // Candidates per generation (default: 8)
  testsPerTool: number;        // Auto-generated tests (default: 5)
  model: ModelName;            // LLM to use
  parallelEvals: number;       // Concurrent evaluations (default: 3)
};

export type ModelName =
  // Claude models (latest)
  | 'claude-sonnet-4-5'
  | 'claude-sonnet-4'
  | 'claude-opus-4-1'
  | 'claude-haiku-4-5'
  // OpenAI models (latest)
  | 'gpt-5'
  | 'gpt-5-mini'
  | 'gpt-4o'
  | 'o3-mini'
  // Kimi models (Moonshot AI) - latest
  | 'moonshot-v1-8k'
  | 'moonshot-v1-32k'
  | 'moonshot-v1-128k'
  // Qwen models (Alibaba) - latest
  | 'qwen-turbo'
  | 'qwen-plus'
  | 'qwen-max'
  | 'qwen-long'
  | 'qwq-32b-preview';

// Progress Events for SSE
export type ProgressEvent =
  | { type: "generation_start"; generation: number }
  | {
      type: "candidate_start";
      candidateId: string;
      generation: number
    }
  | {
      type: "evaluation";
      candidateId: string;
      testCase: string;
      result: {
        correct: boolean;
        selected: string | null;
        expected: string
      }
    }
  | {
      type: "candidate_done";
      candidateId: string;
      accuracy: number;
      avgLength: number
    }
  | {
      type: "pareto_front";
      candidates: Array<{
        id: string;
        accuracy: number;
        avgLength: number;
      }>
    }
  | {
      type: "mutation_start";
      candidateId: string
    }
  | {
      type: "reflection_start";
      candidateId: string;
      tool: string;
      failure: {
        query: string;
        selected: string | null;
        expected: string;
      }
    }
  | {
      type: "reflection_done";
      candidateId: string;
      tool: string;
      oldDesc: string;
      newDesc: string
    }
  | {
      type: "generation_done";
      generation: number;
      bestAccuracy: number
    };
