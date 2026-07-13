'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FFmpegConverter } from '@/lib/converters/FFmpegConverter';
import { WebCodecsConverter } from '@/lib/converters/WebCodecsConverter';
import type {
  ConversionEngine,
  ConversionProgress,
  ConversionResult,
  ConverterDebugInfo,
  MediaInfo,
  QualityPreset,
} from '@/lib/converters/types';
import { useWakeLock } from './useWakeLock';

const initialProgress: ConversionProgress = {
  stage: 'idle',
  percent: 0,
  processedSeconds: 0,
  totalSeconds: 0,
  elapsedSeconds: 0,
  speed: null,
  message: 'Hazır',
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
  const [webCodecsSupport, setWebCodecsSupport] = useState<{ checking: boolean; supported: boolean; reason?: string }>({
    checking: true,
    supported: false,
  });
  const controllerRef = useRef<AbortController | null>(null);
  const activeConverterRef = useRef<WebCodecsConverter | FFmpegConverter | null>(null);
  const { acquire, release } = useWakeLock();

  useEffect(() => {
    const converter = new WebCodecsConverter();
    void converter.checkSupport().then((support) => {
      setWebCodecsSupport({ checking: false, ...support });
      if (!support.supported) setEngine('ffmpeg');
    });
    return () => {
      void activeConverterRef.current?.cleanup();
    };
  }, []);

  const isBusy = ['analyzing', 'loading-engine', 'preparing', 'converting', 'finalizing'].includes(progress.stage);

  const resetOutput = useCallback(() => {
    setResult(null);
    setError(null);
    setFallbackAvailable(false);
    setDebug(null);
    setMediaInfo(null);
    setProgress(initialProgress);
  }, []);

  const chooseFile = useCallback((next: File | null) => {
    if (!next) {
      setFile(null);
      resetOutput();
      return;
    }
    if (!next.name.toLowerCase().endsWith('.webm') && next.type !== 'video/webm') {
      setError('Lütfen WebM formatında bir video seçin.');
      return;
    }
    setFile(next);
    resetOutput();
  }, [resetOutput]);

  const run = useCallback(async (forcedEngine?: ConversionEngine) => {
    if (!file || isBusy) return;
    const selectedEngine = forcedEngine ?? engine;
    setEngine(selectedEngine);
    setError(null);
    setFallbackAvailable(false);
    setResult(null);
    setProgress({ ...initialProgress, stage: 'analyzing', message: 'Dönüşüm başlatılıyor' });

    controllerRef.current = new AbortController();
    const converter = selectedEngine === 'webcodecs' ? new WebCodecsConverter() : new FFmpegConverter();
    activeConverterRef.current = converter;
    await acquire();

    try {
      const support = await converter.checkSupport();
      if (!support.supported) throw new Error(support.reason ?? 'Seçilen dönüşüm motoru desteklenmiyor.');
      const conversionResult = await converter.convert({
        file,
        quality,
        signal: controllerRef.current.signal,
        onProgress: setProgress,
        onInfo: setMediaInfo,
        onDebug: setDebug,
      });
      setResult(conversionResult);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setError('Dönüşüm iptal edildi.');
      } else {
        setError(message);
        setFallbackAvailable(selectedEngine === 'webcodecs');
      }
    } finally {
      await release();
      controllerRef.current = null;
    }
  }, [acquire, engine, file, isBusy, quality, release]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const startOver = useCallback(async () => {
    controllerRef.current?.abort();
    await activeConverterRef.current?.cleanup();
    activeConverterRef.current = null;
    setFile(null);
    resetOutput();
  }, [resetOutput]);

  return useMemo(() => ({
    file,
    engine,
    quality,
    progress,
    mediaInfo,
    result,
    debug,
    error,
    fallbackAvailable,
    webCodecsSupport,
    isBusy,
    setEngine,
    setQuality,
    chooseFile,
    run,
    cancel,
    startOver,
    clearError: () => setError(null),
  }), [cancel, chooseFile, debug, engine, error, fallbackAvailable, file, isBusy, mediaInfo, progress, quality, result, run, startOver, webCodecsSupport]);
}
