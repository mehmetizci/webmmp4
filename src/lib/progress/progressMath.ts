export function clampPercent(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }
export function calculateSpeed(processedSeconds: number, elapsedSeconds: number): number | null {
  return processedSeconds > 0 && elapsedSeconds > 0 ? processedSeconds / elapsedSeconds : null;
}
export function calculateEta(totalSeconds: number, processedSeconds: number, speed: number | null): number | null {
  if (!speed || speed <= 0 || processedSeconds >= totalSeconds) return null;
  return Math.max(0, (totalSeconds - processedSeconds) / speed);
}
