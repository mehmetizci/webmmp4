'use client';

import { useCallback, useRef } from 'react';

export function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  const acquire = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && !lockRef.current) {
        lockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      // Wake Lock is optional; conversion can continue without it.
    }
  }, []);

  const release = useCallback(async () => {
    try {
      await lockRef.current?.release();
    } catch {
      // Best-effort cleanup.
    } finally {
      lockRef.current = null;
    }
  }, []);

  return { acquire, release };
}
