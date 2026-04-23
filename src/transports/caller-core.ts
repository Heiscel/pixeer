/** Shared pending-request machinery used by all caller transports. */

let _counter = 0;

export function generateRequestId(): string {
  return `px_${(++_counter).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export interface Pending {
  resolve: (result: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type PendingMap = Map<string, Pending>;

export function makePendingMap(): PendingMap {
  return new Map();
}

export function settle(pending: PendingMap, id: string, result: string): void {
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(id);
  p.resolve(result);
}

export function rejectAll(pending: PendingMap, reason: string): void {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
  }
  pending.clear();
}

export function enqueue(
  pending: PendingMap,
  id: string,
  timeoutMs: number,
  method: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(
        new Error(
          `[Pixeer] "${method}" timed out after ${timeoutMs}ms — is the bridge running on the target page?`,
        ),
      );
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
  });
}
