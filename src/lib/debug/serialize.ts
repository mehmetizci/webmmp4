export function serializeUnknown(value: unknown): string {
  if (value instanceof Error) return JSON.stringify({ name: value.name, message: value.message, stack: value.stack });
  try { return JSON.stringify(value); } catch { return String(value); }
}
