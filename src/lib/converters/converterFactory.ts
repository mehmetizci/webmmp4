import type { ConversionEngine, Converter } from './types';
import { WebCodecsConverter } from './WebCodecsConverter';
import { FFmpegConverter } from './FFmpegConverter';
export function createConverter(engine: ConversionEngine): Converter { return engine === 'webcodecs' ? new WebCodecsConverter() : new FFmpegConverter(); }
