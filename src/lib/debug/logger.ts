import { MAX_DEBUG_LOGS } from '@/config/app';
import type { DebugLogEntry } from '@/lib/converters/types';
export function appendLog(logs: DebugLogEntry[], entry: DebugLogEntry): DebugLogEntry[] {
  return [...logs, entry].slice(-MAX_DEBUG_LOGS);
}
export function createLog(level: DebugLogEntry['level'], scope: string, message: string): DebugLogEntry {
  return { at: Date.now(), level, scope, message };
}
