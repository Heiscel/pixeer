# Pixeer — Technical Report

**Version:** 0.0.1  
**Author:** David Debow  
**License:** MIT  
**Date:** April 29, 2026

---

## Overview

**Pixeer** is a transport-agnostic, in-browser DOM understanding and screen capture library for AI agents. It runs **inside the browser page** — not from the outside like headless tools (Playwright, Stagehand, Browser-Use, AgentQL) — enabling AI agents to see and interact with web pages without external infrastructure, Chrome extensions, or cloud services.

The project has grown from a single library into a full monorepo with a core package, optional server addon, five AI framework adapters, React hooks, and a live demo app — all while keeping the core bundle at ~9 KB minified.

---

## Tech Stack

| Concern | Tool |
|---------|------|
| Language | TypeScript (ES2022) |
| Bundler | tsdown (Rolldown-based, replaces tsup — CJS + ESM output) |
| Monorepo | Turborepo + pnpm workspaces |
| Test runner | Vitest + happy-dom |
| CI | GitHub Actions (build, test, type-check on push/PR) |
| DOM-to-markdown | dom-to-semantic-markdown ^1.4.1 |
| Accessible names | dom-accessibility-api ^0.7.0 |
| React inspection | resq ^1.11.0 |
| Transport (optional) | livekit-client ^2.9.0 (peer dep) |

---

## Monorepo Structure

```
packages/
├── pixeer/          # Core library (published as `pixeer`)
├── server/          # Optional server addon (published as `@pixeer/server`)
├── react/           # React hooks (published as `@pixeer/react`)
├── vercel-ai/       # Vercel AI SDK adapter (published as `@pixeer/vercel-ai`)
├── mastra/          # Mastra adapter (published as `@pixeer/mastra`)
├── langchain/       # LangChain.js adapter (published as `@pixeer/langchain`)
├── transformers/    # Local model runner (published as `@pixeer/transformers`)
└── demo/            # Nexora fintech demo app (Vite + React + Tailwind)
```

---

## Core Package (`packages/pixeer`)

### Source files

```
src/
├── index.ts              # Public exports
├── types.ts              # Shared TypeScript interfaces
├── dom-service.ts        # Core DOM engine
├── bridge.ts             # RPC bridge dispatcher
├── agent.ts              # Agent-side typed client
├── screen-capture.ts     # Screen capture manager
├── analytics.ts          # Session analytics layer
├── mutation-tracker.ts   # DOM delta streaming (MutationObserver)
├── ref-map.ts            # Stable el_N element identifiers
├── webmcp-bridge.ts      # WebMCP producer (navigator.modelContext)
└── transports/
    ├── index.ts
    ├── livekit.ts              # LiveKit RPC adapter
    ├── postmessage.ts          # PostMessage host transport
    ├── postmessage-caller.ts   # PostMessage caller transport
    ├── broadcastchannel.ts     # BroadcastChannel host transport
    ├── broadcastchannel-caller.ts
    ├── websocket.ts            # WebSocket host transport
    ├── websocket-caller.ts
    ├── server.ts               # @pixeer/server registration transport
    └── caller-core.ts          # Shared caller logic
```

---

## Features

### 1. DOM Context (`dom-service.ts`)

**`DomService.getPageContext()`**  
Converts the page's HTML into semantic markdown optimized for LLM consumption via `dom-to-semantic-markdown`.

**`DomService.getInteractiveElements()`**  
Discovers all interactive elements and returns structured data:

- Accessible name (computed via ARIA standards)
- CSS selector (stable, fallback chain)
- Element type (button, link, input:text, select, etc.)
- Enabled/disabled state
- Metadata (placeholder, value, href, aria-label, aria-describedby)

Detects:
- Standard HTML: `<button>`, `<a>`, `<input>`, `<select>`, `<textarea>`
- ARIA roles: button, link, checkbox, radio, textbox, combobox, listbox, menuitem, tab, switch, slider
- Clickable divs/spans: via `onclick`, `tabindex`, React fiber onClick handlers, or `cursor:pointer` CSS

---

### 2. DOM Interaction (`dom-service.ts`)

#### Click
| Method | Description |
|--------|-------------|
| `click(selector)` | Click element by CSS selector |
| `clickByName(name)` | Click element by accessible name |

- Auto-scrolls element into view
- Dispatches `mousedown` → `mouseup` → `click` events

#### Type
| Method | Description |
|--------|-------------|
| `type(selector, text)` | Type into input by CSS selector |
| `typeByName(name, text)` | Type by accessible name |

- Clears existing value first
- Fires individual `keydown`/`keypress`/`keyup` per character + `input`/`change` events
- Compatible with React, Vue, and other framework event systems

#### Press Key
| Method | Description |
|--------|-------------|
| `pressKey(selector, key)` | Press a key on element by selector |
| `pressKeyByName(name, key)` | Press a key by accessible name |

Supported keys: `Enter`, `Escape`, `Tab`, `Backspace`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Space`. Enter also calls `requestSubmit()` on parent forms.

#### Scroll
| Method | Description |
|--------|-------------|
| `scroll(selector, direction, amount)` | Scroll element or page |
| `scrollByName(name, direction, amount)` | Scroll by accessible name |

Directions: `up`, `down`, `left`, `right` — smooth scroll behavior.

---

### 3. React Component Inspection (`dom-service.ts`)

**`DomService.getComponentState(componentName)`**  
Traverses the React fiber tree via `resq` to read live component props and state without mocking or instrumentation.

Returns:
```typescript
{ props: Record<string, unknown>, state: Record<string, unknown> | null }
```

---

### 4. Screen Capture (`screen-capture.ts`)

**`ScreenCapture` class**

- First call prompts user for screen-share permission (Screen Capture API)
- Subsequent captures reuse the same `MediaStream` — instant
- Renders frame to a hidden canvas element, exports as base64 JPEG
- Configurable quality: `0`–`1` (default `0.8`)
- `dispose()` stops the stream and removes all DOM elements

---

### 5. Transport-Agnostic RPC Bridge (`bridge.ts`)

**`createPixeerBridge(transport, options)`**

Registers RPC method handlers on any `PixeerTransport` implementation, wiring agent calls to the DOM engine.

#### RPC Methods

| Method | Input | Output | Purpose |
|--------|-------|--------|---------|
| `dom.getContext` | — | `{ context, elements }` | Page markdown + interactive elements |
| `dom.click` | `{ selector?, name? }` | `{ success, error? }` | Click element |
| `dom.type` | `{ selector?, name?, text }` | `{ success, error? }` | Type into element |
| `dom.pressKey` | `{ selector?, name?, key }` | `{ success, error? }` | Press keyboard key |
| `dom.scroll` | `{ selector?, name?, direction, amount? }` | `{ success, error? }` | Scroll element |
| `dom.getComponentState` | `{ componentName }` | `{ state?, error? }` | React props + state |
| `dom.getDelta` | — | `{ deltas, needsFullSnapshot }` | DOM mutation delta since last call |
| `dom.subscribe` | — | push notification | Subscribe to DOM delta stream |
| `screen.capture` | — | `{ image, error? }` | Base64 JPEG screenshot |

`screen.capture` is opt-in via `enableScreenCapture: true` in bridge options.

---

### 6. Agent-Side Client (`agent.ts`)

**`PixeerAgent`** — the typed agent-side API. Point it at any `PixeerCallerTransport` and get a fully-typed API over every bridge method.

```typescript
const agent = new PixeerAgent(createPostMessageCaller({ target: iframe.contentWindow }));

const { context, elements } = await agent.getContext();
await agent.click('Submit');
await agent.type('Email', 'user@example.com');
await agent.pressKey('Enter');
await agent.scroll({ direction: 'down', amount: 500 });
const state = await agent.getComponentState('LoginForm');
const image = await agent.capture(); // base64 JPEG
```

---

### 7. MutationTracker + RefMap (`mutation-tracker.ts`, `ref-map.ts`)

**`createMutationTracker(options?)`**

Single `MutationObserver` on `document.documentElement` that coalesces DOM changes into structured `DomDelta[]` events. Biggest token-efficiency win over Playwright MCP — send deltas instead of full page snapshots.

Features:
- **Pull API:** `getDelta()` returns accumulated deltas + resets the buffer
- **Push API:** `subscribe(handler)` fires on each debounced batch
- **Threshold:** when mutation count exceeds `threshold` (default 50), `needsFullSnapshot=true` signals the caller to re-run `dom.getContext` instead of accumulating
- **Debounce:** `debounceMs` (default 50ms) coalesces rapid mutations

**`RefMap`**

Assigns stable monotonic `el_1`, `el_2`, … IDs to DOM elements. Backed by `WeakMap` so elements GC naturally without memory leaks. Same architecture as Playwright MCP — LLMs trained to emit `ref=eN` work out of the box.

```typescript
interface DomDelta {
  type: 'added' | 'removed' | 'modified' | 'text';
  ref: string;       // el_1, el_2, …
  selector?: string;
  tag?: string;
  attribute?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}
```

---

### 8. Analytics Layer (`analytics.ts`)

**`PixeerAnalytics`**

Session-scoped event bus and statistics engine. Plugs into the bridge to record every action, its outcome, and timing.

Events: `bridge:init`, `bridge:dispose`, `action:start`, `action:success`, `action:error`, `snapshot:taken`

```typescript
const analytics = new PixeerAnalytics();
analytics.on('action:error', (event) => reportToSentry(event));

const stats = analytics.getStats();
// { totalActions, successRate, methodCounts, avgDurationMs, … }
```

---

### 9. WebMCP Bridge (`webmcp-bridge.ts`)

**`createWebMCPBridge(options?)`**

Registers Pixeer's DOM tools with `navigator.modelContext` — the WebMCP browser API landing in Chrome 146+ (polyfill) and Chrome 151+ (stable estimate). Pixeer auto-registers as a WebMCP producer; sites adopting Pixeer get WebMCP compliance for free.

Returns `supported: false` gracefully on unsupported browsers.

Tools registered: `pixeer_get_page_context`, `pixeer_click`, `pixeer_click_by_selector`, `pixeer_type`, `pixeer_type_by_selector`, `pixeer_scroll`, `pixeer_press_key`, `pixeer_get_component_state`

```typescript
const bridge = await createWebMCPBridge({ exclude: ['pixeer_capture_screen'] });
if (bridge.supported) {
  console.log('Registered:', bridge.registeredTools);
}
await bridge.dispose();
```

---

### 10. Transports

#### Host transports (go in the app page, used with `createPixeerBridge`)

| Transport | Function | Use case |
|-----------|----------|----------|
| LiveKit | `createLiveKitTransport` | Real-time voice + agent sessions |
| PostMessage | `createPostMessageTransport` | iframe ↔ parent window |
| BroadcastChannel | `createBroadcastTransport` | Same-origin cross-tab |
| WebSocket | `createWebSocketTransport` | Agent on Node.js/Python server |
| @pixeer/server | `createPixeerServerTransport` | Multi-tab server routing |

#### Caller transports (go in the agent, used with `PixeerAgent`)

| Transport | Function |
|-----------|----------|
| PostMessage | `createPostMessageCaller` |
| BroadcastChannel | `createBroadcastCaller` |
| WebSocket | `createWebSocketCaller` |

---

## Server Package (`packages/server` → `@pixeer/server`)

Optional Node.js/Bun server addon for dynamic tab discovery and routing across multiple browser tabs. Tabs auto-register with the server; agents query and route RPC calls without hardcoding channel names.

```typescript
// Node.js / Bun
import { createWebSocketServer } from '@pixeer/server';
const server = await createWebSocketServer({ port: 4242 });

// Browser (in each tab)
const transport = createPixeerServerTransport({ url: 'ws://localhost:4242' });
createPixeerBridge(transport);
```

### Wire protocol

```
Tab → Server     register, update, event, rpc:result
Agent → Server   register:agent, list, query, list:agents, rpc, rpc:broadcast
Server → Tab     registered, rpc:call
Server → Agent   registered:agent, list:result, query:result, rpc:result,
                 rpc:broadcast:result, tab:connect, tab:disconnect, tab:update, tab:event
```

### Server API

```typescript
server.listTabs()          // → TabMeta[]
server.findTab({ url })    // → TabMeta | undefined
server.listAgents()        // → AgentMeta[]
server.close()
```

Features: 30s RPC timeout, broadcast RPC across multiple tabs, push `tab:connect` / `tab:disconnect` events to all connected agents, authentication hook.

---

## AI Framework Adapters

All adapters wrap `PixeerAgent` and expose the same 8 tools with framework-native conventions.

### `@pixeer/vercel-ai`

```typescript
import { createPixeerTools } from '@pixeer/vercel-ai';
const tools = createPixeerTools(agent, { exclude: ['capture_screen'] });
// Pass `tools` to Vercel AI SDK's generateText / streamText
```

Uses `tool()` from `ai` + Zod schemas. TypeScript infers the full return type.

### `@pixeer/mastra`

```typescript
import { createPixeerTools } from '@pixeer/mastra';
const tools = createPixeerTools(agent);
// Pass to Mastra agent definition
```

Uses `createTool` from `@mastra/core/tools` with `inputSchema` + `execute({ context })` pattern.

### `@pixeer/langchain`

```typescript
import { createPixeerTools } from '@pixeer/langchain';
const tools = createPixeerTools(agent);
// Pass DynamicStructuredTool[] to LangChain agent
```

Returns JSON strings from every tool (LangChain convention). Built-in error serialization.

### `@pixeer/transformers`

Local model runner for Transformers.js v3 (WebGPU). Runs a full task → tool call → result agentic loop entirely in-browser without any API calls.

```typescript
import { createPixeerRunner } from '@pixeer/transformers';
const runner = await createPixeerRunner({ agent, model: 'Qwen/Qwen2.5-0.5B-Instruct' });
await runner.run('Click the submit button and confirm the form submits', {
  maxSteps: 10,
  onStep: (step) => console.log(step),
});
```

Default model: `Qwen/Qwen2.5-0.5B-Instruct` on WebGPU. Uses raw JSON Schema tool definitions (no Zod, framework-agnostic). Supports `onStep` streaming callbacks and lifecycle hooks.

---

## React Hooks (`@pixeer/react`)

```typescript
import { usePixeerBridge, usePixeerAgent, usePixeerAction } from '@pixeer/react';

// Host side — mount the bridge in your app
function App() {
  const { ready } = usePixeerBridge({ enableScreenCapture: true });
  return <div data-pixeer-ready={ready}>{...}</div>;
}

// Agent side — connect in your AI panel
function AgentPanel() {
  const { agent, ready } = usePixeerAgent({ transport: 'postmessage' });
  const { run, loading, result } = usePixeerAction(agent, async (a) => {
    const { context } = await a.getContext();
    return context;
  });
  return <button disabled={!ready || loading} onClick={run}>Snapshot</button>;
}
```

Hooks: `usePixeerBridge`, `usePixeerAgent`, `usePixeerAction`. Auto-dispose on unmount. Supports all three caller transports (postMessage, BroadcastChannel, WebSocket).

---

## Demo App (`packages/demo`)

**Nexora** — a fintech dashboard demo that showcases Pixeer's capabilities:

- Landing page with animated hero + dashboard preview
- Login flow (saves name to localStorage)
- Full dashboard: Home stats, Tasks CRUD, sidebar nav
- **⌘K Spotlight agent** — modal powered by OpenRouter (Gemma 3) that controls the live DOM, with visual step tracking showing each action as it executes
- `createInMemoryTransportPair()` — zero-latency in-process transport for demos (no server needed)
- Imports `pixeer` from the workspace — always in sync with core
- TypeScript clean, `vite build` passes (390KB / 121KB gzip)

---

## CSS Selector Strategy

Stable selector generation uses a priority fallback chain:

1. `#id`
2. `[data-testid="..."]`
3. `[data-test="..."]`
4. `[data-cy="..."]`
5. `[aria-label="..."]`
6. `[name="..."]`
7. Compound ancestor-anchored path selector

Values are escaped with `CSS.escape()` for safety.

---

## Data Types

```typescript
interface InteractiveElement {
  name: string;                         // Accessible name
  selector: string;                     // CSS selector
  type: string;                         // "button", "input:text", "link", etc.
  enabled: boolean;
  metadata?: Record<string, string>;    // placeholder, value, href, etc.
}

interface DomDelta {
  type: 'added' | 'removed' | 'modified' | 'text';
  ref: string;                          // el_1, el_2, …
  selector?: string;
  tag?: string;
  attribute?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}

interface PixeerTransport {
  onMethod(method: string, handler: (payload: string) => Promise<string>): void;
  dispose(): void;
}

interface PixeerCallerTransport {
  call(method: string, payload: unknown): Promise<string>;
  dispose(): void;
}

interface PixeerBridgeOptions {
  enableScreenCapture?: boolean;
  captureQuality?: number;              // 0–1, default 0.8
}
```

---

## SSR Safety

All browser API calls are guarded with `isBrowser` / `typeof document` checks. Every package can be safely imported in Node.js/SSR environments without runtime errors.

---

## Tests

9 test files, ~379 test cases across the core package. CI runs on every push and PR.

| File | Cases | Coverage |
|------|-------|----------|
| `dom-service.test.ts` | 101 | Element discovery, click, type, scroll, pressKey, React inspection |
| `agent.test.ts` | 46 | PixeerAgent RPC — all methods, error paths |
| `analytics.test.ts` | 43 | Event emission, stats calculation, flush, clear |
| `caller-transports.test.ts` | 42 | Caller transport core — call, timeout, dispose |
| `bridge.test.ts` | 40 | All RPC methods, error handling, screen capture opt-in |
| `mutation-tracker.test.ts` | 45 | RefMap, MutationTracker pull/push, threshold, debounce |
| `transport-postmessage.test.ts` | 21 | PostMessage host + caller |
| `transport-broadcastchannel.test.ts` | 20 | BroadcastChannel host + caller |
| `transport-websocket.test.ts` | 21 | WebSocket host + caller |

Test environment: `happy-dom` (lightweight in-process DOM, no real browser required).

---

## Build & Scripts

```bash
# Workspace root
pnpm build          # Build all packages (Turborepo)
pnpm test           # Run all tests
pnpm type-check     # TypeScript type check across all packages
pnpm dev            # Watch mode for all packages

# Per-package (packages/pixeer, packages/server, etc.)
pnpm build          # tsdown — CJS + ESM + .d.ts
pnpm test           # vitest
pnpm test:coverage  # vitest --coverage
pnpm type-check     # tsc --noEmit
pnpm clean          # Remove dist/ and .turbo/
```

---

## Package Entrypoints

All packages share the same entrypoint shape:

```json
{
  "main":   "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types":  "./dist/index.d.ts",
  "exports": {
    ".": { "types": "...", "import": "...", "require": "..." }
  }
}
```

LiveKit and framework peer dependencies are externalized from all bundles.

---

## Comparison to Alternatives

| Tool | Where it runs | Infrastructure needed | Bundle |
|------|--------------|----------------------|--------|
| **Pixeer** | Inside the page (client-side) | None | ~9 KB |
| Playwright MCP | External browser automation | Node.js server | — |
| Stagehand | External browser automation | Node.js server | — |
| Browser-Use | External browser automation | Python server | — |
| AgentQL | External browser automation | Cloud API | — |
| MCP-B / WebMCP polyfill | In-page + extension | Tab / iframe / ext | 285 KB |

---

## Unique Capabilities

These are structurally impossible for headless competitors:

1. **Authenticated session automation** — real cookies, passkeys, hardware MFA, SSO chains, device trust. Headless tools on cloud IPs get blocked by Cloudflare/DataDome.
2. **Privacy-preserving agents** — DOM never leaves the browser; only LLM-derived intent reaches the model. Required for GDPR/HIPAA/data-residency regulated verticals.
3. **Mobile browsers** — Pixeer runs on iOS Safari and Android Chrome as a `<script>` tag. Playwright/Puppeteer cannot run on a user's phone.
4. **Multi-tab coordination** — research agents that synthesize across 10 open tabs; form-fill across multi-tab checkouts. Headless tools' synthetic tabs cannot observe what the user has open.
5. **Embedded AI copilots** — ship an in-app agent to existing users without rebuilding infrastructure. LiveKit handles real-time voice; Pixeer handles DOM.
6. **WebMCP producer** — auto-registers with `navigator.modelContext` (Chrome 146+). Sites adopting Pixeer get WebMCP compliance for free, with no migration cost when the standard ships stable.

---

## Roadmap Status

| Phase | Status |
|-------|--------|
| Core DOM engine + bridge | ✅ Done |
| PostMessage / BroadcastChannel / WebSocket transports | ✅ Done |
| Monorepo (Turborepo + pnpm) | ✅ Done |
| `@pixeer/server` multi-tab addon | ✅ Done |
| `PixeerAgent` typed client | ✅ Done |
| `PixeerAnalytics` session layer | ✅ Done |
| `MutationTracker` + `RefMap` delta streaming | ✅ Done |
| `createWebMCPBridge` WebMCP producer | ✅ Done |
| `@pixeer/vercel-ai` adapter | ✅ Done |
| `@pixeer/mastra` adapter | ✅ Done |
| `@pixeer/langchain` adapter | ✅ Done |
| `@pixeer/transformers` local model runner | ✅ Done |
| `@pixeer/react` hooks | ✅ Done |
| Nexora demo app (⌘K spotlight) | ✅ Done |
| GitHub Actions CI | ✅ Done |
| Playground hosted at public URL | Pending |
| Demo GIF in README | Pending |
| HN launch | Pending |
| Benchmark paper (ARWT) | Pending |
| Docs site (Fumadocs) | Pending |
