# Pixeer — Technical Report

**Version:** 0.0.1  
**Author:** David Debow  
**License:** MIT  
**Date:** April 23, 2026

---

## Overview

**Pixeer** is a transport-agnostic DOM understanding and screen capture library for AI agents (~9 KB minified). It runs **inside the browser page** — not from the outside like headless browser tools (Playwright, Stagehand, Browser-Use, AgentQL) — enabling AI agents to "see" and interact with web pages without external infrastructure, Chrome extensions, or cloud services.

---

## Tech Stack

| Concern | Tool |
|---------|------|
| Language | TypeScript (ES2022) |
| Bundler | tsup (CJS + ESM output) |
| Test runner | Vitest + happy-dom |
| DOM-to-markdown | dom-to-semantic-markdown ^1.4.1 |
| Accessible names | dom-accessibility-api ^0.7.0 |
| React inspection | resq ^1.11.0 |
| Transport (optional) | livekit-client ^2.9.0 (peer dep) |

---

## Project Structure

```
pixeer/
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # Shared TypeScript interfaces
│   ├── dom-service.ts        # Core DOM engine (875 lines)
│   ├── bridge.ts             # RPC bridge (240 lines)
│   ├── screen-capture.ts     # Screen capture manager (103 lines)
│   └── transports/
│       ├── index.ts
│       └── livekit.ts        # LiveKit RPC adapter
├── src/__tests__/
│   ├── dom-service.test.ts   # 252 lines of DOM tests
│   └── bridge.test.ts        # 109 lines of bridge tests
├── dist/                     # Built output (CJS, ESM, .d.ts)
├── tsup.config.ts
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

---

## Features

### 1. DOM Context (`dom-service.ts`)

**`DomService.getPageContext()`**  
Converts the current page's HTML into semantic markdown optimized for LLM consumption via `dom-to-semantic-markdown`.

**`DomService.getInteractiveElements()`**  
Discovers all interactive elements on the page and returns structured data for each:

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

Supported keys: `Enter`, `Escape`, `Tab`, `Backspace`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Space`

Enter key also calls `requestSubmit()` (with `submit()` fallback) on parent forms.

#### Scroll
| Method | Description |
|--------|-------------|
| `scroll(selector, direction, amount)` | Scroll element or page by selector |
| `scrollByName(name, direction, amount)` | Scroll by accessible name |

Directions: `up`, `down`, `left`, `right` — uses smooth scroll behavior.

---

### 3. React Component Inspection (`dom-service.ts`)

**`DomService.getComponentState(componentName)`**

Traverses the React fiber tree via the `resq` library to read live component props and state without mocking or instrumentation.

Returns:
```typescript
{
  props: Record<string, unknown>,
  state: Record<string, unknown> | null
}
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

The central integration point. Registers RPC method handlers on any `PixeerTransport` implementation, wiring agent calls to the DOM engine.

#### RPC Methods

| Method | Input | Output | Purpose |
|--------|-------|--------|---------|
| `dom.getContext` | *(none)* | `{ context, elements }` | Page markdown + interactive elements |
| `dom.click` | `{ selector?, name? }` | `{ success, error? }` | Click element |
| `dom.type` | `{ selector?, name?, text }` | `{ success, error? }` | Type into element |
| `dom.pressKey` | `{ selector?, name?, key }` | `{ success, error? }` | Press keyboard key |
| `dom.scroll` | `{ selector?, name?, direction, amount? }` | `{ success, error? }` | Scroll element |
| `dom.getComponentState` | `{ componentName }` | `{ state?, error? }` | React props + state |
| `screen.capture` | *(none)* | `{ image, error? }` | Base64 JPEG screenshot |

`screen.capture` is opt-in via `enableScreenCapture: true` in bridge options.

#### Bridge Options
```typescript
{
  enableScreenCapture?: boolean;   // default: false
  captureQuality?: number;         // 0–1, default: 0.8
}
```

---

### 6. LiveKit Transport (`transports/livekit.ts`)

A concrete `PixeerTransport` implementation backed by LiveKit's RPC system. Registers each method on a LiveKit `Room` object, allowing AI agents to call DOM methods over a LiveKit data channel.

---

## Data Types

```typescript
interface InteractiveElement {
  name: string;                         // Accessible name
  selector: string;                     // CSS selector
  type: string;                         // e.g. "button", "input:text", "link"
  enabled: boolean;
  metadata?: Record<string, string>;    // placeholder, value, href, etc.
}

interface ComponentStateResult {
  props: Record<string, unknown>;
  state: Record<string, unknown> | null;
}

interface PixeerTransport {
  onMethod(method: string, handler: (payload: string) => Promise<string>): void;
  dispose(): void;
}

interface PixeerBridgeOptions {
  enableScreenCapture?: boolean;
  captureQuality?: number;
}
```

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

## SSR Safety

All browser API calls are guarded with an `isBrowser` check. The package can be safely imported in Node.js/SSR environments without runtime errors.

---

## Build & Scripts

```bash
pnpm dev           # Watch mode (development)
pnpm build         # Production bundle (CJS + ESM + .d.ts)
pnpm build:prod    # Same with NODE_ENV=production
pnpm test          # Run all tests with Vitest
pnpm type-check    # TypeScript type check (no emit)
pnpm clean         # Remove dist/ and .turbo/
```

**Output** (`dist/`):
- `index.cjs` — CommonJS bundle
- `index.mjs` — ESM bundle
- `index.d.ts` — TypeScript declarations

LiveKit is excluded from the bundle (external peer dependency).

---

## Package Entrypoints

```json
{
  "main":   "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types":  "./dist/index.d.ts"
}
```

---

## Comparison to Alternatives

| Tool | Where it runs | Infrastructure needed |
|------|--------------|----------------------|
| **Pixeer** | Inside the page (client-side) | None |
| Playwright MCP | External browser automation | Node.js server |
| Stagehand | External browser automation | Node.js server |
| Browser-Use | External browser automation | Python server |
| AgentQL | External browser automation | Cloud API |

---

## Tests

| File | Coverage |
|------|---------|
| `dom-service.test.ts` | Element discovery, click, type, scroll, pressKey, React inspection |
| `bridge.test.ts` | All RPC methods, error handling, screen capture opt-in |

Test environment: `happy-dom` (lightweight in-process DOM, no real browser required).
