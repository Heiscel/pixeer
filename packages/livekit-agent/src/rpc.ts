import type { LiveKitRoom, LiveKitParticipant, RpcCaller } from './types.js';

/**
 * Find the browser participant's identity in a LiveKit room.
 *
 * Resolution order:
 * 1. `custom` callback (if provided)
 * 2. First remote participant whose metadata contains `{ "type": "pixeer-browser" }`
 * 3. First remote participant (fallback)
 *
 * Set `{ "type": "pixeer-browser" }` in your browser participant's metadata when
 * connecting to make resolution deterministic in multi-participant rooms.
 */
export function resolveBrowserIdentity(
  room: LiveKitRoom,
  custom?: (participants: Map<string, LiveKitParticipant>) => string | undefined,
): string {
  if (custom) {
    const identity = custom(room.remoteParticipants);
    if (identity) return identity;
  }

  for (const participant of room.remoteParticipants.values()) {
    try {
      const meta: Record<string, unknown> = participant.metadata
        ? JSON.parse(participant.metadata)
        : {};
      if (meta['type'] === 'pixeer-browser') return participant.identity;
    } catch {
      // malformed metadata — skip
    }
  }

  const first = room.remoteParticipants.values().next();
  if (!first.done) return first.value.identity;

  throw new Error(
    '[pixeer/livekit-agent] No browser participant found in room. ' +
    'Ensure the browser tab joins the LiveKit room before the agent entry runs.',
  );
}

/**
 * Create a typed RPC caller that calls Pixeer bridge methods on the browser tab.
 *
 * Params are JSON-serialised as the RPC payload; the response is JSON-parsed.
 * If the response is not valid JSON it is returned as a plain string.
 */
export function createRpcCaller(room: LiveKitRoom, browserIdentity: string): RpcCaller {
  return async (method: string, params?: unknown): Promise<unknown> => {
    const payload = JSON.stringify(params ?? {});
    const raw = await room.localParticipant.performRpc({
      destinationIdentity: browserIdentity,
      method,
      payload,
    });
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };
}
