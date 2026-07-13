import { ConverterError } from './ConverterError';
export function normalizeConverterError(error: unknown): ConverterError {
  if (error instanceof ConverterError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') return new ConverterError('canceled', 'Dönüşüm iptal edildi.', error);
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes('decode')) return new ConverterError('decode', 'Video bu tarayıcıda çözümlenemedi.', error);
  if (lower.includes('encode') || lower.includes('avc') || lower.includes('h.264')) return new ConverterError('encode', 'Bu cihazda uygun H.264 kodlayıcı bulunamadı.', error);
  return new ConverterError('unknown', message || 'Bilinmeyen bir dönüşüm hatası oluştu.', error);
}
