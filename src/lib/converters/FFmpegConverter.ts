import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { analyzeMedia } from './mediaInfo';

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

const OUTPUT_WIDTH = 720;
const OUTPUT_HEIGHT = 1280;
const OUTPUT_FRAMERATE = 30;

const VIDEO_BITRATE = 650_000;
const AUDIO_BITRATE = 128_000;

const VIDEO_CRF = 28;
const VIDEO_PRESET = 'medium';

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

    let duration = 0;
    let lastPercent = 8;
    let lastProcessedSeconds = 0;

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

      const safeTotal = Number.isFinite(totalSeconds)
        ? Math.max(0, totalSeconds)
        : 0;

      const safeProcessed = Number.isFinite(processedSeconds)
        ? Math.max(
            0,
            safeTotal > 0
              ? Math.min(processedSeconds, safeTotal)
              : processedSeconds,
          )
        : 0;

      options.onProgress?.({
        stage,
        percent: Math.max(
          0,
          Math.min(100, Math.round(percent)),
        ),
        processedSeconds: safeProcessed,
        totalSeconds: safeTotal,
        elapsedSeconds,
        speed:
          safeProcessed > 0
            ? safeProcessed / elapsedSeconds
            : null,
        message,
      });
    };

    const updateEncodingProgress = (
      processedSeconds: number,
    ): void => {
      if (
        !Number.isFinite(processedSeconds) ||
        processedSeconds < 0
      ) {
        return;
      }

      const processed = Math.max(
        lastProcessedSeconds,
        duration > 0
          ? Math.min(processedSeconds, duration)
          : processedSeconds,
      );

      lastProcessedSeconds = processed;

      const ratio =
        duration > 0
          ? Math.max(
              0,
              Math.min(1, processed / duration),
            )
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
       * @ffmpeg/ffmpeg 0.12.x time değerini
       * mikrosaniye olarak döndürür.
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
       * Bazı dosyalarda time yerine yalnızca
       * 0–1 aralığında progress oranı gelebilir.
       */
      if (
        Number.isFinite(progress) &&
        progress >= 0 &&
        progress <= 1 &&
        duration > 0
      ) {
        updateEncodingProgress(
          duration * progress,
        );
      }
    };

    const onLog = ({
      message,
    }: {
      type: string;
      message: string;
    }): void => {
      /*
       * Her FFmpeg logunu React state'e taşımak mobilde
       * performans kaybına neden olabilir.
       *
       * Yalnızca önemli hata ve uyarıları debug paneline ekle.
       */
      if (
        /error|failed|invalid|cannot|unsupported|out of memory/i.test(
          message,
        )
      ) {
        addLog(
          'warn',
          'FFmpeg',
          message,
        );
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

      const info = await analyzeMedia(
        options.file,
      );

      duration = info.duration;

      if (
        !Number.isFinite(duration) ||
        duration <= 0
      ) {
        throw new Error(
          'Video süresi belirlenemedi.',
        );
      }

      options.onInfo?.(info);

      emitDebug({
        inputVideoCodec: info.videoCodec,
        inputVideoCodecString:
          info.videoCodecString,
        inputAudioCodec: info.audioCodec,

        outputVideoCodec: 'avc',
        outputAudioCodec: info.hasAudio
          ? 'aac'
          : null,

        targetVideoBitrate: VIDEO_BITRATE,
        targetAudioBitrate: info.hasAudio
          ? AUDIO_BITRATE
          : null,

        requestedQuality: options.quality,
        keyFrameInterval: null,

        hardwareAcceleration:
          'no-preference',

        forceTranscode: true,
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
        throw new Error(
          'FFmpeg başlatılamadı.',
        );
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

      const inputData = await fetchFile(
        options.file,
      );

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

      this.ffmpeg.on(
        'progress',
        onProgress,
      );

      progressListenerAttached = true;

      this.ffmpeg.on(
        'log',
        onLog,
      );

      logListenerAttached = true;

      options.signal?.addEventListener(
        'abort',
        abort,
        { once: true },
      );

      abortListenerAttached = true;

      const maxrateKbps = Math.floor(
        VIDEO_BITRATE / 1000,
      );

      const filter =
        `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}` +
        ':force_original_aspect_ratio=decrease,' +
        `pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}` +
        ':(ow-iw)/2:(oh-ih)/2';

      const args: string[] = [
        '-y',

        '-i',
        inputName,

        '-c:v',
        'libx264',

        '-preset',
        VIDEO_PRESET,

        '-crf',
        String(VIDEO_CRF),

        '-maxrate',
        `${maxrateKbps}k`,

        '-bufsize',
        `${maxrateKbps * 2}k`,

        '-vf',
        filter,

        '-r',
        String(OUTPUT_FRAMERATE),

        '-pix_fmt',
        'yuv420p',
      ];

      if (info.hasAudio) {
        args.push(
          '-c:a',
          'aac',

          '-b:a',
          '128k',
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

      const exitCode =
        await this.ffmpeg.exec(args);

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
        await this.ffmpeg.readFile(
          outputName,
        );

      if (typeof outputData === 'string') {
        throw new Error(
          'FFmpeg geçersiz çıktı üretti.',
        );
      }

      /*
       * readFile tarafından döndürülen Uint8Array'ın
       * yalnızca kendi bölümünü kopyala.
       */
      const outputBytes = new Uint8Array(
        outputData.byteLength,
      );

      outputBytes.set(outputData);

      if (outputBytes.byteLength === 0) {
        throw new Error(
          'FFmpeg boş bir MP4 dosyası üretti.',
        );
      }

      const blob = new Blob(
        [outputBytes],
        {
          type: 'video/mp4',
        },
      );

      const elapsedSeconds = Math.max(
        (performance.now() - startedAt) / 1000,
        0.001,
      );

      /*
       * Bitrate hesabı dönüşüm süresine göre değil,
       * çıktı videosunun gerçek süresine göre yapılır.
       */
      const actualTotalBitrate =
        duration > 0
          ? Math.round(
              (blob.size * 8) / duration,
            )
          : 0;

      const actualVideoBitrate = Math.max(
        0,
        actualTotalBitrate -
          (info.hasAudio
            ? AUDIO_BITRATE
            : 0),
      );

      const bitrateDeviationPercent =
        VIDEO_BITRATE > 0
          ? ((actualVideoBitrate -
                VIDEO_BITRATE) /
              VIDEO_BITRATE) *
            100
          : 0;

      const bitrateWithinTolerance =
        Math.abs(
          bitrateDeviationPercent,
        ) <= 15;

      emitDebug({
        stage: 'completed',

        actualVideoBitrate,
        actualTotalBitrate,

        bitrateDeviationPercent,
        bitrateWithinTolerance,

        conversionValid:
          blob.size > 0,
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

        targetVideoBitrate:
          VIDEO_BITRATE,

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

        lastError:
          normalized.message,
      });

      addLog(
        cancelled
          ? 'warn'
          : 'error',

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

      await this.safeDelete(
        inputName,
      );

      await this.safeDelete(
        outputName,
      );
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
    if (
      this.loaded &&
      this.ffmpeg
    ) {
      return;
    }

    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }

    this.loadingPromise =
      this.loadFFmpeg(log);

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
      await this.ffmpeg.deleteFile(
        path,
      );
    } catch {
      /*
       * Dosyanın mevcut olmaması cleanup
       * işlemini başarısız yapmamalı.
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

      targetVideoBitrate:
        VIDEO_BITRATE,

      targetAudioBitrate:
        AUDIO_BITRATE,

      actualVideoBitrate: null,
      actualTotalBitrate: null,

      bitrateDeviationPercent: null,
      bitrateWithinTolerance: null,

      requestedQuality: null,
      keyFrameInterval: null,

      hardwareAcceleration:
        'no-preference',

      forceTranscode: true,
      conversionValid: null,

      discardedTracks: [],
      lastError: null,
      logs: [],
    };
  }
}