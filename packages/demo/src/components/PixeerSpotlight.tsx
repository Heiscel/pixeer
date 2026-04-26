import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X, Settings, Loader2, Check, AlertCircle, ChevronRight } from 'lucide-react';
import { PixeerAgent } from 'pixeer';
import type { PixeerCallerTransport } from 'pixeer';

type Phase = 'idle' | 'open' | 'thinking' | 'executing' | 'done' | 'error';
type StepStatus = 'pending' | 'running' | 'done' | 'error';

type Action =
  | { action: 'navigate'; tab: string; description: string }
  | { action: 'click'; target: string; description: string }
  | { action: 'type'; target: string; text: string; description: string }
  | { action: 'pressKey'; key: string; description: string };

type Step = { action: Action; status: StepStatus };

const EXAMPLES = [
  'Add a task called "Fix the login bug"',
  'Go to the Tasks tab and create a new task',
  'Mark the first task as complete',
];

const PROMPT_TEMPLATE = `You control a web app called Nexora. Return ONLY a JSON array of actions.

Available actions:
{"action":"navigate","tab":"tasks|home","description":"..."}
{"action":"click","target":"<aria-label>","description":"..."}
{"action":"type","target":"<aria-label>","text":"<value>","description":"..."}
{"action":"pressKey","key":"Enter|Escape","description":"..."}

Key aria-labels on this page:
- Sidebar nav: "Navigate to Tasks", "Navigate to Home"
- Task button: "New Task"
- Task input: "Task name input"
- Submit button: "Add task"
- Task toggles: "Toggle task: <task text>"

Current page elements (from Pixeer getContext):
{CONTEXT}

User request: {REQUEST}

Return a JSON array only. No markdown, no text outside the array.`;

async function callGemma(apiKey: string, request: string, context: string): Promise<Action[]> {
  const prompt = PROMPT_TEMPLATE.replace('{CONTEXT}', context).replace('{REQUEST}', request);

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Pixeer Demo',
    },
    body: JSON.stringify({
      model: 'google/gemma-3-27b-it',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 150)}`);
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const text = data.choices[0]?.message?.content ?? '[]';

  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) throw new Error('Model returned no JSON array. Try rephrasing.');
  return JSON.parse(match[0]) as Action[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function highlightEl(name: string): () => void {
  const el = document.querySelector(`[aria-label="${name}"]`) as HTMLElement | null;
  if (!el) return () => {};
  el.classList.add('pixeer-highlight');
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return () => el.classList.remove('pixeer-highlight');
}

interface Props {
  callerTransportRef: RefObject<PixeerCallerTransport | null>;
}

export default function PixeerSpotlight({ callerTransportRef }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [input, setInput] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('pixeer_key') ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Escape listener
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPhase((p) => (p === 'idle' ? 'open' : p === 'open' ? 'idle' : p));
      }
      if (e.key === 'Escape') {
        setPhase((p) => (['open', 'done', 'error'].includes(p) ? 'idle' : p));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (phase === 'open') setTimeout(() => inputRef.current?.focus(), 50);
  }, [phase]);

  function saveKey(k: string) {
    setApiKey(k);
    localStorage.setItem('pixeer_key', k);
  }

  function reset() {
    setPhase('idle');
    setInput('');
    setSteps([]);
    setErrorMsg('');
  }

  const run = useCallback(async () => {
    if (!input.trim()) return;

    const transport = callerTransportRef.current;
    if (!transport) {
      setErrorMsg('Bridge not ready — refresh the page.');
      setPhase('error');
      return;
    }
    if (!apiKey.trim()) {
      setShowKey(true);
      setErrorMsg('Add your OpenRouter API key using the ⚙ button above.');
      setPhase('error');
      return;
    }

    setPhase('thinking');

    try {
      const agent = new PixeerAgent(transport);
      const { context } = await agent.getContext();
      const actions = await callGemma(apiKey, input, context);

      if (!actions.length) {
        setErrorMsg('The model returned no actions. Try rephrasing.');
        setPhase('error');
        return;
      }

      const initialSteps: Step[] = actions.map((a) => ({ action: a, status: 'pending' }));
      setSteps(initialSteps);
      setPhase('executing');

      for (let i = 0; i < actions.length; i++) {
        const a = actions[i];
        setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: 'running' } : s)));

        try {
          if (a.action === 'navigate') {
            window.dispatchEvent(new CustomEvent('pixeer:navigate', { detail: { tab: a.tab } }));
            await sleep(400);
          } else if (a.action === 'click') {
            const remove = highlightEl(a.target);
            await sleep(600);
            await agent.click(a.target);
            await sleep(250);
            remove();
          } else if (a.action === 'type') {
            const remove = highlightEl(a.target);
            await sleep(400);
            await agent.type(a.target, a.text);
            remove();
            await sleep(150);
          } else if (a.action === 'pressKey') {
            await agent.pressKey(a.key);
            await sleep(250);
          }
        } catch (stepErr) {
          console.warn('[Pixeer] step failed, continuing:', stepErr);
        }

        setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: 'done' } : s)));
        await sleep(80);
      }

      setPhase('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setPhase('error');
    }
  }, [input, apiKey, callerTransportRef]);

  function StepIcon({ status }: { status: StepStatus }) {
    if (status === 'done') return <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />;
    if (status === 'running') return <Loader2 className="w-3.5 h-3.5 text-accent animate-spin shrink-0" />;
    if (status === 'error') return <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    return <div className="w-3.5 h-3.5 rounded-full border-2 border-border shrink-0" />;
  }

  return (
    <>
      {/* Floating pill */}
      <AnimatePresence>
        {phase === 'idle' && (
          <motion.button
            key="pill"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            onClick={() => setPhase('open')}
            className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2.5 shadow-lg hover:opacity-90 transition-opacity font-body text-sm font-medium"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ask Pixeer
            <span className="text-[10px] opacity-50 font-mono ml-0.5">⌘K</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Backdrop + modal */}
      <AnimatePresence>
        {phase !== 'idle' && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
              onClick={() => ['open', 'done', 'error'].includes(phase) && reset()}
            />

            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="fixed bottom-5 right-5 z-50 w-full max-w-md bg-background rounded-2xl border border-border overflow-hidden font-body"
              style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Sparkles className="w-4 h-4 text-accent shrink-0" />
                <span className="text-sm font-semibold text-foreground flex-1">Ask Pixeer</span>
                <span className="text-[10px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded border border-border">⌘K</span>
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className={`p-1 rounded transition-colors ${showKey ? 'text-accent' : 'text-muted-foreground hover:text-foreground'}`}
                  aria-label="API key settings"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={reset}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close spotlight"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* API key panel */}
              <AnimatePresence>
                {showKey && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-secondary/40 border-b border-border">
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                        OpenRouter API key
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => saveKey(e.target.value)}
                          placeholder="sk-or-..."
                          className="flex-1 text-xs bg-background rounded-lg border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        {apiKey && <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />}
                      </div>
                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        Free key at{' '}
                        <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          openrouter.ai
                        </a>
                        {' '}· model: <code className="font-mono">google/gemma-3-27b-it</code>
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Body */}
              <div className="p-4">
                {/* Input */}
                {phase === 'open' && (
                  <form onSubmit={(e) => { e.preventDefault(); void run(); }}>
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-4 py-3 focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent transition-all">
                      <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="What would you like to do?"
                        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!input.trim()}
                        className="rounded-lg bg-accent text-accent-foreground p-1.5 disabled:opacity-30 transition-opacity shrink-0"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {!apiKey && (
                      <p className="mt-2.5 text-xs text-amber-600 flex items-center gap-1.5">
                        <span>⚙</span>
                        Add your OpenRouter key to use the AI — click the gear icon above.
                      </p>
                    )}

                    <div className="mt-4">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">
                        Try these
                      </p>
                      <div className="space-y-0.5">
                        {EXAMPLES.map((ex) => (
                          <button
                            key={ex}
                            type="button"
                            onClick={() => setInput(ex)}
                            className="w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors"
                          >
                            <span className="text-accent mr-1.5">→</span>
                            {ex}
                          </button>
                        ))}
                      </div>
                    </div>
                  </form>
                )}

                {/* Thinking */}
                {phase === 'thinking' && (
                  <div className="flex items-center gap-3 py-3">
                    <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
                    <div>
                      <p className="text-sm text-foreground">Thinking…</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Reading page context, calling Gemma</p>
                    </div>
                  </div>
                )}

                {/* Executing / done */}
                {(phase === 'executing' || phase === 'done') && (
                  <div>
                    <p className="text-xs text-muted-foreground italic mb-3 truncate">"{input}"</p>
                    <div className="space-y-2.5">
                      {steps.map((s, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <StepIcon status={s.status} />
                          <span
                            className={`text-sm leading-tight ${
                              s.status === 'done'
                                ? 'text-muted-foreground'
                                : s.status === 'running'
                                ? 'text-foreground font-medium'
                                : 'text-muted-foreground/50'
                            }`}
                          >
                            {s.action.description}
                            {s.status === 'running' && '…'}
                          </span>
                        </div>
                      ))}
                    </div>
                    {phase === 'done' && (
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-green-600">
                          <Check className="w-3.5 h-3.5" />
                          <span className="text-sm font-medium">Done!</span>
                        </div>
                        <button
                          onClick={reset}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Close
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Error */}
                {phase === 'error' && (
                  <div>
                    <div className="flex items-start gap-2.5 text-red-500 mb-4">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p className="text-sm">{errorMsg}</p>
                    </div>
                    <button
                      onClick={() => { setPhase('open'); setErrorMsg(''); }}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-border bg-secondary/30">
                <p className="text-[10px] text-muted-foreground text-center">
                  Powered by{' '}
                  <a
                    href="https://github.com/debowd/pixeer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground hover:underline"
                  >
                    Pixeer
                  </a>
                  {' '}·{' '}
                  <span className="font-mono">google/gemma-3-27b-it</span>
                  {' '}via OpenRouter
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
