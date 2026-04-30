import type {
  TourScript,
  TourAct,
  TourStep,
  TourState,
  TourStatus,
  TourHandle,
  TourOptions,
  TourSettings,
  TourEventType,
  TourEventHandler,
  TourEventMap,
  TooltipAction,
  CoordinatorDecision,
} from './types.js';
import { Highlighter } from './Highlighter.js';
import { StepExecutor, scrollIntoView } from './StepExecutor.js';
import { AdaptationMonitor } from './AdaptationMonitor.js';
import { Coordinator } from './Coordinator.js';
import { Narrator } from './Narrator.js';

const DEFAULT_SETTINGS: Required<TourSettings> = {
  overlayColor: 'rgba(0,0,0,0.5)',
  spotlightPadding: 8,
  spotlightBorderRadius: 4,
  tooltipMaxWidth: 320,
  defaultAutoAdvanceMs: 3000,
  showStepCounter: true,
  showDefaultActions: true,
  scrollIntoView: true,
  scrollBehavior: 'smooth',
  zIndex: 9000,
};

type Listeners = { [K in TourEventType]?: Set<TourEventHandler<K>> };

export class Tour implements TourHandle {
  private _state: TourState;
  private _settings: Required<TourSettings>;
  private _listeners: Listeners = {};
  private _highlighter = new Highlighter();
  private _executor = new StepExecutor();
  private _monitor = new AdaptationMonitor();
  private _coordinator = new Coordinator();
  private _narrator: Narrator;
  private _autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
  private _flatSteps: { act: TourAct; actIndex: number; step: TourStep; stepIndex: number }[] = [];

  constructor(
    readonly script: TourScript,
    private readonly options: TourOptions = {},
  ) {
    this._settings = { ...DEFAULT_SETTINGS, ...script.settings };
    this._narrator = new Narrator(options.narrator ?? null);
    this._flatSteps = buildFlatSteps(script);
    this._state = {
      status: 'idle',
      actIndex: 0,
      stepIndex: 0,
      totalSteps: this._flatSteps.length,
      globalStepIndex: 0,
      currentStep: null,
      currentAct: null,
    };
  }

  get state(): TourState {
    return this._state;
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this._state.status === 'running') return;
    this._coordinator.reset();
    this._monitor.start();
    this._setState({ status: 'running', actIndex: 0, stepIndex: 0, globalStepIndex: 1 });
    this._emit('start', { script: this.script });
    await this._runCurrentStep();
  }

  async next(): Promise<void> {
    if (this._state.status !== 'running' && this._state.status !== 'paused') return;
    this._clearAutoAdvance();

    const next = this._findNextStep();
    if (!next) {
      await this.end();
      return;
    }

    const { actIndex, stepIndex, globalIndex } = next;
    const prevActIndex = this._state.actIndex;

    this._setState({ actIndex, stepIndex, globalStepIndex: globalIndex });

    if (actIndex !== prevActIndex) {
      this._emit('act', { state: this._state, act: this.script.acts[actIndex] });
    }

    await this._runCurrentStep();
  }

  async prev(): Promise<void> {
    if (this._state.status !== 'running' && this._state.status !== 'paused') return;
    this._clearAutoAdvance();

    const prev = this._findPrevStep();
    if (!prev) return;

    const { actIndex, stepIndex, globalIndex } = prev;
    const prevActIndex = this._state.actIndex;

    this._setState({ actIndex, stepIndex, globalStepIndex: globalIndex });

    if (actIndex !== prevActIndex) {
      this._emit('act', { state: this._state, act: this.script.acts[actIndex] });
    }

    await this._runCurrentStep();
  }

  async goTo(actIndex: number, stepIndex = 0): Promise<void> {
    if (actIndex < 0 || actIndex >= this.script.acts.length) return;
    const act = this.script.acts[actIndex];
    if (stepIndex < 0 || stepIndex >= act.steps.length) return;

    this._clearAutoAdvance();
    const globalIndex = this._globalIndexOf(actIndex, stepIndex);
    this._setState({ actIndex, stepIndex, globalStepIndex: globalIndex, status: 'running' });
    await this._runCurrentStep();
  }

  pause(): void {
    if (this._state.status !== 'running') return;
    this._clearAutoAdvance();
    this._setState({ status: 'paused' });
    this._emit('pause', { state: this._state });
  }

  async resume(): Promise<void> {
    if (this._state.status !== 'paused') return;
    this._setState({ status: 'running' });
    this._emit('resume', { state: this._state });
    await this._scheduleAutoAdvance();
  }

  async skip(): Promise<void> {
    this._clearAutoAdvance();
    this._highlighter.clear();
    this._narrator.cancel();
    this._monitor.stop();
    this._setState({ status: 'skipped', currentStep: null, currentAct: null });
    this._emit('skip', { state: this._state });
  }

  async end(): Promise<void> {
    this._clearAutoAdvance();
    this._highlighter.clear();
    this._narrator.cancel();
    this._monitor.stop();
    this._setState({ status: 'completed', currentStep: null, currentAct: null });
    this._emit('complete', { state: this._state });
  }

  async ask(question: string): Promise<CoordinatorDecision> {
    if (this.script.mode !== 'interactive') {
      return { action: 'answer', text: 'Interactive mode is not enabled for this tour.' };
    }
    if (!this.options.generate) {
      return { action: 'answer', text: 'No LLM generate function was provided.' };
    }

    this._emit('question', { text: question, state: this._state });

    const decision = await this._coordinator.processQuestion(
      question,
      this._state,
      this.script,
      this.options.generate,
    );

    const responseText = 'text' in decision ? decision.text
      : 'summary' in decision ? (decision.summary ?? '')
      : 'reason' in decision ? (decision.reason ?? '')
      : '';

    if (responseText && this._narrator.available) {
      void this._narrator.speak(responseText);
    }

    this._emit('answer', { text: responseText ?? '', decision, state: this._state });

    // Act on the decision
    switch (decision.action) {
      case 'advance': await this.next(); break;
      case 'back':    await this.prev(); break;
      case 'skip':    await this.next(); break;
      case 'end':     await this.end(); break;
      default: break;
    }

    return decision;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  on<K extends TourEventType>(event: K, handler: TourEventHandler<K>): () => void {
    if (!this._listeners[event]) {
      (this._listeners as Record<string, Set<unknown>>)[event] = new Set();
    }
    const set = this._listeners[event] as Set<TourEventHandler<K>>;
    set.add(handler);
    return () => set.delete(handler);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async _runCurrentStep(): Promise<void> {
    const { actIndex, stepIndex } = this._state;
    const act = this.script.acts[actIndex];
    if (!act) return;
    const step = act.steps[stepIndex];
    if (!step) return;

    this._setState({ currentStep: step, currentAct: act });
    this._emit('step', { state: this._state, step });

    try {
      // Scroll into view and highlight
      if (!step.noHighlight && 'selector' in step && step.selector) {
        const el = document.querySelector(step.selector as string);
        if (el) {
          if (this._settings.scrollIntoView) {
            await scrollIntoView(el, this._settings.scrollBehavior);
          }
          this._highlighter.highlight(el, {
            padding: this._settings.spotlightPadding,
            borderRadius: this._settings.spotlightBorderRadius,
            overlayColor: this._settings.overlayColor,
            zIndex: this._settings.zIndex,
            maxWidth: this._settings.tooltipMaxWidth,
            tooltip: step.tooltip,
            counter: this._settings.showStepCounter
              ? `Step ${this._state.globalStepIndex} / ${this._state.totalSteps}`
              : undefined,
            defaultActions: this._settings.showDefaultActions
              ? buildDefaultActions(this._state)
              : undefined,
            onNext: () => void this.next(),
            onPrev: () => void this.prev(),
            onSkip: () => void this.skip(),
          });
        }
      } else if (!step.noHighlight && !('selector' in step) && step.tooltip) {
        // Steps without a selector (narrate, wait, navigate) — clear the highlight but keep tooltip
        this._highlighter.clear();
        // Show a centered tooltip without a spotlight
        this._showFloatingTooltip(step);
      }

      // Execute step action (auto/mixed/interactive modes)
      if (this.script.mode !== 'manual') {
        await this._executor.execute(step, {
          tour: this,
          actIndex,
          stepIndex,
          globalStepIndex: this._state.globalStepIndex,
        });
      }

      // Narrate
      if (step.type === 'narrate') {
        await this._narrator.speak(step.text);
      } else if (
        this.script.mode === 'interactive' &&
        this.options.generate &&
        step.tooltip?.text
      ) {
        // In interactive mode, optionally introduce each step via LLM narration
        if (this._narrator.available) {
          const intro = await this._coordinator.introduceStep(
            step,
            this._state,
            this.script,
            this.options.generate,
          );
          void this._narrator.speak(intro);
        }
      }

      await this._scheduleAutoAdvance();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this._setState({ status: 'error', error });
      this._emit('error', { state: this._state, error });
      this.options.onError?.(error, this._state);
    }
  }

  private _showFloatingTooltip(step: TourStep): void {
    if (!step.tooltip) return;
    // Position at vertical center of viewport without a spotlight
    const sentinel = document.createElement('div');
    Object.assign(sentinel.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      width: '1px',
      height: '1px',
      pointerEvents: 'none',
    });
    document.body.appendChild(sentinel);
    this._highlighter.highlight(sentinel, {
      padding: 0,
      overlayColor: this._settings.overlayColor,
      zIndex: this._settings.zIndex,
      maxWidth: this._settings.tooltipMaxWidth,
      tooltip: step.tooltip,
      counter: this._settings.showStepCounter
        ? `Step ${this._state.globalStepIndex} / ${this._state.totalSteps}`
        : undefined,
      defaultActions: this._settings.showDefaultActions
        ? buildDefaultActions(this._state)
        : undefined,
      onNext: () => void this.next(),
      onPrev: () => void this.prev(),
      onSkip: () => void this.skip(),
    });
    sentinel.remove();
  }

  private async _scheduleAutoAdvance(): Promise<void> {
    if (this._state.status !== 'running') return;
    const step = this._state.currentStep;
    if (!step) return;

    const shouldAuto =
      this.script.mode === 'auto' ||
      (this.script.mode !== 'manual' && typeof step.autoAdvanceMs === 'number' && step.autoAdvanceMs > 0);

    if (!shouldAuto) return;

    const delay = step.autoAdvanceMs ?? this._settings.defaultAutoAdvanceMs;
    if (delay <= 0) return;

    this._autoAdvanceTimer = setTimeout(() => {
      if (this._state.status === 'running') {
        void this.next();
      }
    }, delay);
  }

  private _clearAutoAdvance(): void {
    if (this._autoAdvanceTimer !== null) {
      clearTimeout(this._autoAdvanceTimer);
      this._autoAdvanceTimer = null;
    }
  }

  private _findNextStep(): { actIndex: number; stepIndex: number; globalIndex: number } | null {
    const { actIndex, stepIndex } = this._state;
    const act = this.script.acts[actIndex];

    if (stepIndex + 1 < act.steps.length) {
      return {
        actIndex,
        stepIndex: stepIndex + 1,
        globalIndex: this._globalIndexOf(actIndex, stepIndex + 1),
      };
    }

    if (actIndex + 1 < this.script.acts.length) {
      return {
        actIndex: actIndex + 1,
        stepIndex: 0,
        globalIndex: this._globalIndexOf(actIndex + 1, 0),
      };
    }

    return null;
  }

  private _findPrevStep(): { actIndex: number; stepIndex: number; globalIndex: number } | null {
    const { actIndex, stepIndex } = this._state;

    if (stepIndex > 0) {
      return {
        actIndex,
        stepIndex: stepIndex - 1,
        globalIndex: this._globalIndexOf(actIndex, stepIndex - 1),
      };
    }

    if (actIndex > 0) {
      const prevAct = this.script.acts[actIndex - 1];
      const lastStep = prevAct.steps.length - 1;
      return {
        actIndex: actIndex - 1,
        stepIndex: lastStep,
        globalIndex: this._globalIndexOf(actIndex - 1, lastStep),
      };
    }

    return null;
  }

  private _globalIndexOf(actIndex: number, stepIndex: number): number {
    let count = 0;
    for (let ai = 0; ai < actIndex; ai++) {
      count += this.script.acts[ai].steps.length;
    }
    return count + stepIndex + 1;
  }

  private _setState(patch: Partial<TourState>): void {
    this._state = { ...this._state, ...patch };
    // Keep currentStep/currentAct in sync with actIndex/stepIndex
    if ('actIndex' in patch || 'stepIndex' in patch) {
      const act = this.script.acts[this._state.actIndex];
      this._state = {
        ...this._state,
        currentAct: act ?? null,
        currentStep: act?.steps[this._state.stepIndex] ?? null,
      };
    }
  }

  private _emit<K extends TourEventType>(event: K, payload: TourEventMap[K]): void {
    const set = this._listeners[event] as Set<TourEventHandler<K>> | undefined;
    set?.forEach((fn) => fn(payload));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFlatSteps(
  script: TourScript,
): { act: TourAct; actIndex: number; step: TourStep; stepIndex: number }[] {
  return script.acts.flatMap((act, ai) =>
    act.steps.map((step, si) => ({ act, actIndex: ai, step, stepIndex: si })),
  );
}

function buildDefaultActions(state: TourState): TooltipAction[] {
  const actions: TooltipAction[] = [];
  if (state.globalStepIndex > 1) actions.push({ label: 'Back', type: 'prev' });
  actions.push({ label: state.globalStepIndex < state.totalSteps ? 'Next' : 'Finish', type: 'next' });
  actions.push({ label: 'Skip tour', type: 'skip' });
  return actions;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTour(script: TourScript, options: TourOptions = {}): TourHandle {
  return new Tour(script, options);
}
