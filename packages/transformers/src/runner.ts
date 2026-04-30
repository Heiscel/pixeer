import type { PixeerAgent } from 'pixeer';
import { PIXEER_TOOLS, filterTools, type PixeerToolsFilterOptions, type ToolDefinition } from './tools.js';

export type Device = 'webgpu' | 'cpu' | 'wasm';
export type DType = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';

export interface PixeerRunnerOptions extends PixeerToolsFilterOptions {
  /**
   * HuggingFace model ID. Should support function/tool calling.
   * @default "Qwen/Qwen2.5-0.5B-Instruct"
   */
  model?: string;
  /**
   * Inference device. Use 'webgpu' for GPU-accelerated inference in browsers that support it.
   * @default "webgpu"
   */
  device?: Device;
  /**
   * Model quantization dtype for memory/speed tradeoff.
   * @default "q4"
   */
  dtype?: DType;
  /**
   * Maximum agentic loop iterations before stopping.
   * @default 10
   */
  maxSteps?: number;
  /**
   * System prompt injected before every task.
   */
  systemPrompt?: string;
  /**
   * Called when the model starts loading (fires once).
   */
  onModelLoad?: () => void;
  /**
   * Called after the model is ready.
   */
  onModelReady?: () => void;
  /**
   * Called on each step — useful for streaming UI updates.
   */
  onStep?: (step: PixeerStep) => void;
}

export interface PixeerStep {
  type: 'tool_call' | 'tool_result' | 'text';
  /** Step index (1-based) */
  index: number;
  /** Present when type is 'tool_call' */
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  /** Present when type is 'tool_result' */
  toolResult?: unknown;
  toolError?: string;
  /** Present when type is 'text' — the model's final answer */
  text?: string;
}

export interface PixeerRunResult {
  /** The model's final textual answer */
  answer: string;
  /** All steps taken during the run */
  steps: PixeerStep[];
  /** Total steps executed */
  stepCount: number;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

// Minimal interfaces for the parts of Transformers.js we actually use.
// The real types are more complex; we constrain only what we touch.
interface HFTokenizer {
  apply_chat_template(
    messages: ChatMessage[],
    options: { tools?: ToolDefinition[]; add_generation_prompt: boolean; tokenize: false },
  ): string;
  apply_chat_template(
    messages: ChatMessage[],
    options: { tools?: ToolDefinition[]; add_generation_prompt: boolean; tokenize: true },
  ): number[];
  decode(tokenIds: number[], options?: { skip_special_tokens?: boolean }): string;
}

interface HFTensor {
  data: ArrayLike<number>;
  dims: number[];
  tolist(): number[][];
}

interface HFModel {
  generate(inputIds: HFTensor, options: Record<string, unknown>): Promise<HFTensor>;
  dispose(): Promise<unknown>;
}

// Lazy import so the heavy @huggingface/transformers bundle only loads on first use.
type TransformersModule = typeof import('@huggingface/transformers');
let transformersCache: TransformersModule | null = null;
async function getTransformers(): Promise<TransformersModule> {
  if (!transformersCache) {
    transformersCache = await import('@huggingface/transformers');
  }
  return transformersCache;
}

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful browser automation assistant. ' +
  'You have access to tools that let you read the page, click elements, type text, and interact with the browser. ' +
  'Always call pixeer_get_page_context first to understand what is on the page before taking actions. ' +
  'Be precise — use the exact accessible names returned by pixeer_get_page_context when clicking or typing. ' +
  'When the task is complete, provide a concise summary of what you did.';

export interface PixeerRunner {
  /**
   * Run a natural-language task against the page connected to `agent`.
   */
  run(task: string, agent: PixeerAgent): Promise<PixeerRunResult>;
  /**
   * Dispose the runner and free model resources.
   */
  dispose(): Promise<void>;
}

export async function createPixeerRunner(
  options: PixeerRunnerOptions = {},
): Promise<PixeerRunner> {
  const {
    model = 'Qwen/Qwen2.5-0.5B-Instruct',
    device = 'webgpu',
    dtype = 'q4',
    maxSteps = 10,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    onModelLoad,
    onModelReady,
    onStep,
    ...filterOptions
  } = options;

  const tools: ToolDefinition[] = filterTools(PIXEER_TOOLS, filterOptions);

  onModelLoad?.();
  const { AutoTokenizer, AutoModelForCausalLM } = await getTransformers();

  const tokenizer = (await AutoTokenizer.from_pretrained(model)) as unknown as HFTokenizer;
  const llm = (await AutoModelForCausalLM.from_pretrained(model, {
    device,
    dtype,
  } as Parameters<typeof AutoModelForCausalLM.from_pretrained>[1])) as unknown as HFModel;

  onModelReady?.();

  async function executeToolCall(
    agent: PixeerAgent,
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case 'pixeer_get_page_context':
        return agent.getContext();
      case 'pixeer_click':
        return { success: await agent.click(args.name as string) };
      case 'pixeer_click_by_selector':
        return { success: await agent.clickBySelector(args.selector as string) };
      case 'pixeer_type':
        return { success: await agent.type(args.name as string, args.text as string) };
      case 'pixeer_type_by_selector':
        return { success: await agent.typeBySelector(args.selector as string, args.text as string) };
      case 'pixeer_scroll':
        return {
          success: await agent.scroll({
            direction: args.direction as 'up' | 'down' | 'left' | 'right',
            amount: args.amount as number | undefined,
            name: args.name as string | undefined,
            selector: args.selector as string | undefined,
          }),
        };
      case 'pixeer_press_key':
        return {
          success: await agent.pressKey(args.key as string, {
            name: args.name as string | undefined,
            selector: args.selector as string | undefined,
          }),
        };
      case 'pixeer_get_component_state':
        return { state: await agent.getComponentState(args.componentName as string) };
      case 'pixeer_get_delta':
        return agent.getDelta();
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  async function run(task: string, agent: PixeerAgent): Promise<PixeerRunResult> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task },
    ];

    const steps: PixeerStep[] = [];
    let stepIndex = 0;

    const { Tensor } = await getTransformers();

    for (let iteration = 0; iteration < maxSteps; iteration++) {
      // apply_chat_template with tokenize:true gives us token IDs directly.
      const inputIds = tokenizer.apply_chat_template(messages, {
        tools,
        add_generation_prompt: true,
        tokenize: true,
      });

      const inputLen = inputIds.length;
      const inputTensor = new Tensor('int64', inputIds, [1, inputLen]) as unknown as HFTensor;

      const outputTensor = await llm.generate(inputTensor, {
        max_new_tokens: 512,
        do_sample: false,
      });

      // Slice off the prompt tokens to get only new tokens.
      const allIds = outputTensor.tolist()[0];
      const newTokenIds = allIds.slice(inputLen);

      const assistantText = tokenizer.decode(newTokenIds, { skip_special_tokens: false });

      // Models like Qwen2.5 emit tool calls as <tool_call>{"name":"...","arguments":{...}}</tool_call>
      const toolCallMatches = [
        ...assistantText.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/g),
      ];

      if (toolCallMatches.length === 0) {
        const cleanText = assistantText
          .replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/g, '')
          .replace(/<\|im_start\|>/g, '')
          .replace(/<\|im_end\|>/g, '')
          .trim();

        stepIndex++;
        const textStep: PixeerStep = { type: 'text', index: stepIndex, text: cleanText };
        steps.push(textStep);
        onStep?.(textStep);

        return { answer: cleanText, steps, stepCount: stepIndex };
      }

      messages.push({ role: 'assistant', content: assistantText });

      const toolCallObjs: ToolCall[] = toolCallMatches.map((m, i) => {
        const parsed = JSON.parse(m[1]) as { name: string; arguments: Record<string, unknown> };
        return {
          id: `call_${iteration}_${i}`,
          type: 'function',
          function: { name: parsed.name, arguments: JSON.stringify(parsed.arguments) },
        };
      });

      for (const tc of toolCallObjs) {
        const toolArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;

        stepIndex++;
        const callStep: PixeerStep = {
          type: 'tool_call',
          index: stepIndex,
          toolName: tc.function.name,
          toolArgs,
        };
        steps.push(callStep);
        onStep?.(callStep);

        let toolResult: unknown;
        let toolError: string | undefined;

        try {
          toolResult = await executeToolCall(agent, tc.function.name, toolArgs);
        } catch (e) {
          toolError = e instanceof Error ? e.message : String(e);
          toolResult = { error: toolError };
        }

        stepIndex++;
        const resultStep: PixeerStep = {
          type: 'tool_result',
          index: stepIndex,
          toolName: tc.function.name,
          toolResult,
          toolError,
        };
        steps.push(resultStep);
        onStep?.(resultStep);

        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResult),
          tool_call_id: tc.id,
        });
      }
    }

    const lastText = steps.filter((s) => s.type === 'text').at(-1)?.text ?? '';
    return {
      answer: lastText || `Reached maximum steps (${maxSteps}) without completing the task.`,
      steps,
      stepCount: stepIndex,
    };
  }

  async function dispose(): Promise<void> {
    await llm.dispose();
  }

  return { run, dispose };
}
