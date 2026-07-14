import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { analyzeMedia } from './mediaInfo';
import { getVideoBitrate } from './quality';

import type {
  ConversionProgress,
  ConversionResult,
  Converter,
  ConverterDebugInfo,
  ConvertOptions,
  DebugLogEntry,
} from './types';

const CORE_BASE_URL =
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';

const AUDIO_BITRATE = 128_000;

function createInputName(): string {
  return `input-${Date.now()}.webm`;
}

function createOutputName(): string {
  return `output-${Date.now()}.mp4`;
}

function createDownloadName(inputName: string): string {
  const baseName = inputName.replace(/\.[^.]+$/i, '');
  return `${baseName}.mp4`;
}

export class FFmpegConverter implements Converter {
  private ffmpeg: FFmpeg | null = null;
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;
  private debug = this.createDebug();

  async checkSupport(): Promise<{
    supported: boolean;
    reason?: string;
  }> {
    if (typeof WebAssembly === 'undefined') {
      return {
        supported: false,
        reason: 'WebAssembly bu tarayıcıda kullanılamıyor.',
      };
    }

    return { supported: true };
  }

  async convert(options: ConvertOptions): Promise<ConversionResult> {
    const startedAt = performance.now();
    const inputName = createInputName();
    const outputName = createOutputName();

    let progressListenerAttached = false;
    let logListenerAttached = false;
    let abortListenerAttached = false;

    let lastPercent = 8;
    let lastProcessedSeconds = 0;
    let duration = 0;

    this.debug = this.createDebug();

    const emitDebug = (
      patch: Partial<ConverterDebugInfo>,
    ): void => {
      this.debug = {
        ...this.debug,
        ...patch,
      };

      options.onDebug?.(structuredClone(this.debug));
    };

    const addLog = (
      level: DebugLogEntry['level'],
      scope: string,
      message: string,
    ): void => {
      emitDebug({
        logs: [
          ...this.debug.logs,
          {
            at: Date.now(),
            level,
            scope,
            message,
          },
        ].slice(-100),
      });
    };

    const emitProgress = (
      stage: ConversionProgress['stage'],
      percent: number,
      processedSeconds: number,
      totalSeconds: number,
      message: string,
    ): void => {
      const elapsedSeconds = Math.max(
        (performance.now() - startedAt) / 1000,
        0.001,
      );

      const normalizedProcessed = Math.max(
        0,
        Math.min(processedSeconds, totalSeconds || processedSeconds),
      );

      options.onProgress?.({
        stage,
        percent: Math.max(
          0,
          Math.min(100, Math.round(percent)),
        ),
        processedSeconds: normalizedProcessed,
        totalSeconds,
        elapsedSeconds,
        speed:
          normalizedProcessed > 0
            ? normalizedProcessed / elapsedSeconds
            : null,
        message,
      });
    };

    const updateEncodingProgress = (
      processedSeconds: number,
    ): void => {
      if (!Number.isFinite(processedSeconds) || processedSeconds < 0) {
        return;
      }

      const processed = Math.max(
        lastProcessedSeconds,
        Math.min(processedSeconds, duration),
      );

      lastProcessedSeconds = processed;

      const ratio =
        duration > 0
          ? Math.max(0, Math.min(1, processed / duration))
          : 0;

      const calculatedPercent = 8 + ratio * 90;

      lastPercent = Math.max(
        lastPercent,
        Math.min(98, calculatedPercent),
      );

      emitProgress(
        'converting',
        lastPercent,
        processed,
        duration,
        'FFmpeg ile dönüştürülüyor',
      );
    };

    const onProgress = ({
      progress,
      time,
    }: {
      progress: number;
      time: number;
    }): void => {
      /*
       * @ffmpeg/ffmpeg 0.12.x time değerini mikrosaniye
       * cinsinden bildirir.
       */
      const processedSeconds =
        Number.isFinite(time) && time > 0
          ? time / 1_000_000
          : 0;

      if (processedSeconds > 0) {
        updateEncodingProgress(processedSeconds);
        return;
      }

      /*
       * Bazı dosyalarda yalnızca progress oranı gelebilir.
       */
      if (
        Number.isFinite(progress) &&
        progress >= 0 &&
        progress <= 1
      ) {
        const processed = duration * progress;
        updateEncodingProgress(processed);
      }
    };

    const onLog = ({
      message,
    }: {
      type: string;
      message: string;
    }): void => {
      /*
       * Tüm FFmpeg loglarını state'e basmak performansı bozabilir.
       * Yalnızca önemli satırları debug paneline ekliyoruz.
       */
      if (
        /error|failed|invalid|cannot|unsupported|out of memory/i.test(
          message,
        )
      ) {
        addLog('warn', 'FFmpeg', message);
      }
    };

    const abort = (): void => {
      if (this.ffmpeg) {
        this.ffmpeg.terminate();
      }

      this.ffmpeg = null;
      this.loaded = false;
      this.loadingPromise = null;
    };

    try {
      if (options.signal?.aborted) {
        throw new DOMException(
          'Dönüşüm iptal edildi.',
          'AbortError',
        );
      }

      emitDebug({
        stage: 'analyzing',
      });

      emitProgress(
        'analyzing',
        1,
        0,
        0,
        'Video analiz ediliyor',
      );

      const info = await analyzeMedia(options.file);

      duration = info.duration;
      options.onInfo?.(info);

      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error('Video süresi belirlenemedi.');
      }

      const targetVideoBitrate = getVideoBitrate(
        options.quality,
      );

      emitDebug({
        inputVideoCodec: info.videoCodec,
        inputVideoCodecString: info.videoCodecString,
        inputAudioCodec: info.audioCodec,
        outputVideoCodec: 'avc',
        outputAudioCodec: info.hasAudio ? 'aac' : null,
        targetVideoBitrate,
        targetAudioBitrate: info.hasAudio
          ? AUDIO_BITRATE
          : null,
        requestedQuality: options.quality,
        keyFrameInterval: null,
      });

      emitDebug({
        stage: 'loading-engine',
      });

      emitProgress(
        'loading-engine',
        3,
        0,
        duration,
        'FFmpeg hazırlanıyor',
      );

      await this.ensureLoaded(addLog);

      if (!this.ffmpeg) {
        throw new Error('FFmpeg başlatılamadı.');
      }

      if (options.signal?.aborted) {
        throw new DOMException(
          'Dönüşüm iptal edildi.',
          'AbortError',
        );
      }

      emitDebug({
        ffmpegLoaded: true,
        stage: 'preparing',
      });

      emitProgress(
        'preparing',
        5,
        0,
        duration,
        'Dosya FFmpeg belleğine aktarılıyor',
      );

      const inputData = await fetchFile(options.file);

      await this.ffmpeg.writeFile(
        inputName,
        inputData,
      );

      if (options.signal?.aborted) {
        throw new DOMException(
          'Dönüşüm iptal edildi.',
          'AbortError',
        );
      }

      this.ffmpeg.on('progress', onProgress);
      progressListenerAttached = true;

      this.ffmpeg.on('log', onLog);
      logListenerAttached = true;

      options.signal?.addEventListener(
        'abort',
        abort,
        { once: true },
      );
      abortListenerAttached = true;

      const args: string[] = [
        '-y',

        '-i',
        inputName,

        '-c:v',
        'libx264',

        '-preset',
        'ultrafast',

        '-b:v',
        String(targetVideoBitrate),

        '-pix_fmt',
        'yuv420p',
      ];

      if (info.hasAudio) {
        args.push(
          '-c:a',
          'aac',
          '-b:a',
          String(AUDIO_BITRATE),
        );
      } else {
        args.push('-an');
      }

      args.push(
        '-movflags',
        '+faststart',
        outputName,
      );

      addLog(
        'info',
        'FFmpeg',
        `Komut: ffmpeg ${args.join(' ')}`,
      );

      emitDebug({
        stage: 'converting',
      });

      emitProgress(
        'converting',
        8,
        0,
        duration,
        'FFmpeg ile dönüştürülüyor',
      );

      const exitCode = await this.ffmpeg.exec(args);

      if (options.signal?.aborted) {
        throw new DOMException(
          'Dönüşüm iptal edildi.',
          'AbortError',
        );
      }

      if (exitCode !== 0) {
        throw new Error(
          `FFmpeg dönüşümü başarısız oldu (kod: ${exitCode}).`,
        );
      }

      emitDebug({
        stage: 'finalizing',
      });

      emitProgress(
        'finalizing',
        99,
        duration,
        duration,
        'MP4 dosyası hazırlanıyor',
      );

      const outputData =
        await this.ffmpeg.readFile(outputName);

      if (typeof outputData === 'string') {
        throw new Error(
          'FFmpeg geçersiz çıktı üretti.',
        );
      }

      const bytes = new Uint8Array(outputData);

      if (bytes.byteLength === 0) {
        throw new Error(
          'FFmpeg boş bir MP4 dosyası üretti.',
        );
      }

      const blob = new Blob(
        [bytes],
        {
          type: 'video/mp4',
        },
      );

      const elapsedSeconds = Math.max(
        (performance.now() - startedAt) / 1000,
        0.001,
      );

      const actualTotalBitrate =
        duration > 0
          ? Math.round(
              (blob.size * 8) / duration,
            )
          : 0;

      const actualVideoBitrate = Math.max(
        0,
        actualTotalBitrate -
          (info.hasAudio ? AUDIO_BITRATE : 0),
      );

      const bitrateDeviationPercent =
        targetVideoBitrate > 0
          ? ((actualVideoBitrate -
                targetVideoBitrate) /
              targetVideoBitrate) *
            100
          : 0;

      const bitrateWithinTolerance =
        Math.abs(bitrateDeviationPercent) <= 15;

      emitDebug({
        stage: 'completed',
        actualVideoBitrate,
        actualTotalBitrate,
        bitrateDeviationPercent,
        bitrateWithinTolerance,
      });

      emitProgress(
        'completed',
        100,
        duration,
        duration,
        'Dönüşüm tamamlandı',
      );

      return {
        blob,
        filename: createDownloadName(
          options.file.name,
        ),
        inputBytes: options.file.size,
        outputBytes: blob.size,
        duration,
        elapsedSeconds,
        averageSpeed:
          duration / elapsedSeconds,
        targetVideoBitrate,
        actualVideoBitrate,
        actualTotalBitrate,
        bitrateDeviationPercent,
        bitrateWithinTolerance,
        videoCodec: 'H.264 / AVC',
        audioCodec: info.hasAudio
          ? 'AAC'
          : null,
        engine: 'ffmpeg',
        source: info,
      };
    } catch (error) {
      const normalized =
        error instanceof Error
          ? error
          : new Error(String(error));

      const cancelled =
        normalized.name === 'AbortError' ||
        options.signal?.aborted === true;

      emitDebug({
        stage: cancelled
          ? 'cancelled'
          : 'error',
        lastError: normalized.message,
      });

      addLog(
        cancelled ? 'warn' : 'error',
        'FFmpeg',
        normalized.message,
      );

      if (cancelled) {
        throw new DOMException(
          'Dönüşüm iptal edildi.',
          'AbortError',
        );
      }

      throw normalized;
    } finally {
      /*
       * Worker terminate edilmişse this.ffmpeg null olabilir.
       * Listener'lar da worker ile birlikte yok olur.
       */
      if (this.ffmpeg) {
        if (progressListenerAttached) {
          this.ffmpeg.off(
            'progress',
            onProgress,
          );
        }

        if (logListenerAttached) {
          this.ffmpeg.off(
            'log',
            onLog,
          );
        }
      }

      if (abortListenerAttached) {
        options.signal?.removeEventListener(
          'abort',
          abort,
        );
      }

      await this.safeDelete(inputName);
      await this.safeDelete(outputName);
    }
  }

  async cleanup(): Promise<void> {
    if (this.ffmpeg) {
      this.ffmpeg.terminate();
    }

    this.ffmpeg = null;
    this.loaded = false;
    this.loadingPromise = null;
  }

  private async ensureLoaded(
    log: (
      level: DebugLogEntry['level'],
      scope: string,
      message: string,
    ) => void,
  ): Promise<void> {
    if (this.loaded && this.ffmpeg) {
      return;
    }

    /*
     * Aynı anda iki ayrı load işlemi başlamasını engeller.
     */
    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }

    this.loadingPromise = this.loadFFmpeg(log);

    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async loadFFmpeg(
    log: (
      level: DebugLogEntry['level'],
      scope: string,
      message: string,
    ) => void,
  ): Promise<void> {
    const ffmpeg = new FFmpeg();

    log(
      'info',
      'FFmpeg',
      'FFmpeg WebAssembly çekirdeği indiriliyor (~31 MB).',
    );

    try {
      const coreURL = await toBlobURL(
        `${CORE_BASE_URL}/ffmpeg-core.js`,
        'text/javascript',
      );

      const wasmURL = await toBlobURL(
        `${CORE_BASE_URL}/ffmpeg-core.wasm`,
        'application/wasm',
      );

      await ffmpeg.load({
        coreURL,
        wasmURL,
      });

      this.ffmpeg = ffmpeg;
      this.loaded = true;

      log(
        'info',
        'FFmpeg',
        'FFmpeg WebAssembly hazır.',
      );
    } catch (error) {
      ffmpeg.terminate();

      this.ffmpeg = null;
      this.loaded = false;

      throw error;
    }
  }

  private async safeDelete(
    path: string,
  ): Promise<void> {
    if (!this.ffmpeg) {
      return;
    }

    try {
      await this.ffmpeg.deleteFile(path);
    } catch {
      /*
       * Dosya mevcut değilse cleanup hatası
       * dönüşümü başarısız yapmamalı.
       */
    }
  }

  private createDebug(): ConverterDebugInfo {
    return {
      engine: 'ffmpeg',
      stage: 'idle',
      mediabunnyVersion: '1.50.8',
      mediabunnyApi: null,
      ffmpegLoaded: this.loaded,
      inputVideoCodec: null,
      inputVideoCodecString: null,
      inputAudioCodec: null,
      outputVideoCodec: 'avc',
      outputAudioCodec: null,
      targetVideoBitrate: null,
      targetAudioBitrate: null,
      actualVideoBitrate: null,
      actualTotalBitrate: null,
      bitrateDeviationPercent: null,
      bitrateWithinTolerance: null,
      requestedQuality: null,
      keyFrameInterval: null,
      hardwareAcceleration: 'no-preference',
      forceTranscode: true,
      conversionValid: null,
      discardedTracks: [],
      lastError: null,
      logs: [],
    };
  }
}