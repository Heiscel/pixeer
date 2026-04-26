import { useEffect, useRef, useCallback, useState } from 'react';
import {
  createPixeerBridge,
  createPostMessageTransport,
  createBroadcastTransport,
  createPostMessageCaller,
  createBroadcastCaller,
  createWebSocketCaller,
  PixeerAgent,
} from 'pixeer';
import type {
  PixeerBridge,
  PixeerBridgeOptions,
  PixeerCallerTransport,
  PostMessageTransportOptions,
  BroadcastTransportOptions,
  PostMessageCallerOptions,
  BroadcastCallerOptions,
  WebSocketCallerOptions,
} from 'pixeer';

// ---------------------------------------------------------------------------
// usePixeerBridge — host side
// ---------------------------------------------------------------------------

export type BridgeTransportType = 'postmessage' | 'broadcast';

export interface UsePixeerBridgeOptions extends Omit<PixeerBridgeOptions, never> {
  /** Which built-in transport to use. Default: 'postmessage'. */
  transport?: BridgeTransportType;
  /** Options forwarded to the postMessage transport (when transport='postmessage'). */
  postMessageOptions?: PostMessageTransportOptions;
  /** Options forwarded to the BroadcastChannel transport (when transport='broadcast'). */
  broadcastOptions?: BroadcastTransportOptions;
}

export interface UsePixeerBridgeResult {
  /** The bridge instance — null until mounted. */
  bridge: PixeerBridge | null;
  /** True while the bridge is active. */
  ready: boolean;
}

/**
 * Mount a Pixeer bridge inside your app component.
 * Automatically creates the transport and bridge on mount, disposes on unmount.
 *
 * @example
 * // In your React app (host side):
 * function App() {
 *   const { ready } = usePixeerBridge({ enableScreenCapture: true });
 *   return <div data-pixeer-ready={ready}>{...}</div>;
 * }
 */
export function usePixeerBridge(options: UsePixeerBridgeOptions = {}): UsePixeerBridgeResult {
  const {
    transport: transportType = 'postmessage',
    postMessageOptions,
    broadcastOptions,
    ...bridgeOptions
  } = options;

  const bridgeRef = useRef<PixeerBridge | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const transport =
      transportType === 'broadcast'
        ? createBroadcastTransport(broadcastOptions)
        : createPostMessageTransport(postMessageOptions);

    const bridge = createPixeerBridge(transport, bridgeOptions);
    bridgeRef.current = bridge;
    setReady(true);

    return () => {
      bridge.dispose();
      bridgeRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { bridge: bridgeRef.current, ready };
}

// ---------------------------------------------------------------------------
// usePixeerAgent — agent side
// ---------------------------------------------------------------------------

export type AgentTransportType = 'postmessage' | 'broadcast' | 'websocket';

export interface UsePixeerAgentOptions {
  /** Which built-in caller transport to use. Default: 'postmessage'. */
  transport?: AgentTransportType;
  postMessageOptions?: PostMessageCallerOptions;
  broadcastOptions?: BroadcastCallerOptions;
  webSocketOptions?: WebSocketCallerOptions;
}

export interface UsePixeerAgentResult {
  /** The agent instance — null until mounted. */
  agent: PixeerAgent | null;
  /** True while the agent is connected. */
  ready: boolean;
}

/**
 * Create a Pixeer agent in your AI component.
 * Automatically connects on mount, disposes on unmount.
 *
 * @example
 * // In your agent/chat component:
 * function AgentPanel() {
 *   const { agent, ready } = usePixeerAgent({ transport: 'postmessage' });
 *
 *   const handleTask = useCallback(async () => {
 *     if (!agent) return;
 *     const { context } = await agent.getContext();
 *     // send context to your LLM, run action loop ...
 *   }, [agent]);
 *
 *   return <button disabled={!ready} onClick={handleTask}>Run agent</button>;
 * }
 */
export function usePixeerAgent(options: UsePixeerAgentOptions = {}): UsePixeerAgentResult {
  const {
    transport: transportType = 'postmessage',
    postMessageOptions,
    broadcastOptions,
    webSocketOptions,
  } = options;

  const agentRef = useRef<PixeerAgent | null>(null);
  const transportRef = useRef<PixeerCallerTransport | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let callerTransport: PixeerCallerTransport;

    if (transportType === 'broadcast') {
      callerTransport = createBroadcastCaller(broadcastOptions ?? {});
    } else if (transportType === 'websocket') {
      if (!webSocketOptions) {
        console.error('[Pixeer] usePixeerAgent: webSocketOptions (with a socket) is required for websocket transport');
        return;
      }
      callerTransport = createWebSocketCaller(webSocketOptions);
    } else {
      if (!postMessageOptions) {
        console.error('[Pixeer] usePixeerAgent: postMessageOptions (with a target window) is required for postmessage transport');
        return;
      }
      callerTransport = createPostMessageCaller(postMessageOptions);
    }

    transportRef.current = callerTransport;
    agentRef.current = new PixeerAgent(callerTransport);
    setReady(true);

    return () => {
      callerTransport.dispose();
      agentRef.current = null;
      transportRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { agent: agentRef.current, ready };
}

// ---------------------------------------------------------------------------
// usePixeerAction — convenience wrapper for running a single agent task
// ---------------------------------------------------------------------------

export interface UsePixeerActionResult<T> {
  /** Run the action. Safe to call before agent is ready — returns null. */
  run: () => Promise<T | null>;
  /** True while the action is executing. */
  loading: boolean;
  /** Last error thrown, if any. */
  error: Error | null;
  /** Result of the last successful run. */
  result: T | null;
}

/**
 * Run a one-shot agent action with loading/error state.
 *
 * @example
 * const { run, loading, result } = usePixeerAction(agent, async (a) => {
 *   const { context } = await a.getContext();
 *   return context;
 * });
 */
export function usePixeerAction<T>(
  agent: PixeerAgent | null,
  action: (agent: PixeerAgent) => Promise<T>,
): UsePixeerActionResult<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<T | null>(null);

  const run = useCallback(async (): Promise<T | null> => {
    if (!agent) return null;
    setLoading(true);
    setError(null);
    try {
      const value = await action(agent);
      setResult(value);
      return value;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      return null;
    } finally {
      setLoading(false);
    }
  }, [agent, action]);

  return { run, loading, error, result };
}
