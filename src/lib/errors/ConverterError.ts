export type ConverterErrorCode = 'unsupported' | 'decode' | 'encode' | 'ffmpeg' | 'canceled' | 'unknown';
export class ConverterError extends Error {
  constructor(public readonly code: ConverterErrorCode, message: string, public readonly cause?: unknown) {
    super(message); this.name = 'ConverterError';
  }
}
