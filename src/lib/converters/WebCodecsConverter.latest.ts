import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  canEncodeAudio,
  canEncodeVideo,
  type ConversionAudioOptions,
  type ConversionVideoOptions,
  type InputVideoTrack,
} from 'mediabunny';

import { getOutputFileName } from '@/lib/file-utils';
import type { QualityPreset } from '@/types/converter';
import { getTargetBitrate } from './qualityConfig';
import type {
  ConversionResult,
  ConvertOptions,
  ConverterSupport,
  OutputAnalysis,
  VideoConverter,
  VideoMetadata,
} from './types';

const AAC_BITRATE = 128_000;
const DEFAULT_FPS = 30;
const PROGRESS_START = 5;
const PROGRESS_SPAN = 93;

type HardwareAcceleration =
  | 'no-preference'
  | 'prefer-hardware'
  | 'prefer-software';

export interface LatestWebCodecsConverterOptions {
  /** Mediabunny recommends leaving this at no-preference by default. */
  hardwareAcceleration?: HardwareAcceleration;
  keyFrameIntervalSeconds?: number;
  audioBitrate?: number;
}

export interface LatestWebCodecsDebugInfo {
  mediabunnyApi: 'Conversion';
  inputVideoCodec: string | null;
  inputAudioCodec: string | null;
  outputVideoCodec: 'avc';
  outputAudioCodec: 'aac' | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  targetVideoBitrate: number | null;
  targetAudioBitrate: number | null;
  hardwareAcceleration: HardwareAcceleration;
  forceTranscode: true;
  conversionValid: boolean | null;
  discardedTracks: Array<{ type: string; reason: string }>;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Conversion aborted', 'AbortError');
  }
}

function safePositive(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

async function readFrameRate(track: InputVideoTrack, fallback: number): Promise<number> {
  try {
    const stats = await track.computePacketStats(120);
    return safePositive(stats.averagePacketRate, fallback);
  } catch {
    return fallback;
  }
}

function reportProgress(
  options: ConvertOptions,
  stage: string,
  percent: number,
  processedSeconds: number,
  totalDuration: number,
  startedAt: number,
): void {
  if (!options.onProgress) return;

  const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
  const speed = processedSeconds > 0 ? processedSeconds / elapsedSeconds : null;

  options.onProgress({
    stage,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    time: processedSeconds,
    encodedTime: processedSeconds,
    encodingSpeed: speed,
    totalDuration,
    hasProgress: true,
  });
}

/**
 * WebM -> MP4 converter built on Mediabunny 1.50.x's high-level Conversion API.
 *
 * Why this API:
 * - Conversion is Mediabunny's pipelined path and handles internal decode/encode
 *   overlap and backpressure.
 * - Supplying a numeric bitrate and forceTranscode:true guarantees that the video
 *   is re-encoded instead of copied.
 * - No per-frame JavaScript loop is used, avoiding the serial add() bottleneck.
 */
export class LatestWebCodecsConverter implements VideoConverter {
  private readonly settings: Required<LatestWebCodecsConverterOptions>;
  private conversion: Conversion | null = null;
  private input: Input | null = null;
  private abortListener: (() => void) | null = null;

  private debugInfo: LatestWebCodecsDebugInfo;

  constructor(settings: LatestWebCodecsConverterOptions = {}) {
    this.settings = {
      hardwareAcceleration: settings.hardwareAcceleration ?? 'no-preference',
      keyFrameIntervalSeconds: settings.keyFrameIntervalSeconds ?? 2,
      audioBitrate: settings.audioBitrate ?? AAC_BITRATE,
    };

    this.debugInfo = this.createDebugInfo();
  }

  async checkSupport(): Promise<ConverterSupport> {
    if (!globalThis.isSecureContext) {
      return {
        supported: false,
        reason: 'WEB_CODECS_API_UNAVAILABLE',
        details: {
          hasVideoDecoder: typeof globalThis.VideoDecoder !== 'undefined',
          hasVideoEncoder: typeof globalThis.VideoEncoder !== 'undefined',
          hasVideoFrame: typeof globalThis.VideoFrame !== 'undefined',
          h264Supported: false,
        },
      };
    }

    const hasVideoDecoder = typeof globalThis.VideoDecoder !== 'undefined';
    const hasVideoEncoder = typeof globalThis.VideoEncoder !== 'undefined';
    const hasVideoFrame = typeof globalThis.VideoFrame !== 'undefined';

    if (!hasVideoDecoder || !hasVideoEncoder || !hasVideoFrame) {
      return {
        supported: false,
        reason: 'WEB_CODECS_API_UNAVAILABLE',
        details: { hasVideoDecoder, hasVideoEncoder, hasVideoFrame, h264Supported: false },
      };
    }

    try {
      const h264Supported = await canEncodeVideo('avc', {
        width: 720,
        height: 1280,
        bitrate: 1_000_000,
        hardwareAcceleration: this.settings.hardwareAcceleration,
      });

      return {
        supported: h264Supported,
        reason: h264Supported ? null : 'H264_ENCODER_UNSUPPORTED',
        details: {
          hasVideoDecoder,
          hasVideoEncoder,
          hasVideoFrame,
          h264Supported,
          hardwareAcceleration: this.settings.hardwareAcceleration,
        },
      };
    } catch {
      return {
        supported: false,
        reason: 'WEB_CODECS_CHECK_FAILED',
        details: { hasVideoDecoder, hasVideoEncoder, hasVideoFrame, h264Supported: false },
      };
    }
  }

  async convert(options: ConvertOptions): Promise<ConversionResult> {
    await this.cleanup();
    this.debugInfo = this.createDebugInfo();

    const startedAt = performance.now();
    const { file, signal } = options;
    assertNotAborted(signal);

    this.input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });

    reportProgress(options, 'reading', 1, 0, 0, startedAt);

    const videoTrack = await this.input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new Error('Giriş dosyasında video parçası bulunamadı.');
    }

    const audioTrack = await this.input.getPrimaryAudioTrack();
    const [sourceWidth, sourceHeight, videoCodec, durationFromMetadata] = await Promise.all([
      videoTrack.getDisplayWidth(),
      videoTrack.getDisplayHeight(),
      videoTrack.getCodec(),
      this.input.getDurationFromMetadata(),
    ]);

    const duration = safePositive(durationFromMetadata, await videoTrack.computeDuration());
    const detectedFps = await readFrameRate(videoTrack, options.framerate ?? DEFAULT_FPS);
    const outputWidth = options.width ?? sourceWidth;
    const outputHeight = options.height ?? sourceHeight;
    const frameRate = options.framerate ?? detectedFps;
    const quality = options.quality ?? 'standard';
    const targetVideoBitrate = options.bitrate
      ?? getTargetBitrate(outputWidth, outputHeight, quality as QualityPreset);

    const inputAudioCodec = audioTrack ? await audioTrack.getCodec() : null;
    const [canEncodeAvc, canEncodeAac] = await Promise.all([
      canEncodeVideo('avc', {
        width: outputWidth,
        height: outputHeight,
        bitrate: targetVideoBitrate,
        hardwareAcceleration: this.settings.hardwareAcceleration,
      }),
      audioTrack
        ? canEncodeAudio('aac', {
            numberOfChannels: await audioTrack.getNumberOfChannels(),
            sampleRate: await audioTrack.getSampleRate(),
            bitrate: this.settings.audioBitrate,
          })
        : Promise.resolve(false),
    ]);

    if (!canEncodeAvc) {
      throw new Error('Bu cihaz hedef H.264 yapılandırmasını kodlayamıyor.');
    }
    if (audioTrack && !canEncodeAac) {
      throw new Error('Bu cihaz AAC ses kodlamasını desteklemiyor.');
    }

    this.debugInfo = {
      ...this.debugInfo,
      inputVideoCodec: videoCodec,
      inputAudioCodec,
      outputAudioCodec: audioTrack ? 'aac' : null,
      width: outputWidth,
      height: outputHeight,
      frameRate,
      targetVideoBitrate,
      targetAudioBitrate: audioTrack ? this.settings.audioBitrate : null,
    };

    const metadata: VideoMetadata = {
      totalDurationSeconds: duration,
      width: outputWidth,
      height: outputHeight,
      frameRate,
      hasAudio: Boolean(audioTrack),
      videoCodec: videoCodec ?? 'unknown',
      audioCodec: inputAudioCodec,
    };
    options.onMetadata?.(metadata);

    const videoOptions: ConversionVideoOptions = {
      codec: 'avc',
      bitrate: targetVideoBitrate,
      hardwareAcceleration: this.settings.hardwareAcceleration,
      keyFrameInterval: this.settings.keyFrameIntervalSeconds,
      forceTranscode: true,
      alpha: 'discard',
    };

    // Preserve the input's native timing unless the caller explicitly requests FPS conversion.
    if (options.framerate !== undefined) {
      videoOptions.frameRate = options.framerate;
    }

    // Avoid a transform/copy when source and target dimensions are identical.
    if (outputWidth !== sourceWidth || outputHeight !== sourceHeight) {
      videoOptions.width = outputWidth;
      videoOptions.height = outputHeight;
      videoOptions.fit = options.fit ?? 'contain';
    }

    const audioOptions: ConversionAudioOptions | undefined = audioTrack
      ? {
          codec: 'aac',
          bitrate: this.settings.audioBitrate,
          forceTranscode: true,
        }
      : undefined;

    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat(),
      target,
    });

    reportProgress(options, 'initializing', PROGRESS_START, 0, duration, startedAt);

    this.conversion = await Conversion.init({
      input: this.input,
      output,
      tracks: 'primary',
      video: videoOptions,
      audio: audioOptions,
      showWarnings: true,
    });

    this.debugInfo.conversionValid = this.conversion.isValid;
    this.debugInfo.discardedTracks = this.conversion.discardedTracks.map((item) => ({
      type: item.track.type,
      reason: String(item.reason),
    }));

    if (!this.conversion.isValid) {
      throw new Error(
        `Mediabunny dönüşüm yapılandırması geçersiz: ${JSON.stringify(this.debugInfo.discardedTracks)}`,
      );
    }

    if (signal) {
      this.abortListener = () => {
        void this.conversion?.cancel();
      };
      signal.addEventListener('abort', this.abortListener, { once: true });
    }

    this.conversion.onProgress = (progress, processedTime) => {
      reportProgress(
        options,
        'encoding',
        PROGRESS_START + progress * PROGRESS_SPAN,
        processedTime,
        duration,
        startedAt,
      );
    };

    try {
      await this.conversion.execute();
      assertNotAborted(signal);

      reportProgress(options, 'finalizing', 99, duration, duration, startedAt);

      const buffer = target.buffer;
      if (!buffer || buffer.byteLength === 0) {
        throw new Error('Mediabunny boş bir MP4 çıktısı oluşturdu.');
      }

      const blob = new Blob([buffer], { type: 'video/mp4' });
      const encodeTime = (performance.now() - startedAt) / 1000;
      const totalBitrate = duration > 0 ? Math.round((blob.size * 8) / duration) : null;
      const audioBitrate = audioTrack ? this.settings.audioBitrate : null;
      const videoBitrate = totalBitrate === null
        ? null
        : Math.max(0, totalBitrate - (audioBitrate ?? 0));

      const outputAnalysis: OutputAnalysis = {
        videoCodec: 'H.264',
        audioCodec: audioTrack ? 'AAC' : null,
        width: outputWidth,
        height: outputHeight,
        frameRate,
        duration,
        averageVideoBitrate: videoBitrate ?? 0,
        averageAudioBitrate: audioBitrate,
        totalBitrateBps: totalBitrate ?? undefined,
        container: 'MP4',
        fileSizeBytes: blob.size,
        targetBitrate: targetVideoBitrate,
        bitrateDifference: videoBitrate === null
          ? undefined
          : ((videoBitrate - targetVideoBitrate) / targetVideoBitrate) * 100,
      };

      reportProgress(options, 'complete', 100, duration, duration, startedAt);

      return {
        blob,
        filename: getOutputFileName(file.name),
        fileSize: blob.size,
        inputSize: file.size,
        duration,
        videoBitrate,
        audioBitrate,
        compressionRatio: file.size > 0 ? Math.max(0, 1 - blob.size / file.size) : 0,
        encodeTime,
        averageSpeed: encodeTime > 0 ? duration / encodeTime : null,
        engine: 'webcodecs',
        hasAudio: Boolean(audioTrack),
        outputAnalysis,
      };
    } finally {
      if (signal && this.abortListener) {
        signal.removeEventListener('abort', this.abortListener);
      }
      this.abortListener = null;
    }
  }

  getDebugInfo(): Readonly<LatestWebCodecsDebugInfo> {
    return this.debugInfo;
  }

  async cleanup(): Promise<void> {
    if (this.conversion) {
      try {
        await this.conversion.cancel();
      } catch {
        // Conversion may already be complete; cleanup remains idempotent.
      }
      this.conversion = null;
    }

    this.input?.dispose();
    this.input = null;
    this.abortListener = null;
  }

  private createDebugInfo(): LatestWebCodecsDebugInfo {
    return {
      mediabunnyApi: 'Conversion',
      inputVideoCodec: null,
      inputAudioCodec: null,
      outputVideoCodec: 'avc',
      outputAudioCodec: null,
      width: null,
      height: null,
      frameRate: null,
      targetVideoBitrate: null,
      targetAudioBitrate: null,
      hardwareAcceleration: this.settings.hardwareAcceleration,
      forceTranscode: true,
      conversionValid: null,
      discardedTracks: [],
    };
  }
}
