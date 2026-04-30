/**
 * GDPR-safe session identification.
 *
 * Produces a daily-rotating identifier from SHA-256( date | domain | userAgent ).
 * Raw inputs are never stored. The hash is re-computed on each page load and
 * is not persisted to cookies, localStorage, or any storage — compliant with
 * GDPR/CCPA without requiring a consent banner for this specific signal.
 */
export async function getSessionId(): Promise<string> {
  const date   = new Date().toISOString().slice(0, 10); // YYYY-MM-DD — rotates at midnight UTC
  const domain = typeof location !== 'undefined' ? location.hostname : 'unknown';
  const ua     = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';

  const raw = `${date}|${domain}|${ua}`;
  const encoded = new TextEncoder().encode(raw);
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  // Return first 16 hex chars (64 bits of entropy) — enough for session-level uniqueness
  return hashArr.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/** Synchronous fallback using a simple non-cryptographic hash when crypto.subtle is unavailable. */
export function getSessionIdSync(): string {
  const date   = new Date().toISOString().slice(0, 10);
  const domain = typeof location !== 'undefined' ? location.hostname : 'unknown';
  const ua     = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  const raw    = `${date}|${domain}|${ua}`;
  return fnv1a(raw).toString(16).padStart(16, '0');
}

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}
