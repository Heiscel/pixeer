/**
 * An interactive element your agent can see on the page.
 */
export interface InteractiveElement {
  /** The accessible name your agent can use to refer to this element */
  name: string;
  /** CSS selector you can pass to click() or type() to target this element */
  selector: string;
  /** What kind of element this is (button, link, input, etc.) */
  type: string;
  /** Whether the user can currently interact with this element */
  enabled: boolean;
  /** Extra details like input type, placeholder, href, etc. */
  metadata?: Record<string, string>;
}

/**
 * What you get back when you inspect a React component's state.
 */
export interface ComponentStateResult {
  props: Record<string, unknown>;
  state: Record<string, unknown> | null;
}

/**
 * Implement this interface to connect Pixeer to your transport.
 *
 * Whether you're using WebSocket, postMessage, LiveKit, or something else entirely,
 * just wire up `onMethod` so your agent's calls reach the right handler.
 */
export interface PixeerTransport {
  /** Register a handler that your agent can call by method name */
  onMethod(method: string, handler: (payload: string) => Promise<string>): void;
  /**
   * Push an unsolicited notification to the caller.
   * Optional — only transports that support server-initiated messages need to implement this.
   * Required for `dom.subscribe` delta streaming to work.
   */
  notify?: (method: string, payload: string) => void;
  /** Clean up when you're done — unregister all handlers */
  dispose(): void;
}

/**
 * Options you can pass to createPixeerBridge.
 */
export interface PixeerBridgeOptions {
  /** Set to true if you want your agent to be able to capture the screen (default: false) */
  enableScreenCapture?: boolean;
  /** JPEG quality for screen captures, 0-1 (default: 0.8) */
  captureQuality?: number;
  /** Pass a PixeerAnalytics instance to collect action events, stats, and hooks */
  analytics?: import('./analytics').PixeerAnalytics;
  /** Transport name — recorded in telemetry and analytics events (e.g. 'livekit', 'postmessage') */
  transportName?: string;
  /**
   * Enable DOM mutation tracking — exposes dom.getDelta and dom.subscribe RPC methods.
   * Agents can pull deltas instead of re-snapshotting the full page after every action.
   * @default false
   */
  enableMutationTracker?: boolean;
  /** Options forwarded to the MutationTracker (threshold, debounceMs). */
  mutationTrackerOptions?: import('./mutation-tracker').MutationTrackerOptions;
}

/**
 * The bridge handle you get back from createPixeerBridge.
 * Call dispose() when you're done to clean everything up.
 */
export interface PixeerBridge {
  /** Tear down all handlers and release resources */
  dispose(): void;
  /** The analytics instance attached to this bridge, if any */
  analytics?: import('./analytics').PixeerAnalytics;
}

/** Direction for scrolling */
export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

/**
 * The caller-side transport interface — implement this to connect PixeerAgent
 * to any messaging layer (postMessage, BroadcastChannel, WebSocket, etc.).
 */
export interface PixeerCallerTransport {
  /** Send a method call and await the response payload string. */
  call(method: string, payload: unknown): Promise<string>;
  /** Tear down listeners and reject any in-flight calls. */
  dispose(): void;
}
