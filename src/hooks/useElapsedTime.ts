import { useEffect, useState } from 'react';
export function useElapsedTime(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = performance.now();
    const id = window.setInterval(() => setSeconds((performance.now() - started) / 1000), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return active ? seconds : 0;
}
