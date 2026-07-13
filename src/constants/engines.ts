import type { ConversionEngine } from '@/lib/converters/types';
export const ENGINE_LABELS: Record<ConversionEngine, string> = {
  webcodecs: 'WebCodecs',
  ffmpeg: 'FFmpeg WebAssembly',
};
