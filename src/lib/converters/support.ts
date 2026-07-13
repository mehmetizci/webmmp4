import { WebCodecsConverter } from './WebCodecsConverter';
export async function detectDefaultEngine(): Promise<{ engine: 'webcodecs' | 'ffmpeg'; reason?: string }> {
  const support = await new WebCodecsConverter().checkSupport();
  return support.supported ? { engine: 'webcodecs' } : { engine: 'ffmpeg', reason: support.reason };
}
