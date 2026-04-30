import type {
  AgentContext,
  AgentEntry,
  PixeerVoiceAgentOptions,
  AgentSetup,
} from './types.js';
import { resolveBrowserIdentity, createRpcCaller } from './rpc.js';
import { createPixeerTools } from './tools.js';
import { buildSystemPrompt } from './prompts.js';

/**
 * Create the `entry` function for a Pixeer voice agent.
 *
 * Pass the result directly to `defineAgent` from `@livekit/agents`.
 * The `onSetup` callback receives ready-to-use Pixeer tool definitions,
 * the system prompt, and the RPC caller — use them to build your
 * `voice.Agent` and `AgentSession`.
 *
 * Each tool in `setup.tools` is the exact input shape for `llm.tool()`.
 * Wrap the entries before passing to `voice.Agent`:
 *
 * ```ts
 * const lkTools = Object.fromEntries(
 *   Object.entries(setup.tools).map(([k, v]) => [k, llm.tool(v)])
 * );
 * ```
 *
 * @example
 * ```ts
 * import { defineAgent, voice, llm, type JobContext } from '@livekit/agents';
 * import * as silero from '@livekit/agents-plugin-silero';
 * import { createPixeerAgentEntry } from '@pixeer/livekit-agent';
 *
 * export default defineAgent({
 *   prewarm: async (proc) => { proc.userData.vad = await silero.VAD.load(); },
 *   entry: createPixeerAgentEntry({
 *     discoveryQuestions: [
 *       { id: 'role', question: "What's your role — developer, manager, or analyst?" },
 *     ],
 *     onSetup: async ({ ctx, tools, systemPrompt }) => {
 *       // Wrap Pixeer tool definitions with llm.tool()
 *       const lkTools = Object.fromEntries(
 *         Object.entries(tools).map(([k, v]) => [k, llm.tool(v)])
 *       );
 *       const session = new voice.AgentSession({
 *         vad: (ctx as any).proc.userData.vad,
 *         stt: 'deepgram/nova-3:en',
 *         llm: 'openai/gpt-4o-mini',
 *         tts: 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
 *       });
 *       await session.start({
 *         agent: new voice.Agent({ instructions: systemPrompt, tools: lkTools }),
 *         room: ctx.room,
 *       });
 *       session.generateReply({ instructions: 'Greet the user and offer your assistance.' });
 *     },
 *   }),
 * });
 * ```
 *
 * Note: `ctx.connect()` is called before `onSetup` — do NOT call it again
 * inside your `onSetup` callback.
 */
export function createPixeerAgentEntry(options: PixeerVoiceAgentOptions): AgentEntry {
  return async (ctx: AgentContext): Promise<void> => {
    // Connect the agent to the LiveKit room first, then set up the session.
    // This matches the pattern used in the official agents-js examples.
    await ctx.connect();

    const browserIdentity = resolveBrowserIdentity(ctx.room, options.getBrowserIdentity);

    const rawCall = createRpcCaller(ctx.room, browserIdentity);

    const call = options.onAction
      ? async (method: string, params?: unknown) => {
          const result = await rawCall(method, params);
          options.onAction!(method, params, result);
          return result;
        }
      : rawCall;

    const tools = createPixeerTools(call, options.toolsOptions);
    const systemPrompt = buildSystemPrompt(options);

    const setup: AgentSetup = { ctx, tools, systemPrompt, call, browserIdentity };
    await options.onSetup(setup);
  };
}

/**
 * Ergonomic wrapper around `createPixeerAgentEntry`.
 *
 * Separates Pixeer options from the setup callback for less nesting.
 *
 * @example
 * ```ts
 * export default defineAgent({
 *   entry: withPixeerTools(
 *     { discoveryQuestions: [{ id: 'role', question: "What's your role?" }] },
 *     async ({ ctx, tools, systemPrompt }) => {
 *       const lkTools = Object.fromEntries(
 *         Object.entries(tools).map(([k, v]) => [k, llm.tool(v)])
 *       );
 *       const session = new voice.AgentSession({ vad, stt, llm, tts });
 *       await session.start({
 *         agent: new voice.Agent({ instructions: systemPrompt, tools: lkTools }),
 *         room: ctx.room,
 *       });
 *       session.generateReply({ instructions: 'Greet the user.' });
 *     },
 *   ),
 * });
 * ```
 */
export function withPixeerTools(
  options: Omit<PixeerVoiceAgentOptions, 'onSetup'>,
  setup: (s: AgentSetup) => Promise<void>,
): AgentEntry {
  return createPixeerAgentEntry({ ...options, onSetup: setup });
}
