import type {
  TourScript,
  TourAct,
  TourStep,
  TourMode,
  TourPlannerOptions,
  PlannedTour,
} from './types.js';

const DEFAULT_SYSTEM_PROMPT = `You are a product tour planner. Given a page description and a goal, generate a structured tour script as JSON.

The JSON must match this exact shape:
{
  "id": "tour-<slug>",
  "title": "...",
  "description": "...",
  "mode": "manual" | "auto" | "mixed" | "interactive",
  "acts": [
    {
      "id": "act-<slug>",
      "title": "...",
      "steps": [
        {
          "id": "step-<slug>",
          "type": "highlight" | "click" | "type" | "navigate" | "wait" | "narrate",
          "title": "...",
          "selector": "...",   // CSS selector — required for highlight/click/type
          "text": "...",       // required for type/narrate
          "url": "...",        // required for navigate
          "ms": 0,             // required for wait
          "covers": ["..."],   // optional topics this step covers
          "tooltip": {
            "text": "...",
            "placement": "auto" | "top" | "bottom" | "left" | "right"
          }
        }
      ]
    }
  ]
}

Rules:
- Group logically related steps into acts (e.g. "Getting Started", "Core Features", "Advanced")
- Use REAL CSS selectors that would exist on the described page
- Every step MUST have a unique id (use kebab-case)
- Narrate steps explain what's happening without a selector
- Highlight steps show and explain an element without clicking it
- Prefer semantic selectors like [data-testid="..."], #id, or .class over positional selectors
- Return ONLY the JSON — no markdown, no explanation`;

/** Generate a TourScript from a page description and goal using an LLM. */
export async function planTour(options: TourPlannerOptions): Promise<PlannedTour> {
  const {
    generate,
    pageContext,
    goal,
    mode = 'manual',
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    maxSteps = 20,
  } = options;

  const userPrompt = [
    `Page description:`,
    pageContext,
    '',
    `Goal: ${goal}`,
    `Mode: ${mode}`,
    `Max steps total: ${maxSteps}`,
    '',
    `Generate a tour script JSON now.`,
  ].join('\n');

  const raw = await generate([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  const script = parseScript(raw, mode);
  return { script, raw };
}

function parseScript(raw: string, defaultMode: TourMode): TourScript {
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    // Return a fallback single-act, single-narrate-step tour on parse failure
    return fallbackScript(raw, defaultMode);
  }

  const id = String(parsed.id ?? `tour-${Date.now()}`);
  const title = String(parsed.title ?? 'Untitled Tour');
  const description = parsed.description ? String(parsed.description) : undefined;
  const mode = validateMode(parsed.mode) ?? defaultMode;

  const rawActs = Array.isArray(parsed.acts) ? (parsed.acts as unknown[]) : [];
  const acts: TourAct[] = rawActs.map((rawAct, ai) => {
    const act = rawAct as Record<string, unknown>;
    const rawSteps = Array.isArray(act.steps) ? (act.steps as unknown[]) : [];
    const steps: TourStep[] = rawSteps.map((rawStep, si) => parseStep(rawStep, ai, si)).filter(Boolean) as TourStep[];

    return {
      id: String(act.id ?? `act-${ai}`),
      title: String(act.title ?? `Act ${ai + 1}`),
      description: act.description ? String(act.description) : undefined,
      steps,
    };
  });

  return { id, title, description, mode, acts };
}

function parseStep(raw: unknown, actIndex: number, stepIndex: number): TourStep | null {
  const s = raw as Record<string, unknown>;
  const type = String(s.type ?? 'highlight') as TourStep['type'];
  const id = String(s.id ?? `step-${actIndex}-${stepIndex}`);
  const title = s.title ? String(s.title) : undefined;
  const covers = Array.isArray(s.covers) ? (s.covers as string[]) : undefined;
  const awaitSelector = s.awaitSelector ? String(s.awaitSelector) : undefined;
  const autoAdvanceMs = typeof s.autoAdvanceMs === 'number' ? s.autoAdvanceMs : undefined;
  const noHighlight = Boolean(s.noHighlight);

  const tooltip = s.tooltip
    ? {
        text: String((s.tooltip as Record<string, unknown>).text ?? ''),
        placement: ((s.tooltip as Record<string, unknown>).placement ?? 'auto') as 'auto',
      }
    : undefined;

  const base = { id, title, tooltip, covers, awaitSelector, autoAdvanceMs, noHighlight };

  switch (type) {
    case 'highlight':
      if (!s.selector) return null;
      return { ...base, type: 'highlight', selector: String(s.selector) };
    case 'click':
      if (!s.selector) return null;
      return { ...base, type: 'click', selector: String(s.selector), optional: Boolean(s.optional) };
    case 'type':
      if (!s.selector || !s.text) return null;
      return { ...base, type: 'type', selector: String(s.selector), text: String(s.text), clearFirst: Boolean(s.clearFirst) };
    case 'navigate':
      if (!s.url) return null;
      return { ...base, type: 'navigate', url: String(s.url) };
    case 'wait':
      return { ...base, type: 'wait', ms: typeof s.ms === 'number' ? s.ms : 1000 };
    case 'narrate':
      if (!s.text) return null;
      return { ...base, type: 'narrate', text: String(s.text) };
    default:
      return null;
  }
}

function validateMode(value: unknown): TourMode | null {
  const valid: TourMode[] = ['manual', 'auto', 'mixed', 'interactive'];
  return valid.includes(value as TourMode) ? (value as TourMode) : null;
}

function fallbackScript(raw: string, mode: TourMode): TourScript {
  return {
    id: `tour-${Date.now()}`,
    title: 'Tour',
    mode,
    acts: [
      {
        id: 'act-0',
        title: 'Introduction',
        steps: [
          {
            id: 'step-0-0',
            type: 'narrate',
            text: raw.slice(0, 200),
            noHighlight: true,
          },
        ],
      },
    ],
  };
}
