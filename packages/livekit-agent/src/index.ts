// Agent entry factories
export { createPixeerAgentEntry, withPixeerTools } from './agent.js';

// Tools (fncCtx-compatible function context)
export { createPixeerTools } from './tools.js';

// RPC utilities
export { createRpcCaller, resolveBrowserIdentity } from './rpc.js';

// Prompt utilities
export { buildSystemPrompt, DEFAULT_SYSTEM_PROMPT } from './prompts.js';

// Types
export type {
  AgentContext,
  AgentEntry,
  AgentSetup,
  LiveKitRoom,
  LiveKitParticipant,
  PerformRpcOptions,
  PixeerFunctionContext,
  PixeerTool,
  PixeerToolsOptions,
  PixeerVoiceAgentOptions,
  RpcCaller,
} from './types.js';
