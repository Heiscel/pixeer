import type {
  TourScript,
  TourState,
  TourStep,
  CoordinatorDecision,
  GenerateTextFn,
  ConversationMessage,
} from './types.js';

const SYSTEM_PROMPT = `You are an interactive tour guide assistant. You are leading a user through a guided product tour.
Your role is to answer questions, keep the tour on track, and ensure the user learns the material at the right pace.

Guidelines:
- If the user asks about something covered in a FUTURE step, DEFER politely and mention it will be covered soon.
- If the user asks about something already covered, answer concisely.
- If the user says they're ready to move on, ADVANCE the tour.
- If the user wants to go back, go BACK.
- If the user says they want to stop, END the tour.
- Keep answers short (2-4 sentences). Don't explain everything at once.
- Always respond in JSON with this exact structure:
  {"action":"answer","text":"..."} — answer in place
  {"action":"defer","text":"...","coversAtStepTitle":"..."} — defer to a future step
  {"action":"advance","text":"..."} — advance and optionally say something
  {"action":"back","text":"..."} — go back and optionally say something
  {"action":"skip","reason":"..."} — skip the current step
  {"action":"end","summary":"..."} — end the tour`;

export class Coordinator {
  private history: ConversationMessage[] = [];

  reset(): void {
    this.history = [];
  }

  async processQuestion(
    question: string,
    state: TourState,
    script: TourScript,
    generate: GenerateTextFn,
  ): Promise<CoordinatorDecision> {
    const context = buildTourContext(state, script);

    const messages: ConversationMessage[] = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n${context}` },
      ...this.history,
      { role: 'user', content: question },
    ];

    const raw = await generate(messages);
    const decision = parseDecision(raw);

    // Keep history for conversational context (trim to last 10 exchanges)
    this.history.push({ role: 'user', content: question });
    this.history.push({ role: 'assistant', content: raw });
    if (this.history.length > 20) {
      this.history = this.history.slice(-20);
    }

    return decision;
  }

  /** Generate a spoken introduction for the current step */
  async introduceStep(
    step: TourStep,
    state: TourState,
    script: TourScript,
    generate: GenerateTextFn,
  ): Promise<string> {
    const stepTitle = step.title ?? step.type;
    const tooltip = 'tooltip' in step ? step.tooltip?.text ?? '' : '';
    const context = buildTourContext(state, script);

    const messages: ConversationMessage[] = [
      {
        role: 'system',
        content:
          `You are a tour guide. Introduce the current step in 1-2 friendly sentences. Be concise.\n\n${context}`,
      },
      {
        role: 'user',
        content: `Introduce step "${stepTitle}"${tooltip ? `. Context: ${tooltip}` : ''}.`,
      },
    ];

    return generate(messages);
  }
}

function buildTourContext(state: TourState, script: TourScript): string {
  const currentAct = state.currentAct;
  const currentStep = state.currentStep;

  const stepList = script.acts.flatMap((act, ai) =>
    act.steps.map((s, si) => {
      const isNow = ai === state.actIndex && si === state.stepIndex;
      return `  ${isNow ? '▶' : ' '} [${act.title}] Step ${si + 1}: ${s.title ?? s.type}${
        s.covers?.length ? ` (covers: ${s.covers.join(', ')})` : ''
      }`;
    }),
  );

  return [
    `Tour: "${script.title}"`,
    `Current act: "${currentAct?.title ?? '?'}"`,
    `Current step: "${currentStep?.title ?? currentStep?.type ?? '?'}" (${state.globalStepIndex}/${state.totalSteps})`,
    `Status: ${state.status}`,
    '',
    'Full tour outline:',
    ...stepList,
  ].join('\n');
}

function parseDecision(raw: string): CoordinatorDecision {
  // Extract JSON from the response (model may wrap in markdown code fences)
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const action = parsed.action as string;

    switch (action) {
      case 'answer':
        return { action: 'answer', text: String(parsed.text ?? '') };
      case 'defer':
        return {
          action: 'defer',
          text: String(parsed.text ?? ''),
          coversAtStepTitle: parsed.coversAtStepTitle as string | undefined,
        };
      case 'advance':
        return { action: 'advance', text: parsed.text ? String(parsed.text) : undefined };
      case 'back':
        return { action: 'back', text: parsed.text ? String(parsed.text) : undefined };
      case 'skip':
        return { action: 'skip', reason: parsed.reason ? String(parsed.reason) : undefined };
      case 'end':
        return { action: 'end', summary: parsed.summary ? String(parsed.summary) : undefined };
      default:
        return { action: 'answer', text: raw };
    }
  } catch {
    // Fallback: treat raw text as a plain answer
    return { action: 'answer', text: raw };
  }
}
