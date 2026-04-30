// ---------------------------------------------------------------------------
// Tour modes
// ---------------------------------------------------------------------------

/** Controls how the tour advances and interacts with the user. */
export type TourMode =
  | 'manual'      // User clicks Next/Back — tour never advances on its own
  | 'auto'        // Tour executes all steps automatically and auto-advances
  | 'mixed'       // Per-step: set autoAdvanceMs to auto-advance, omit for manual
  | 'interactive';// Like mixed, but an LLM coordinator answers user questions in real time

// ---------------------------------------------------------------------------
// TourScript — the structured instruction format
// ---------------------------------------------------------------------------

export interface TourScript {
  id: string;
  title: string;
  description?: string;
  mode: TourMode;
  acts: TourAct[];
  settings?: TourSettings;
  metadata?: Record<string, unknown>;
}

export interface TourSettings {
  /** CSS color for the overlay. Default: 'rgba(0,0,0,0.5)' */
  overlayColor?: string;
  /** Extra space (px) around the highlighted element. Default: 8 */
  spotlightPadding?: number;
  /** Border radius (px) of the spotlight cutout. Default: 4 */
  spotlightBorderRadius?: number;
  /** Max width (px) of tooltips. Default: 320 */
  tooltipMaxWidth?: number;
  /** Default ms before auto-advancing (auto/mixed modes). Default: 3000 */
  defaultAutoAdvanceMs?: number;
  /** Show 'Step N/M' counter in tooltip. Default: true */
  showStepCounter?: boolean;
  /** Show prev/next/skip buttons by default. Default: true */
  showDefaultActions?: boolean;
  /** Scroll highlighted element into view. Default: true */
  scrollIntoView?: boolean;
  scrollBehavior?: ScrollBehavior;
  /** CSS z-index base for all tour elements. Default: 9000 */
  zIndex?: number;
}

// ---------------------------------------------------------------------------
// TourAct — groups related steps into a logical chapter
// ---------------------------------------------------------------------------

export interface TourAct {
  id: string;
  title: string;
  description?: string;
  steps: TourStep[];
}

// ---------------------------------------------------------------------------
// TourStep union
// ---------------------------------------------------------------------------

export type TourStep =
  | HighlightStep
  | ClickStep
  | TypeStep
  | NavigateStep
  | WaitStep
  | NarrateStep
  | CustomStep;

export interface BaseStep {
  id: string;
  title?: string;
  /** Tooltip shown alongside the spotlight highlight */
  tooltip?: TooltipContent;
  /** Topics this step covers. Interactive coordinator uses this to defer questions
   * about future topics (e.g. "we'll get to that in the next act"). */
  covers?: string[];
  /** Wait for this CSS selector to appear before executing the step */
  awaitSelector?: string;
  /** Timeout for awaitSelector in ms. Default: 5000 */
  awaitTimeoutMs?: number;
  /** Override auto-advance delay for this step. Set to 0 to disable auto-advance. */
  autoAdvanceMs?: number;
  /** Skip the spotlight highlight for this step (e.g. for narration-only steps) */
  noHighlight?: boolean;
}

export interface TooltipContent {
  text: string;
  /** Preferred popover position relative to the highlighted element. Default: 'auto' */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  /** Override the default action buttons */
  actions?: TooltipAction[];
  /** Render HTML instead of plain text — be sure to sanitize external content */
  html?: string;
}

export interface TooltipAction {
  label: string;
  type: 'next' | 'prev' | 'skip' | 'end' | 'custom';
  onClick?: () => void | Promise<void>;
}

/** Highlight an element and show a tooltip explaining it */
export interface HighlightStep extends BaseStep {
  type: 'highlight';
  selector: string;
}

/** Click an element as part of a demo flow */
export interface ClickStep extends BaseStep {
  type: 'click';
  selector: string;
  /** Don't error if the element is missing — silently skip the click */
  optional?: boolean;
}

/** Type text into an input */
export interface TypeStep extends BaseStep {
  type: 'type';
  selector: string;
  text: string;
  /** Clear the field before typing. Default: false */
  clearFirst?: boolean;
}

/** Navigate to a URL */
export interface NavigateStep extends BaseStep {
  type: 'navigate';
  url: string;
}

/** Wait a fixed duration (e.g. let an animation finish) */
export interface WaitStep extends BaseStep {
  type: 'wait';
  ms: number;
}

/** Speak text via VoiceAgent / Web Speech API */
export interface NarrateStep extends BaseStep {
  type: 'narrate';
  text: string;
}

/** Arbitrary async action */
export interface CustomStep extends BaseStep {
  type: 'custom';
  execute: (ctx: TourStepContext) => Promise<void>;
}

export interface TourStepContext {
  tour: TourHandle;
  actIndex: number;
  stepIndex: number;
  globalStepIndex: number;
}

// ---------------------------------------------------------------------------
// Tour state and handle
// ---------------------------------------------------------------------------

export type TourStatus = 'idle' | 'running' | 'paused' | 'completed' | 'skipped' | 'error';

export interface TourState {
  status: TourStatus;
  actIndex: number;
  stepIndex: number;
  /** Total steps across all acts */
  totalSteps: number;
  /** 1-based index into totalSteps */
  globalStepIndex: number;
  currentStep: TourStep | null;
  currentAct: TourAct | null;
  error?: Error;
}

export interface TourHandle {
  readonly state: TourState;
  readonly script: TourScript;
  start(): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  goTo(actIndex: number, stepIndex?: number): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  skip(): Promise<void>;
  end(): Promise<void>;
  /** Ask the coordinator a question (interactive mode only) */
  ask(question: string): Promise<CoordinatorDecision>;
  on<K extends TourEventType>(event: K, handler: TourEventHandler<K>): () => void;
}

// ---------------------------------------------------------------------------
// Tour events
// ---------------------------------------------------------------------------

export type TourEventType =
  | 'start'
  | 'step'
  | 'act'
  | 'complete'
  | 'skip'
  | 'error'
  | 'pause'
  | 'resume'
  | 'question'
  | 'answer';

export type TourEventMap = {
  start: { script: TourScript };
  step: { state: TourState; step: TourStep };
  act: { state: TourState; act: TourAct };
  complete: { state: TourState };
  skip: { state: TourState };
  error: { state: TourState; error: Error };
  pause: { state: TourState };
  resume: { state: TourState };
  question: { text: string; state: TourState };
  answer: { text: string; decision: CoordinatorDecision; state: TourState };
};

export type TourEventHandler<K extends TourEventType> = (payload: TourEventMap[K]) => void;

// ---------------------------------------------------------------------------
// Interactive mode — coordinator decisions
// ---------------------------------------------------------------------------

/** What the LLM coordinator decides to do when a user asks a question */
export type CoordinatorDecision =
  | { action: 'answer'; text: string }
  | { action: 'defer'; text: string; coversAtStepTitle?: string }
  | { action: 'advance'; text?: string }
  | { action: 'back'; text?: string }
  | { action: 'skip'; reason?: string }
  | { action: 'end'; summary?: string };

// ---------------------------------------------------------------------------
// LLM integration (framework-agnostic)
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Provide any LLM that can generate text — Vercel AI SDK, raw API, etc. */
export type GenerateTextFn = (messages: ConversationMessage[]) => Promise<string>;

// ---------------------------------------------------------------------------
// TourOptions (used by createTour)
// ---------------------------------------------------------------------------

export interface TourOptions {
  /** Required for interactive mode */
  generate?: GenerateTextFn;
  /** Narrator for narrate steps and interactive mode voice responses */
  narrator?: NarratorLike;
  /** Called when the tour encounters an unrecoverable error */
  onError?: (error: Error, state: TourState) => void;
}

/** Minimal interface for a narrator — compatible with VoiceAgent from pixeer */
export interface NarratorLike {
  speak(text: string): Promise<void>;
  cancelSpeech?(): void;
}

// ---------------------------------------------------------------------------
// TourPlanner — LLM-powered script generation
// ---------------------------------------------------------------------------

export interface TourPlannerOptions {
  generate: GenerateTextFn;
  /** HTML snippet, accessibility tree, or semantic markdown of the page */
  pageContext: string;
  /** Describe what the tour should teach or demonstrate */
  goal: string;
  mode?: TourMode;
  /** Custom system prompt — overrides the built-in planner prompt */
  systemPrompt?: string;
  /** Max number of steps to generate. Default: 20 */
  maxSteps?: number;
}

export interface PlannedTour {
  script: TourScript;
  raw: string;
}
