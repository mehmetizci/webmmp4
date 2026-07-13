import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  ConversionCanceledError,
  Input,
  Mp4OutputFormat,
  Output,
  canEncodeAudio,
  canEncodeVideo,
  type ConversionAudioOptions,
  type ConversionVideoOptions,
} from 'mediabunny';
import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { BITRATE_TOLERANCE_PERCENT, getQualityOption } from './quality';
import type {
  ConversionProgress,
  ConversionResult,
  Converter,
  ConverterDebugInfo,
  ConvertOptions,
  DebugLogEntry,
  MediaInfo,
} from './types';

const MEDIABUNNY_VERSION = '1.50.8';
const AUDIO_BITRATE = 128_000;
let aacExtensionRegistered = false;

function outputName(inputName: string): string {
  return `${inputName.replace(/\.webm$/i, '')}.mp4`;
}

function positive(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class WebCodecsConverter implements Converter {
  private input: Input | null = null;
  private conversion: Conversion | null = null;
  private debug: ConverterDebugInfo = this.createDebug();

  async checkSupport(): Promise<{ supported: boolean; reason?: string }> {
    if (!globalThis.isSecureContext) return { supported: false, reason: 'HTTPS bağlantısı gerekli.' };
    if (typeof VideoDecoder === 'undefined' || typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      return { supported: false, reason: 'WebCodecs bu tarayıcıda kullanılamıyor.' };
    }
    try {
      const supported = await canEncodeVideo('avc', {
        width: 720,
        height: 1280,
        bitrate: 1_000_000,
        hardwareAcceleration: 'no-preference',
      });
      return supported ? { supported: true } : { supported: false, reason: 'H.264 kodlayıcı desteklenmiyor.' };
    } catch (error) {
      return { supported: false, reason: normalizeError(error).message };
    }
  }

  async convert(options: ConvertOptions): Promise<ConversionResult> {
    await this.cleanup();
    const startedAt = performance.now();
    this.debug = this.createDebug();

    const emitDebug = (patch: Partial<ConverterDebugInfo>) => {
      this.debug = { ...this.debug, ...patch };
      options.onDebug?.(structuredClone(this.debug));
    };
    const log = (level: DebugLogEntry['level'], scope: string, message: string) => {
      const logs = [...this.debug.logs, { at: Date.now(), level, scope, message }].slice(-100);
      emitDebug({ logs });
    };
    const progress = (
      stage: ConversionProgress['stage'],
      percent: number,
      processedSeconds: number,
      totalSeconds: number,
      message: string,
    ) => {
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
      options.onProgress?.({
        stage,
        percent: Math.max(0, Math.min(100, Math.round(percent))),
        processedSeconds,
        totalSeconds,
        elapsedSeconds,
        speed: processedSeconds > 0 ? processedSeconds / elapsedSeconds : null,
        message,
      });
    };
    const assertActive = () => {
      if (options.signal?.aborted) throw new DOMException('Dönüşüm iptal edildi.', 'AbortError');
    };

    emitDebug({ stage: 'analyzing', lastError: null });
    progress('analyzing', 1, 0, 0, 'Video analiz ediliyor');
    log('info', 'Converter', 'Mediabunny Conversion API başlatıldı.');
    assertActive();

    this.input = new Input({
      source: new BlobSource(options.file, { useStreamReader: true }),
      formats: ALL_FORMATS,
    });

    try {
      const videoTrack = await this.input.getPrimaryVideoTrack();
      if (!videoTrack) throw new Error('Dosyada kullanılabilir video parçası bulunamadı.');
      const audioTrack = await this.input.getPrimaryAudioTrack();

      const [width, height, videoCodec, videoCodecString, durationMetadata, audioCodec, frameStats] = await Promise.all([
        videoTrack.getDisplayWidth(),
        videoTrack.getDisplayHeight(),
        videoTrack.getCodec(),
        videoTrack.getCodecParameterString(),
        this.input.getDurationFromMetadata(),
        audioTrack ? audioTrack.getCodec() : Promise.resolve(null),
        videoTrack.computePacketStats(180).catch(() => null),
      ]);
      const duration = positive(durationMetadata, await videoTrack.computeDuration());
      const mediaInfo: MediaInfo = {
        duration,
        width,
        height,
        frameRate: frameStats?.averagePacketRate ?? null,
        videoCodec,
        videoCodecString,
        audioCodec,
        hasAudio: Boolean(audioTrack),
      };
      options.onInfo?.(mediaInfo);
      emitDebug({
        inputVideoCodec: videoCodec,
        inputVideoCodecString: videoCodecString,
        inputAudioCodec: audioCodec,
      });

      const decoderConfig = await videoTrack.getDecoderConfig();
      if (decoderConfig && typeof VideoDecoder !== 'undefined') {
        const decoderSupport = await VideoDecoder.isConfigSupported(decoderConfig);
        if (!decoderSupport.supported) {
          throw new Error(`Giriş video codec'i çözülemiyor (${videoCodecString ?? videoCodec ?? 'bilinmiyor'}).`);
        }
      }

      const qualityOption = getQualityOption(options.quality);
      const targetVideoBitrate = qualityOption.bitrate;
      const canAvc = await canEncodeVideo('avc', {
        width,
        height,
        bitrate: targetVideoBitrate,
        hardwareAcceleration: 'no-preference',
      });
      if (!canAvc) throw new Error('Bu cihaz seçilen H.264 çıkış ayarını desteklemiyor.');

      if (audioTrack) {
        const nativeAac = await canEncodeAudio('aac', {
          numberOfChannels: await audioTrack.getNumberOfChannels(),
          sampleRate: await audioTrack.getSampleRate(),
          bitrate: AUDIO_BITRATE,
        });
        if (!nativeAac && !aacExtensionRegistered) {
          registerAacEncoder();
          aacExtensionRegistered = true;
          log('info', 'Audio', 'Tarayıcı AAC kodlayıcısı yerine Mediabunny AAC eklentisi kullanılacak.');
        }
      }

      emitDebug({
        stage: 'preparing',
        outputAudioCodec: audioTrack ? 'aac' : null,
        targetVideoBitrate,
        targetAudioBitrate: audioTrack ? AUDIO_BITRATE : null,
        requestedQuality: options.quality,
        keyFrameInterval: qualityOption.keyFrameInterval,
      });
      progress('preparing', 4, 0, duration, 'Dönüşüm hazırlanıyor');

      const target = new BufferTarget();
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target,
      });
      const video: ConversionVideoOptions = {
        codec: 'avc',
        bitrate: targetVideoBitrate,
        hardwareAcceleration: 'no-preference',
        forceTranscode: true,
        keyFrameInterval: qualityOption.keyFrameInterval,
        alpha: 'discard',
      };
      const audio: ConversionAudioOptions | undefined = audioTrack
        ? { codec: 'aac', bitrate: AUDIO_BITRATE, forceTranscode: true }
        : undefined;

      this.conversion = await Conversion.init({
        input: this.input,
        output,
        tracks: 'primary',
        video,
        audio,
        showWarnings: false,
      });

      const discardedTracks = this.conversion.discardedTracks.map(({ track, reason }) => `${track.type}: ${String(reason)}`);
      emitDebug({ stage: 'converting', conversionValid: this.conversion.isValid, discardedTracks });
      if (!this.conversion.isValid) {
        throw new Error(discardedTracks.length ? `Dönüşüm yapılandırması geçersiz: ${discardedTracks.join(', ')}` : 'Dönüşüm yapılandırması geçersiz.');
      }

      const abort = () => void this.conversion?.cancel();
      options.signal?.addEventListener('abort', abort, { once: true });
      this.conversion.onProgress = (fraction, processedTime) => {
        progress('converting', 5 + fraction * 93, processedTime, duration, 'Video dönüştürülüyor');
      };
      try {
        await this.conversion.execute();
      } finally {
        options.signal?.removeEventListener('abort', abort);
      }
      assertActive();

      emitDebug({ stage: 'finalizing' });
      progress('finalizing', 99, duration, duration, 'MP4 dosyası hazırlanıyor');
      const buffer = target.buffer;
      if (!buffer?.byteLength) throw new Error('MP4 çıktısı oluşturulamadı.');
      const blob = new Blob([buffer], { type: 'video/mp4' });
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
      const actualTotalBitrate = duration > 0 ? Math.round((blob.size * 8) / duration) : 0;
      const estimatedAudioBitrate = audioTrack ? AUDIO_BITRATE : 0;
      const actualVideoBitrate = Math.max(0, actualTotalBitrate - estimatedAudioBitrate);
      const bitrateDeviationPercent = targetVideoBitrate > 0
        ? ((actualVideoBitrate - targetVideoBitrate) / targetVideoBitrate) * 100
        : 0;
      const bitrateWithinTolerance = Math.abs(bitrateDeviationPercent) <= BITRATE_TOLERANCE_PERCENT;

      emitDebug({
        stage: 'completed',
        actualVideoBitrate,
        actualTotalBitrate,
        bitrateDeviationPercent,
        bitrateWithinTolerance,
      });
      progress('completed', 100, duration, duration, 'Dönüşüm tamamlandı');
      log('info', 'Encoder', `İstenen ayarlar: ${targetVideoBitrate} bps, H.264, keyframe ${qualityOption.keyFrameInterval} sn, forceTranscode=true.`);
      log('info', 'Converter', `Dönüşüm ${elapsedSeconds.toFixed(2)} saniyede tamamlandı.`);
      log(
        bitrateWithinTolerance ? 'info' : 'warn',
        'Bitrate',
        `Hedef ${targetVideoBitrate} bps, tahmini gerçek video ${actualVideoBitrate} bps, sapma ${bitrateDeviationPercent.toFixed(1)}%.`,
      );

      return {
        blob,
        filename: outputName(options.file.name),
        inputBytes: options.file.size,
        outputBytes: blob.size,
        duration,
        elapsedSeconds,
        averageSpeed: duration / elapsedSeconds,
        targetVideoBitrate,
        actualVideoBitrate,
        actualTotalBitrate,
        bitrateDeviationPercent,
        bitrateWithinTolerance,
        videoCodec: 'H.264 / AVC',
        audioCodec: audioTrack ? 'AAC' : null,
        engine: 'webcodecs',
        source: mediaInfo,
      };
    } catch (error) {
      const normalized = normalizeError(error);
      const cancelled = error instanceof ConversionCanceledError || normalized.name === 'AbortError';
      log(cancelled ? 'warn' : 'error', 'Converter', normalized.message);
      emitDebug({ stage: cancelled ? 'cancelled' : 'error', lastError: normalized.message });
      throw normalized;
    }
  }

  async cleanup(): Promise<void> {
    if (this.conversion) {
      try {
        await this.conversion.cancel();
      } catch {
        // Ignore completed or already-cancelled conversions.
      }
    }
    this.conversion = null;
    this.input?.dispose();
    this.input = null;
  }

  private createDebug(): ConverterDebugInfo {
    return {
      engine: 'webcodecs',
      stage: 'idle',
      mediabunnyVersion: MEDIABUNNY_VERSION,
      mediabunnyApi: 'Conversion',
      ffmpegLoaded: false,
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
