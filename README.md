# Pixeer

[![CI](https://github.com/Heiscel/pixeer/actions/workflows/ci.yml/badge.svg)](https://github.com/Heiscel/pixeer/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/Heiscel/pixeer/branch/main/graph/badge.svg)](https://codecov.io/gh/Heiscel/pixeer)
[![npm](https://img.shields.io/npm/v/pixeer)](https://www.npmjs.com/package/pixeer)
[![License](https://img.shields.io/github/license/Heiscel/pixeer)](LICENSE)

**9KB in-browser AI agent runtime.** Give your AI agent eyes and hands inside the user's real browser tab — over any transport, with zero infrastructure.

> **Live demo →** [pixeer-examples/nexora-dashboard](https://github.com/Heiscel/pixeer-examples) — AI spotlight (⌘K) that controls a fintech dashboard using Gemma 3 via OpenRouter.

---

## The problem

Every major AI browser tool — Stagehand, Browser-Use, Playwright MCP, AgentQL — controls browsers **from the outside** via CDP or Playwright. They require headless browser infrastructure, cloud sessions, or Docker containers.

Pixeer runs **inside the page**. Drop it into your existing app and your agent gets live DOM context, interactive element discovery, click/type actions, and React state inspection — over any transport you already use. No headless browsers. No cloud sessions. No extensions.

| | Pixeer | Stagehand | Browser-Use | Playwright MCP | AgentQL |
|---|---|---|---|---|---|
| Runs inside the page | ✅ | ❌ | ❌ | ❌ | ❌ |
| Embeddable via npm | ✅ | ❌ | ❌ | ❌ | ❌ |
| Transport-agnostic | ✅ | ❌ | ❌ | ❌ | ❌ |
| React state inspection | ✅ | ❌ | ❌ | ❌ | ❌ |
| No infrastructure needed | ✅ | ❌ | ❌ | ❌ | ❌ |
| Bundle size | ~9KB | ~150MB+ | Python | ~150MB+ | Playwright + API |

---

## Install

```bash
npm install pixeer
# pnpm add pixeer  /  yarn add pixeer  /  bun add pixeer
```

---

## Quick start — Vercel AI SDK

The fastest way to wire Pixeer to an LLM is with `@pixeer/vercel-ai`:

```bash
npm install pixeer @pixeer/vercel-ai
```

```typescript
// In your app page (host side) — expose the bridge
import { createPixeerBridge, createPostMessageTransport } from 'pixeer';

const bridge = createPixeerBridge(createPostMessageTransport(), {
  enableScreenCapture: true,
});

// In your agent / server route (caller side)
import { PixeerAgent, createPostMessageCaller } from 'pixeer';
import { createPixeerTools } from '@pixeer/vercel-ai';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const agent = new PixeerAgent(createPostMessageCaller({ target: iframe.contentWindow }));
const tools = createPixeerTools(agent);

const { text } = await generateText({
  model: anthropic('claude-sonnet-4-6'),
  tools,
  prompt: 'Fill in the contact form with test@example.com and click Submit',
  maxSteps: 10,
});
```

Works with any Vercel AI SDK-compatible model — Claude, GPT-4o, Gemini, and via **OpenRouter** with a single line change:

```typescript
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
const model = createOpenRouter({ apiKey: 'sk-or-...' })('google/gemini-2.0-flash-001');
```

---

## React hooks

```bash
npm install pixeer @pixeer/react
```

```tsx
import { usePixeerBridge, usePixeerAgent, usePixeerAction } from '@pixeer/react';

// Host side — mount the bridge inside your app
function App() {
  const { ready } = usePixeerBridge({ enableScreenCapture: true });
  return <div data-pixeer-ready={ready}><YourApp /></div>;
}

// Agent side — connect and run tasks
function AgentPanel() {
  const { agent, ready } = usePixeerAgent({ transport: 'postmessage' });

  const { run, loading, result } = usePixeerAction(agent, async (a) => {
    const { context } = await a.getContext();
    // send context to your LLM, return the answer
    return context;
  });

  return (
    <button disabled={!ready || loading} onClick={run}>
      {loading ? 'Working…' : 'Run agent'}
    </button>
  );
}
```

---

## Transports

Pixeer is transport-agnostic. Pick the one that fits your architecture:

### postMessage — cross-window / iframe

```typescript
import { createPixeerBridge, createPostMessageTransport } from 'pixeer';
import { PixeerAgent, createPostMessageCaller } from 'pixeer';

// Host side (inside the iframe or target page)
const bridge = createPixeerBridge(
  createPostMessageTransport({ allowedOrigin: 'https://your-agent.com' })
);

// Agent side (parent window or popup)
const agent = new PixeerAgent(
  createPostMessageCaller({ target: iframe.contentWindow })
);
```

### BroadcastChannel — same-origin tabs / workers

```typescript
import { createPixeerBridge, createBroadcastTransport } from 'pixeer';
import { PixeerAgent, createBroadcastCaller } from 'pixeer';

// Host side (any tab on the same origin)
const bridge = createPixeerBridge(
  createBroadcastTransport({ channel: 'my-agent' })
);

// Agent side (another tab, a SharedWorker, or a ServiceWorker)
const agent = new PixeerAgent(
  createBroadcastCaller({ channel: 'my-agent' })
);
```

### WebSocket — server-side agent

```typescript
import { createPixeerBridge, createWebSocketTransport } from 'pixeer';
import { PixeerAgent, createWebSocketCaller } from 'pixeer';

// Host side (browser page)
const bridge = createPixeerBridge(
  createWebSocketTransport({ url: 'wss://your-server.com/pixeer' })
);

// Agent side (Node.js / server)
const agent = new PixeerAgent(
  createWebSocketCaller({ url: 'wss://your-server.com/pixeer' })
);
```

### Multi-tab with @pixeer/server

For dynamic tab discovery across multiple tabs, add the optional server addon:

```bash
npm install @pixeer/server   # Node.js / Bun — not required for single-tab use
```

```typescript
// server.ts
import { createWebSocketServer } from '@pixeer/server';
const server = await createWebSocketServer({ port: 4242 });

// In each browser tab
import { createPixeerServerTransport } from 'pixeer';
const bridge = createPixeerBridge(
  await createPixeerServerTransport({ url: 'ws://localhost:4242' })
);

// Agent
const tabs = await server.listTabs();
const tab = server.findTab({ url: /dashboard/ });
```

### Bring your own

Any transport works — just implement two methods:

```typescript
import { createPixeerBridge, type PixeerTransport } from 'pixeer';

const transport: PixeerTransport = {
  onMethod(method, handler) {
    mySocket.on(method, async (payload) => {
      const result = await handler(payload);
      mySocket.emit(`${method}:response`, result);
    });
  },
  // Optional — enables dom.subscribe push notifications
  notify(method, payload) {
    mySocket.emit(method, payload);
  },
  dispose() { /* clean up */ },
};

const bridge = createPixeerBridge(transport);
```

---

## WebMCP

Pixeer auto-registers as a **WebMCP producer** when `navigator.modelContext` is available (Chrome 146+ polyfill, Chrome 151+ stable estimated):

```typescript
import { createWebMCPBridge } from 'pixeer';

const bridge = await createWebMCPBridge({
  exclude: ['pixeer_capture_screen'], // optional — skip tools you don't need
});

if (bridge.supported) {
  console.log('Registered tools:', bridge.registeredTools);
}

// Later:
await bridge.dispose();
```

Falls back gracefully — `bridge.supported` is `false` if the browser doesn't support WebMCP yet, with no errors thrown.

---

## DOM delta streaming

Instead of re-snapshotting the full page after every action, use `dom.getDelta` to pull only what changed:

```typescript
const bridge = createPixeerBridge(transport, { enableMutationTracker: true });

// Agent side
const { deltas, needsFullSnapshot } = await agent.getDelta();

if (needsFullSnapshot) {
  // Too many mutations — re-run getContext()
  const { context } = await agent.getContext();
} else {
  // Process only what changed
  for (const delta of deltas) {
    // { type: 'added'|'removed'|'modified'|'text', ref: 'el_42', ... }
  }
}
```

Typically 10–20× smaller payloads than full snapshots for interactive flows.

---

## Other adapters

| Package | Framework | Install |
|---|---|---|
| `@pixeer/vercel-ai` | Vercel AI SDK | `npm i @pixeer/vercel-ai` |
| `@pixeer/mastra` | Mastra | `npm i @pixeer/mastra` |
| `@pixeer/langchain` | LangChain.js | `npm i @pixeer/langchain` |
| `@pixeer/transformers` | Transformers.js (local/WebGPU) | `npm i @pixeer/transformers` |
| `@pixeer/react` | React hooks | `npm i @pixeer/react` |
| `@pixeer/server` | Multi-tab server addon | `npm i @pixeer/server` |

### LangChain

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { createPixeerTools } from '@pixeer/langchain';

const llm = new ChatOpenAI({ modelName: 'gpt-4o' })
  .bindTools(createPixeerTools(agent));
```

### Mastra

```typescript
import { createPixeerTools } from '@pixeer/mastra';

const tools = createPixeerTools(agent);
// Pass tools to your Mastra agent
```

### Local model (Transformers.js / WebGPU)

```typescript
import { createPixeerRunner } from '@pixeer/transformers';

const runner = await createPixeerRunner({
  model: 'Qwen/Qwen2.5-0.5B-Instruct',
  device: 'webgpu',
  onStep: (step) => console.log(step),
});

const { answer } = await runner.run('Fill in the login form', agent);
```

---

## Analytics

Track every agent action — durations, success rates, error counts — with zero overhead when not used:

```typescript
import { createPixeerBridge, PixeerAnalytics } from 'pixeer';

const analytics = new PixeerAnalytics();
const bridge = createPixeerBridge(transport, { analytics });

analytics.on('action:success', (event) => {
  console.log(event.method, event.durationMs);
});

const stats = analytics.getStats();
// { successRate: 0.98, avgDurationMs: 42, methodCounts: { 'dom.click': 5 }, ... }
```

---

## API reference

### `createPixeerBridge(transport, options?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `enableScreenCapture` | `boolean` | `false` | Enable `screen.capture` RPC method |
| `captureQuality` | `number` | `0.8` | JPEG quality (0–1) |
| `analytics` | `PixeerAnalytics` | — | Attach an analytics instance |
| `transportName` | `string` | — | Label recorded in analytics/telemetry |
| `enableMutationTracker` | `boolean` | `false` | Enable `dom.getDelta` / `dom.subscribe` |
| `mutationTrackerOptions` | `MutationTrackerOptions` | — | Tracker threshold and debounce config |

### `PixeerAgent`

| Method | Returns | Description |
|---|---|---|
| `getContext()` | `Promise<{ context, elements }>` | Page markdown + interactive elements |
| `click(name)` | `Promise<boolean>` | Click by accessible name |
| `clickBySelector(selector)` | `Promise<boolean>` | Click by CSS selector |
| `type(name, text)` | `Promise<boolean>` | Type into input by accessible name |
| `typeBySelector(selector, text)` | `Promise<boolean>` | Type by CSS selector |
| `scroll(options)` | `Promise<boolean>` | Scroll page or element |
| `pressKey(key, options?)` | `Promise<boolean>` | Dispatch keyboard event |
| `getComponentState(name)` | `Promise<ComponentStateResult \| null>` | React component state |
| `capture()` | `Promise<string>` | Screenshot as base64 JPEG |
| `dispose()` | `void` | Tear down transport |

### `DomService` (direct access, no transport needed)

```typescript
import { DomService } from 'pixeer';

const markdown = await DomService.getPageContext();
const elements = await DomService.getInteractiveElements();
await DomService.clickByName('Submit');
await DomService.typeByName('Email', 'user@example.com');
const state = await DomService.getComponentState('MyComponent');
```

---

## Examples

→ **[pixeer-examples](https://github.com/Heiscel/pixeer-examples)** — real apps built with Pixeer across different stacks.

---

## License

MIT
