import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { Tour } from './Tour.js';
import type {
  TourScript,
  TourState,
  TourHandle,
  TourOptions,
  CoordinatorDecision,
} from './types.js';

// ---------------------------------------------------------------------------
// useTour — mount a tour and get its live state + navigation API
// ---------------------------------------------------------------------------

export interface UseTourResult {
  /** Current tour state — reactive, updates on every step */
  state: TourState;
  /** The full tour handle for programmatic control */
  tour: TourHandle;
  /** Start the tour */
  start: () => Promise<void>;
  /** Advance to next step */
  next: () => Promise<void>;
  /** Go back one step */
  prev: () => Promise<void>;
  /** Skip the entire tour */
  skip: () => Promise<void>;
  /** End the tour (mark as complete) */
  end: () => Promise<void>;
  /** Ask the coordinator a question (interactive mode only) */
  ask: (question: string) => Promise<CoordinatorDecision>;
}

/**
 * Mount a Pixeer tour inside a React component.
 * Returns reactive state that updates on every tour event.
 *
 * @example
 * const { state, start, next, skip } = useTour(myScript, { generate: myLLM });
 * // <button onClick={start}>Begin tour</button>
 * // <button onClick={next}>Next</button>
 */
export function useTour(script: TourScript, options: TourOptions = {}): UseTourResult {
  const tourRef = useRef<Tour | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setState] = useState<TourState>(() => ({
    status: 'idle',
    actIndex: 0,
    stepIndex: 0,
    totalSteps: script.acts.reduce((n, a) => n + a.steps.length, 0),
    globalStepIndex: 0,
    currentStep: null,
    currentAct: null,
  }));

  // Create tour instance once; rebuild if script identity changes
  if (!tourRef.current || tourRef.current.script !== script) {
    tourRef.current = new Tour(script, optionsRef.current);
  }

  useEffect(() => {
    const tour = tourRef.current!;

    const syncState = () => setState({ ...tour.state });

    // Subscribe to all state-changing events
    const unsubs = [
      tour.on('start',    syncState),
      tour.on('step',     syncState),
      tour.on('act',      syncState),
      tour.on('complete', syncState),
      tour.on('skip',     syncState),
      tour.on('pause',    syncState),
      tour.on('resume',   syncState),
      tour.on('error',    syncState),
    ];

    return () => {
      unsubs.forEach((fn) => fn());
      tour.skip().catch(() => {});
    };
    // Only run on script change, not options — options are captured via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  const tour = tourRef.current;

  const start = useCallback(() => tour.start(), [tour]);
  const next  = useCallback(() => tour.next(),  [tour]);
  const prev  = useCallback(() => tour.prev(),  [tour]);
  const skip  = useCallback(() => tour.skip(),  [tour]);
  const end   = useCallback(() => tour.end(),   [tour]);
  const ask   = useCallback((q: string) => tour.ask(q), [tour]);

  return useMemo(
    () => ({ state, tour, start, next, prev, skip, end, ask }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, tour],
  );
}

// ---------------------------------------------------------------------------
// useTourStep — subscribe to a specific step event
// ---------------------------------------------------------------------------

export interface UseTourStepOptions {
  /** Only fire when the tour reaches the step with this id */
  stepId?: string;
  /** Only fire when the tour reaches this act index */
  actIndex?: number;
}

/**
 * Subscribe to step changes on a tour handle.
 * Useful for triggering side effects when a specific step is reached.
 */
export function useTourStep(
  tour: TourHandle,
  callback: (state: TourState) => void,
  options: UseTourStepOptions = {},
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return tour.on('step', ({ state }) => {
      if (options.stepId && state.currentStep?.id !== options.stepId) return;
      if (options.actIndex !== undefined && state.actIndex !== options.actIndex) return;
      callbackRef.current(state);
    });
  }, [tour, options.stepId, options.actIndex]);
}

// ---------------------------------------------------------------------------
// useInteractiveTour — wraps useTour with question/answer state management
// ---------------------------------------------------------------------------

export interface UseInteractiveTourResult extends UseTourResult {
  /** Submit a user question to the coordinator */
  submitQuestion: (text: string) => Promise<void>;
  /** The last decision made by the coordinator, if any */
  lastDecision: CoordinatorDecision | null;
  /** True while waiting for the coordinator's response */
  answering: boolean;
}

/**
 * Extension of `useTour` that adds question/answer state for interactive mode.
 *
 * @example
 * const { state, start, submitQuestion, lastDecision, answering } = useInteractiveTour(script, { generate });
 */
export function useInteractiveTour(
  script: TourScript,
  options: TourOptions,
): UseInteractiveTourResult {
  const base = useTour(script, options);
  const [answering, setAnswering] = useState(false);
  const [lastDecision, setLastDecision] = useState<CoordinatorDecision | null>(null);

  const submitQuestion = useCallback(
    async (text: string) => {
      setAnswering(true);
      try {
        const decision = await base.ask(text);
        setLastDecision(decision);
      } finally {
        setAnswering(false);
      }
    },
    [base],
  );

  return useMemo(
    () => ({ ...base, submitQuestion, lastDecision, answering }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, answering, lastDecision],
  );
}
