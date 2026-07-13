import type { ConversionProgress, ConversionStage } from '@/lib/converters/types';
import { calculateSpeed, clampPercent } from './progressMath';
export function createProgress(stage: ConversionStage, percent: number, processedSeconds: number, totalSeconds: number, elapsedSeconds: number, message: string): ConversionProgress {
  return { stage, percent: clampPercent(percent), processedSeconds, totalSeconds, elapsedSeconds, speed: calculateSpeed(processedSeconds, elapsedSeconds), message };
}
