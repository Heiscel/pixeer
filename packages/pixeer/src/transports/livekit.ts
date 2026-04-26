/**
 * LiveKit transport adapter.
 *
 * If you're using LiveKit, this is the easiest way to connect Pixeer.
 * Just pass your connected Room and you're set — all RPC methods get
 * registered on the room automatically.
 *
 * Requires livekit-client >= 2.9.0 (uses room-level RPC registration).
 */

import type { Room, RpcInvocationData } from 'livekit-client';
import type { PixeerTransport } from '../types';

/**
 * Create a PixeerTransport backed by LiveKit RPC.
 * Pass your connected Room instance and Pixeer handles the rest.
 */
export function createLiveKitTransport(room: Room): PixeerTransport {
  const registeredMethods: string[] = [];

  return {
    onMethod(method: string, handler: (payload: string) => Promise<string>): void {
      registeredMethods.push(method);
      room.registerRpcMethod(
        method,
        async (data: RpcInvocationData) => {
          return handler(data.payload);
        },
      );
    },

    dispose(): void {
      for (const method of registeredMethods) {
        room.unregisterRpcMethod(method);
      }
      registeredMethods.length = 0;
    },
  };
}

