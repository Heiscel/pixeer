import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Tour, createTour } from '../Tour.js';
import type { TourScript, TourState, CoordinatorDecision, GenerateTextFn } from '../types.js';

// ---------------------------------------------------------------------------
// Minimal script fixtures
// ---------------------------------------------------------------------------

function makeScript(overrides: Partial<TourScript> = {}): TourScript {
  return {
    id: 'test-tour',
    title: 'Test Tour',
    mode: 'manual',
    acts: [
      {
        id: 'act-0',
        title: 'Act 1',
        steps: [
          {
            id: 'step-0-0',
            type: 'highlight',
            selector: '#btn-a',
            title: 'Step A',
            tooltip: { text: 'Click here', placement: 'bottom' },
          },
          {
            id: 'step-0-1',
            type: 'highlight',
            selector: '#btn-b',
            title: 'Step B',
          },
        ],
      },
      {
        id: 'act-1',
        title: 'Act 2',
        steps: [
          {
            id: 'step-1-0',
            type: 'narrate',
            text: 'All done!',
            title: 'Wrap-up',
            noHighlight: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

// Install a minimal DOM element for selector-based tests
function installElements(): void {
  const a = document.createElement('button');
  a.id = 'btn-a';
  a.textContent = 'Button A';
  document.body.appendChild(a);

  const b = document.createElement('button');
  b.id = 'btn-b';
  b.textContent = 'Button B';
  document.body.appendChild(b);
}

function cleanElements(): void {
  document.body.innerHTML = '';
}

// ---------------------------------------------------------------------------
// createTour factory
// ---------------------------------------------------------------------------

describe('createTour', () => {
  it('returns a TourHandle with idle state', () => {
    const tour = createTour(makeScript());
    expect(tour.state.status).toBe('idle');
    expect(tour.state.totalSteps).toBe(3);
    expect(tour.state.globalStepIndex).toBe(0);
  });

  it('exposes the original script', () => {
    const script = makeScript();
    const tour = createTour(script);
    expect(tour.script).toBe(script);
  });
});

// ---------------------------------------------------------------------------
// TourState transitions — manual mode
// ---------------------------------------------------------------------------

describe('Tour (manual mode)', () => {
  beforeEach(installElements);
  afterEach(cleanElements);

  it('transitions to running on start()', async () => {
    const tour = new Tour(makeScript());
    await tour.start();
    expect(tour.state.status).toBe('running');
    expect(tour.state.actIndex).toBe(0);
    expect(tour.state.stepIndex).toBe(0);
    expect(tour.state.globalStepIndex).toBe(1);
    await tour.skip();
  });

  it('advances to next step on next()', async () => {
    const tour = new Tour(makeScript());
    await tour.start();
    await tour.next();
    expect(tour.state.stepIndex).toBe(1);
    expect(tour.state.globalStepIndex).toBe(2);
    await tour.skip();
  });

  it('crosses act boundary on next() at last step of act', async () => {
    const tour = new Tour(makeScript());
    await tour.start();
    await tour.next(); // step 0-1
    const actSpy = vi.fn();
    tour.on('act', actSpy);
    await tour.next(); // step 1-0 (act 2)
    expect(tour.state.actIndex).toBe(1);
    expect(tour.state.stepIndex).toBe(0);
    expect(actSpy).toHaveBeenCalledOnce();
    await tour.skip();
  });

  it('ends the tour when next() is called on the last step', async () => {
    const tour = new Tour(makeScript());
    await tour.start();
    await tour.next();
    await tour.next();
    // At last step
    const completeSpy = vi.fn();
    tour.on('complete', completeSpy);
    await tour.next();
    expect(tour.state.status).toBe('completed');
    expect(completeSpy).toHaveBeenCalledOnce();
  });

  it('goes back a step on prev()', async () => {
    const tour = new Tour(makeScript());
    await tour.start();
    await tour.next();
    await tour.prev();
    expect(tour.state.stepIndex).toBe(0);
    expect(tour.state.globalStepIndex).toBe(1);
    await tour.skip();
  });

  it('prev() does nothing on first step', async () => {
    const tour = new Tour(makeScript());
    await tour.start();
    await tour.prev();
    expect(tour.state.stepIndex).toBe(0);
    expect(tour.state.globalStepIndex).toBe(1);
    await tour.skip();
  });

  it('prev() crosses act boundary backwards', async () => {
    const tour = new Tour(makeScript());
    await tour.start();
    await tour.next();
    await tour.next(); // act 1, step 0
    await tour.prev(); // should go back to act 0, step 1
    expect(tour.state.actIndex).toBe(0);
    expect(tour.state.stepIndex).toBe(1);
    await tour.skip();
  });

  it('goTo() jumps to a specific act and step', async () => {
    const tour = new Tour(makeScript());
    await tour.start();
    await tour.goTo(1, 0);
    expect(tour.state.actIndex).toBe(1);
    expect(tour.state.stepIndex).toBe(0);
    await tour.skip();
  });

  it('goTo() ignores out-of-range indices', async () => {
    const tour = new Tour(makeScript());
    await tour.start();
    const before = tour.state.actIndex;
    await tour.goTo(99);
    expect(tour.state.actIndex).toBe(before);
    await tour.skip();
  });

  it('skip() sets status to skipped', async () => {
    const tour = new Tour(makeScript());
    await tour.start();
    const spy = vi.fn();
    tour.on('skip', spy);
    await tour.skip();
    expect(tour.state.status).toBe('skipped');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('end() sets status to completed', async () => {
    const tour = new Tour(makeScript());
    await tour.start();
    await tour.end();
    expect(tour.state.status).toBe('completed');
  });

  it('pause() and resume() toggle status', async () => {
    const tour = new Tour(makeScript());
    await tour.start();
    tour.pause();
    expect(tour.state.status).toBe('paused');
    await tour.resume();
    expect(tour.state.status).toBe('running');
    await tour.skip();
  });
});

// ---------------------------------------------------------------------------
// Auto-advance (auto mode)
// ---------------------------------------------------------------------------

describe('Tour (auto mode)', () => {
  beforeEach(installElements);
  afterEach(() => {
    cleanElements();
    vi.useRealTimers();
  });

  it('auto-advances after defaultAutoAdvanceMs', async () => {
    vi.useFakeTimers();
    const script = makeScript({
      mode: 'auto',
      settings: { defaultAutoAdvanceMs: 500, scrollIntoView: false },
    });
    const tour = new Tour(script);
    await tour.start();
    expect(tour.state.globalStepIndex).toBe(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(tour.state.globalStepIndex).toBe(2);

    await tour.skip();
  });

  it('per-step autoAdvanceMs overrides default', async () => {
    vi.useFakeTimers();
    const script: TourScript = {
      id: 'auto-test',
      title: 'Auto Test',
      mode: 'mixed',
      acts: [
        {
          id: 'act-0',
          title: 'Act 1',
          steps: [
            { id: 's0', type: 'narrate', text: 'hi', autoAdvanceMs: 200, noHighlight: true },
            { id: 's1', type: 'narrate', text: 'bye', noHighlight: true },
          ],
        },
      ],
    };
    const tour = new Tour(script);
    await tour.start();
    expect(tour.state.stepIndex).toBe(0);

    await vi.advanceTimersByTimeAsync(200);
    expect(tour.state.stepIndex).toBe(1);

    // Step 1 has no autoAdvanceMs — should NOT advance
    await vi.advanceTimersByTimeAsync(5000);
    expect(tour.state.stepIndex).toBe(1);

    await tour.skip();
  });

  it('pause() cancels auto-advance timer', async () => {
    vi.useFakeTimers();
    const script = makeScript({ mode: 'auto', settings: { defaultAutoAdvanceMs: 500, scrollIntoView: false } });
    const tour = new Tour(script);
    await tour.start();
    tour.pause();
    await vi.advanceTimersByTimeAsync(600);
    expect(tour.state.stepIndex).toBe(0);
    await tour.skip();
  });
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

describe('Tour events', () => {
  beforeEach(installElements);
  afterEach(cleanElements);

  it('emits start event on start()', async () => {
    const tour = new Tour(makeScript());
    const spy = vi.fn();
    tour.on('start', spy);
    await tour.start();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ script: tour.script }));
    await tour.skip();
  });

  it('emits step event on each step', async () => {
    const tour = new Tour(makeScript());
    const steps: TourState[] = [];
    tour.on('step', ({ state }) => steps.push({ ...state }));
    await tour.start();
    await tour.next();
    expect(steps).toHaveLength(2);
    expect(steps[0].globalStepIndex).toBe(1);
    expect(steps[1].globalStepIndex).toBe(2);
    await tour.skip();
  });

  it('emits error event on step failure', async () => {
    cleanElements(); // Remove elements so click fails
    const script: TourScript = {
      id: 'err-tour',
      title: 'Error Tour',
      mode: 'auto',
      acts: [
        {
          id: 'act-0',
          title: 'Act 1',
          steps: [{ id: 's0', type: 'click', selector: '#nonexistent' }],
        },
      ],
    };
    const tour = new Tour(script);
    const errorSpy = vi.fn();
    tour.on('error', errorSpy);
    const onError = vi.fn();
    const tourWithHandler = new Tour(script, { onError });
    await tourWithHandler.start();
    expect(tourWithHandler.state.status).toBe('error');
    expect(onError).toHaveBeenCalledOnce();
  });

  it('on() returns an unsubscribe function', async () => {
    const tour = new Tour(makeScript());
    const spy = vi.fn();
    const unsub = tour.on('step', spy);
    unsub();
    await tour.start();
    await tour.next();
    expect(spy).not.toHaveBeenCalled();
    await tour.skip();
  });
});

// ---------------------------------------------------------------------------
// Interactive mode — ask()
// ---------------------------------------------------------------------------

describe('Tour (interactive mode)', () => {
  beforeEach(installElements);
  afterEach(cleanElements);

  function makeMockGenerate(response: string): GenerateTextFn {
    return vi.fn().mockResolvedValue(response);
  }

  it('ask() returns answer decision', async () => {
    const generate = makeMockGenerate(JSON.stringify({ action: 'answer', text: 'Great question!' }));
    const script = makeScript({ mode: 'interactive' });
    const tour = new Tour(script, { generate });
    await tour.start();

    const decision = await tour.ask('What is this button for?');
    expect(decision).toEqual({ action: 'answer', text: 'Great question!' });
    await tour.skip();
  });

  it('ask() with advance decision calls next()', async () => {
    const generate = makeMockGenerate(JSON.stringify({ action: 'advance', text: 'Moving on!' }));
    const script = makeScript({ mode: 'interactive' });
    const tour = new Tour(script, { generate });
    await tour.start();
    const initialStep = tour.state.stepIndex;
    await tour.ask('next please');
    expect(tour.state.stepIndex).toBe(initialStep + 1);
    await tour.skip();
  });

  it('ask() with end decision marks tour completed', async () => {
    const generate = makeMockGenerate(JSON.stringify({ action: 'end', summary: 'Done!' }));
    const script = makeScript({ mode: 'interactive' });
    const tour = new Tour(script, { generate });
    await tour.start();
    await tour.ask('stop the tour');
    expect(tour.state.status).toBe('completed');
  });

  it('ask() emits question and answer events', async () => {
    const generate = makeMockGenerate(JSON.stringify({ action: 'answer', text: 'Yes' }));
    const script = makeScript({ mode: 'interactive' });
    const tour = new Tour(script, { generate });
    const questionSpy = vi.fn();
    const answerSpy = vi.fn();
    tour.on('question', questionSpy);
    tour.on('answer', answerSpy);
    await tour.start();
    await tour.ask('hello?');
    expect(questionSpy).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello?' }));
    expect(answerSpy).toHaveBeenCalledWith(expect.objectContaining({ text: 'Yes' }));
    await tour.skip();
  });

  it('ask() returns fallback when mode is not interactive', async () => {
    const tour = new Tour(makeScript({ mode: 'manual' }));
    await tour.start();
    const decision = await tour.ask('question');
    expect(decision.action).toBe('answer');
    await tour.skip();
  });

  it('ask() handles invalid JSON from LLM gracefully', async () => {
    const generate = makeMockGenerate('Sorry, I cannot help with that right now.');
    const script = makeScript({ mode: 'interactive' });
    const tour = new Tour(script, { generate });
    await tour.start();
    const decision = await tour.ask('anything');
    expect(decision.action).toBe('answer');
    expect((decision as { action: 'answer'; text: string }).text).toContain('Sorry');
    await tour.skip();
  });
});

// ---------------------------------------------------------------------------
// TourPlanner
// ---------------------------------------------------------------------------

describe('planTour', () => {
  it('parses a valid LLM response into a TourScript', async () => {
    const { planTour } = await import('../TourPlanner.js');
    const mockScript: TourScript = {
      id: 'tour-abc',
      title: 'Feature Tour',
      mode: 'manual',
      acts: [
        {
          id: 'act-0',
          title: 'Getting Started',
          steps: [
            {
              id: 'step-0-0',
              type: 'highlight',
              selector: '#dashboard',
              title: 'Dashboard',
              tooltip: { text: 'This is the dashboard', placement: 'bottom' },
            },
          ],
        },
      ],
    };
    const generate = vi.fn().mockResolvedValue(JSON.stringify(mockScript));
    const result = await planTour({
      generate,
      pageContext: '<div id="dashboard">Dashboard</div>',
      goal: 'Show the user the dashboard',
      mode: 'manual',
    });
    expect(result.script.id).toBe('tour-abc');
    expect(result.script.acts[0].steps[0].type).toBe('highlight');
    expect(result.raw).toBe(JSON.stringify(mockScript));
  });

  it('falls back gracefully when LLM returns invalid JSON', async () => {
    const { planTour } = await import('../TourPlanner.js');
    const generate = vi.fn().mockResolvedValue('This is not JSON at all.');
    const result = await planTour({
      generate,
      pageContext: 'some page',
      goal: 'show something',
    });
    expect(result.script.acts).toHaveLength(1);
    expect(result.script.acts[0].steps[0].type).toBe('narrate');
  });

  it('filters out steps with missing required fields', async () => {
    const { planTour } = await import('../TourPlanner.js');
    const brokenScript = {
      id: 'tour-x',
      title: 'X',
      mode: 'manual',
      acts: [
        {
          id: 'act-0',
          title: 'A',
          steps: [
            { id: 's0', type: 'highlight' },              // missing selector → filtered
            { id: 's1', type: 'highlight', selector: '#ok' }, // valid
          ],
        },
      ],
    };
    const generate = vi.fn().mockResolvedValue(JSON.stringify(brokenScript));
    const result = await planTour({ generate, pageContext: '', goal: '' });
    expect(result.script.acts[0].steps).toHaveLength(1);
    expect((result.script.acts[0].steps[0] as { selector: string }).selector).toBe('#ok');
  });
});

// ---------------------------------------------------------------------------
// AdaptationMonitor
// ---------------------------------------------------------------------------

describe('AdaptationMonitor', () => {
  afterEach(cleanElements);

  it('checkStep returns ready when selector exists', async () => {
    const { AdaptationMonitor } = await import('../AdaptationMonitor.js');
    installElements();
    const monitor = new AdaptationMonitor();
    const result = monitor.checkStep({ id: 's', type: 'highlight', selector: '#btn-a' });
    expect(result.ready).toBe(true);
  });

  it('checkStep returns not ready when selector is missing', async () => {
    const { AdaptationMonitor } = await import('../AdaptationMonitor.js');
    const monitor = new AdaptationMonitor();
    const result = monitor.checkStep({ id: 's', type: 'highlight', selector: '#does-not-exist' });
    expect(result.ready).toBe(false);
    expect(result.missedSelector).toBe('#does-not-exist');
  });

  it('auditScript returns all missing selectors', async () => {
    const { AdaptationMonitor } = await import('../AdaptationMonitor.js');
    const monitor = new AdaptationMonitor();
    const script = makeScript();
    const missing = monitor.auditScript(script);
    // btn-a and btn-b don't exist since we called cleanElements
    expect(missing).toContain('#btn-a');
    expect(missing).toContain('#btn-b');
  });

  it('onChange callback fires on DOM mutation', async () => {
    const { AdaptationMonitor } = await import('../AdaptationMonitor.js');
    const monitor = new AdaptationMonitor();
    monitor.start();
    const spy = vi.fn();
    monitor.onChange(spy);

    const el = document.createElement('div');
    document.body.appendChild(el);
    // MutationObserver fires async
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalled();
    monitor.stop();
  });
});

// ---------------------------------------------------------------------------
// Coordinator
// ---------------------------------------------------------------------------

describe('Coordinator', () => {
  it('parses defer decision', async () => {
    const { Coordinator } = await import('../Coordinator.js');
    const coord = new Coordinator();
    const generate: GenerateTextFn = vi.fn().mockResolvedValue(
      JSON.stringify({ action: 'defer', text: "We'll cover that soon.", coversAtStepTitle: 'Advanced Features' }),
    );
    const script = makeScript({ mode: 'interactive' });
    const state: TourState = {
      status: 'running',
      actIndex: 0,
      stepIndex: 0,
      totalSteps: 3,
      globalStepIndex: 1,
      currentStep: script.acts[0].steps[0],
      currentAct: script.acts[0],
    };

    const decision = await coord.processQuestion('Tell me about advanced features', state, script, generate);
    expect(decision).toEqual({
      action: 'defer',
      text: "We'll cover that soon.",
      coversAtStepTitle: 'Advanced Features',
    });
  });

  it('handles JSON wrapped in markdown code fences', async () => {
    const { Coordinator } = await import('../Coordinator.js');
    const coord = new Coordinator();
    const wrapped = '```json\n{"action":"answer","text":"Here you go!"}\n```';
    const generate: GenerateTextFn = vi.fn().mockResolvedValue(wrapped);
    const script = makeScript({ mode: 'interactive' });
    const state: TourState = {
      status: 'running',
      actIndex: 0,
      stepIndex: 0,
      totalSteps: 3,
      globalStepIndex: 1,
      currentStep: script.acts[0].steps[0],
      currentAct: script.acts[0],
    };
    const decision = await coord.processQuestion('?', state, script, generate);
    expect(decision).toEqual({ action: 'answer', text: 'Here you go!' });
  });

  it('reset() clears conversation history', async () => {
    const { Coordinator } = await import('../Coordinator.js');
    const coord = new Coordinator();
    coord.reset();
    // Should not throw
  });
});
