'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createConverter } from '@/lib/converters/converterFactory';
import { detectDefaultEngine } from '@/lib/converters/support';
import { normalizeConverterError } from '@/lib/errors/normalizeError';
import { validateWebMFile } from '@/lib/media/fileValidation';
import type {
  ConversionEngine,
  ConversionProgress,
  ConversionResult,
  Converter,
  ConverterDebugInfo,
  MediaInfo,
  QualityPreset,
} from '@/lib/converters/types';
import { useWakeLock } from './useWakeLock';

const initialProgress: ConversionProgress = {
  stage: 'idle', percent: 0, processedSeconds: 0, totalSeconds: 0,
  elapsedSeconds: 0, speed: null, message: 'Hazır',
};

export function useConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [engine, setEngine] = useState<ConversionEngine>('webcodecs');
  const [quality, setQuality] = useState<QualityPreset>('standard');
  const [progress, setProgress] = useState(initialProgress);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [debug, setDebug] = useState<ConverterDebugInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallbackAvailable, setFallbackAvailable] = useState(false);
  const [webCodecsSupport, setWebCodecsSupport] = useState<{ checking: boolean; supported: boolean; reason?: string }>({ checking: true, supported: false });
  const controllerRef = useRef<AbortController | null>(null);
  const activeConverterRef = useRef<Converter | null>(null);
  const { acquire, release } = useWakeLock();

  useEffect(() => {
    void detectDefaultEngine().then((detected) => {
      setEngine(detected.engine);
      setWebCodecsSupport({ checking: false, supported: detected.engine === 'webcodecs', reason: detected.reason });
    });
    return () => { void activeConverterRef.current?.cleanup(); };
  }, []);

  const isBusy = ['analyzing', 'loading-engine', 'preparing', 'converting', 'finalizing'].includes(progress.stage);

  const resetOutput = useCallback(() => {
    setResult(null); setError(null); setFallbackAvailable(false); setDebug(null); setMediaInfo(null); setProgress(initialProgress);
  }, []);

  const chooseFile = useCallback((next: File | null) => {
    if (!next) { setFile(null); resetOutput(); return; }
    const validationError = validateWebMFile(next);
    if (validationError) { setError(validationError); return; }
    setFile(next); resetOutput();
  }, [resetOutput]);

  const run = useCallback(async (forcedEngine?: ConversionEngine) => {
    if (!file || isBusy) return;
    const selectedEngine = forcedEngine ?? engine;
    setEngine(selectedEngine); setError(null); setFallbackAvailable(false); setResult(null);
    setProgress({ ...initialProgress, stage: 'analyzing', message: 'Dönüşüm başlatılıyor' });
    controllerRef.current = new AbortController();
    const converter = createConverter(selectedEngine);
    activeConverterRef.current = converter;
    await acquire();
    try {
      const support = await converter.checkSupport();
      if (!support.supported) throw new Error(support.reason ?? 'Seçilen dönüşüm motoru desteklenmiyor.');
      const conversionResult = await converter.convert({ file, quality, signal: controllerRef.current.signal, onProgress: setProgress, onInfo: setMediaInfo, onDebug: setDebug });
      setResult(conversionResult);
    } catch (caught) {
      const normalized = normalizeConverterError(caught);
      setError(normalized.message);
      setFallbackAvailable(selectedEngine === 'webcodecs' && normalized.code !== 'canceled');
      setProgress((current) => ({ ...current, stage: normalized.code === 'canceled' ? 'cancelled' : 'error', message: normalized.message }));
    } finally {
      await converter.cleanup().catch(() => undefined);
      await release(); controllerRef.current = null;
    }
  }, [acquire, engine, file, isBusy, quality, release]);

  const cancel = useCallback(() => controllerRef.current?.abort(), []);
  const startOver = useCallback(async () => {
    controllerRef.current?.abort(); await activeConverterRef.current?.cleanup(); activeConverterRef.current = null; setFile(null); resetOutput();
  }, [resetOutput]);

  return useMemo(() => ({
    file, engine, quality, progress, mediaInfo, result, debug, error, fallbackAvailable, webCodecsSupport, isBusy,
    setEngine, setQuality, chooseFile, run, cancel, startOver, clearError: () => setError(null),
  }), [cancel, chooseFile, debug, engine, error, fallbackAvailable, file, isBusy, mediaInfo, progress, quality, result, run, startOver, webCodecsSupport]);
}
