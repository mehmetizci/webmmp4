export interface BrowserCapabilities { secureContext: boolean; webCodecs: boolean; wakeLock: boolean; }
export function getBrowserCapabilities(): BrowserCapabilities {
  return { secureContext: globalThis.isSecureContext, webCodecs: typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined' && typeof VideoFrame !== 'undefined', wakeLock: typeof navigator !== 'undefined' && 'wakeLock' in navigator };
}
