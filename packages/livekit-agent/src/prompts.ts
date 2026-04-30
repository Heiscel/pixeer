import type { PixeerVoiceAgentOptions, DiscoveryQuestion } from './types.js';

export const DEFAULT_SYSTEM_PROMPT = `You are a voice-controlled browser assistant powered by Pixeer.
You help users navigate and interact with the current web application using voice commands.

Behaviour:
- Always call get_page_context first to understand what is on screen before acting.
- After each action, narrate what you did and what the user sees now — one or two sentences maximum.
- When asked to click something, find the closest accessible name in the element list and use the click tool.
- For form inputs, use the type tool with the input's accessible label.
- If an action fails, explain briefly and suggest an alternative.

Safety:
- Before any form submission, payment, or destructive action, confirm with the user first:
  "Are you sure you want to [action]?" and wait for a "yes" or "confirm" before proceeding.
- Never submit forms or trigger irreversible actions without explicit confirmation.

Keep responses short and conversational — this is a voice interface.`;

/**
 * Build the full system prompt for the Pixeer voice agent.
 * Appends discovery question context when questions are configured,
 * so the LLM naturally opens with onboarding questions at session start.
 */
export function buildSystemPrompt(options: Pick<PixeerVoiceAgentOptions, 'systemPrompt' | 'discoveryQuestions'>): string {
  let prompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  if (options.discoveryQuestions?.length) {
    prompt += '\n\n' + buildDiscoveryInstructions(options.discoveryQuestions);
  }

  return prompt;
}

function buildDiscoveryInstructions(questions: DiscoveryQuestion[]): string {
  const list = questions
    .map((q, i) => {
      const hint = q.contextHint ? ` (${q.contextHint})` : '';
      return `${i + 1}. ${q.question}${hint}`;
    })
    .join('\n');

  return `At the very start of this session, greet the user warmly and ask these onboarding questions one at a time — wait for each answer before asking the next:

${list}

Use the answers to personalise your guidance throughout the session. Adapt which features you highlight and how technical your explanations are based on the user's stated role and goals.`;
}
