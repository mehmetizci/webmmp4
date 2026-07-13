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

const CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
const AUDIO_BITRATE = 128_000;

function outputName(inputName: string): string {
  return `${inputName.replace(/\.webm$/i, '')}.mp4`;
}

export class FFmpegConverter implements Converter {
  private ffmpeg: FFmpeg | null = null;
  private loaded = false;
  private debug = this.createDebug();

  async checkSupport(): Promise<{ supported: boolean; reason?: string }> {
    return typeof WebAssembly !== 'undefined'
      ? { supported: true }
      : { supported: false, reason: 'WebAssembly bu tarayıcıda kullanılamıyor.' };
  }

  async convert(options: ConvertOptions): Promise<ConversionResult> {
    const startedAt = performance.now();
    const inputName = `input-${Date.now()}.webm`;
    const outputFile = `output-${Date.now()}.mp4`;
    this.debug = this.createDebug();

    const emitDebug = (patch: Partial<ConverterDebugInfo>) => {
      this.debug = { ...this.debug, ...patch };
      options.onDebug?.(structuredClone(this.debug));
    };
    const log = (level: DebugLogEntry['level'], scope: string, message: string) => {
      emitDebug({ logs: [...this.debug.logs, { at: Date.now(), level, scope, message }].slice(-100) });
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

    try {
      emitDebug({ stage: 'analyzing' });
      progress('analyzing', 1, 0, 0, 'Video analiz ediliyor');
      const info = await analyzeMedia(options.file);
      options.onInfo?.(info);
      const targetVideoBitrate = getVideoBitrate(options.quality);
      emitDebug({
        inputVideoCodec: info.videoCodec,
        inputVideoCodecString: info.videoCodecString,
        inputAudioCodec: info.audioCodec,
        outputAudioCodec: info.hasAudio ? 'aac' : null,
        targetVideoBitrate,
        targetAudioBitrate: info.hasAudio ? AUDIO_BITRATE : null,
      });

      emitDebug({ stage: 'loading-engine' });
      progress('loading-engine', 3, 0, info.duration, 'FFmpeg hazırlanıyor');
      await this.ensureLoaded(log);
      emitDebug({ ffmpegLoaded: true, stage: 'preparing' });
      if (!this.ffmpeg) throw new Error('FFmpeg başlatılamadı.');
      if (options.signal?.aborted) throw new DOMException('Dönüşüm iptal edildi.', 'AbortError');

      await this.ffmpeg.writeFile(inputName, await fetchFile(options.file));
      const onProgress = ({ progress: value, time }: { progress: number; time: number }) => {
        const processed = Math.min(time / 1_000_000, info.duration);
        progress('converting', 8 + Math.max(0, Math.min(1, value)) * 89, processed, info.duration, 'FFmpeg ile dönüştürülüyor');
      };
      const onLog = ({ message }: { message: string }) => {
        if (/error|invalid|failed/i.test(message)) log('warn', 'FFmpeg', message);
      };
      this.ffmpeg.on('progress', onProgress);
      this.ffmpeg.on('log', onLog);
      const abort = () => this.ffmpeg?.terminate();
      options.signal?.addEventListener('abort', abort, { once: true });

      const args = [
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-b:v', String(targetVideoBitrate),
        '-maxrate', String(Math.round(targetVideoBitrate * 1.1)),
        '-bufsize', String(targetVideoBitrate * 2),
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ];
      if (info.hasAudio) args.push('-c:a', 'aac', '-b:a', String(AUDIO_BITRATE));
      else args.push('-an');
      args.push(outputFile);

      emitDebug({ stage: 'converting' });
      const code = await this.ffmpeg.exec(args);
      options.signal?.removeEventListener('abort', abort);
      this.ffmpeg.off('progress', onProgress);
      this.ffmpeg.off('log', onLog);
      if (code !== 0) throw new Error(`FFmpeg dönüşümü başarısız oldu (kod: ${code}).`);

      emitDebug({ stage: 'finalizing' });
      progress('finalizing', 99, info.duration, info.duration, 'MP4 dosyası hazırlanıyor');
      const data = await this.ffmpeg.readFile(outputFile);
      if (typeof data === 'string') throw new Error('FFmpeg geçersiz çıktı döndürdü.');
      const bytes = new Uint8Array(data);
      const blob = new Blob([bytes], { type: 'video/mp4' });
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
      const actualTotalBitrate = info.duration > 0 ? Math.round((blob.size * 8) / info.duration) : 0;
      emitDebug({ stage: 'completed' });
      progress('completed', 100, info.duration, info.duration, 'Dönüşüm tamamlandı');
      await this.safeDelete(inputName);
      await this.safeDelete(outputFile);

      return {
        blob,
        filename: outputName(options.file.name),
        inputBytes: options.file.size,
        outputBytes: blob.size,
        duration: info.duration,
        elapsedSeconds,
        averageSpeed: info.duration / elapsedSeconds,
        targetVideoBitrate,
        actualTotalBitrate,
        videoCodec: 'H.264 / AVC',
        audioCodec: info.hasAudio ? 'AAC' : null,
        engine: 'ffmpeg',
        source: info,
      };
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      const cancelled = normalized.name === 'AbortError' || options.signal?.aborted;
      emitDebug({ stage: cancelled ? 'cancelled' : 'error', lastError: normalized.message });
      log(cancelled ? 'warn' : 'error', 'FFmpeg', normalized.message);
      throw normalized;
    }
  }

  async cleanup(): Promise<void> {
    if (this.ffmpeg) this.ffmpeg.terminate();
    this.ffmpeg = null;
    this.loaded = false;
  }

  private async ensureLoaded(log: (level: DebugLogEntry['level'], scope: string, message: string) => void): Promise<void> {
    if (this.loaded && this.ffmpeg) return;
    this.ffmpeg = new FFmpeg();
    log('info', 'FFmpeg', 'FFmpeg WebAssembly çekirdeği indiriliyor (~31 MB).');
    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    this.loaded = true;
    log('info', 'FFmpeg', 'FFmpeg WebAssembly hazır.');
  }

  private async safeDelete(path: string): Promise<void> {
    try {
      await this.ffmpeg?.deleteFile(path);
    } catch {
      // Cleanup is best effort.
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
      hardwareAcceleration: 'no-preference',
      forceTranscode: true,
      conversionValid: null,
      discardedTracks: [],
      lastError: null,
      logs: [],
    };
  }
}
