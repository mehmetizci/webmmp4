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
const STARTUP_GRACE_MS = 120_000;
const INACTIVITY_TIMEOUT_MS = 90_000;
const ABSOLUTE_TIMEOUT_MS = 30 * 60_000;

function outputName(inputName: string): string {
  return `${inputName.replace(/\.webm$/i, '')}.mp4`;
}

function parseClock(value: string): number | null {
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function parseProgressSeconds(message: string, duration: number): number | null {
  const outTimeUs = message.match(/(?:^|\s)out_time_us=(\d+)/i);
  if (outTimeUs) return Number(outTimeUs[1]) / 1_000_000;

  // FFmpeg's out_time_ms is historically expressed in microseconds despite its name.
  const outTimeMs = message.match(/(?:^|\s)out_time_ms=(\d+)/i);
  if (outTimeMs) {
    const raw = Number(outTimeMs[1]);
    if (!Number.isFinite(raw)) return null;
    const microsecondsValue = raw / 1_000_000;
    const millisecondsValue = raw / 1_000;
    return microsecondsValue <= duration * 1.25 + 1 ? microsecondsValue : millisecondsValue;
  }

  const outTime = message.match(/(?:^|\s)out_time=([^\s]+)/i);
  if (outTime) return parseClock(outTime[1]);

  const statsTime = message.match(/(?:^|\s)time=(\d+:\d{2}:\d{2}(?:\.\d+)?)/i);
  if (statsTime) return parseClock(statsTime[1]);

  return null;
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

    let listenersAttached = false;
    let abortAttached = false;
    let watchdogTimer: ReturnType<typeof setInterval> | null = null;
    let absoluteTimer: ReturnType<typeof setTimeout> | null = null;
    let rejectWatchdog: ((reason?: unknown) => void) | null = null;
    let lastActivityAt = Date.now();
    let lastProcessedSeconds = 0;
    let lastPercent = 8;
    let conversionStartedAt = 0;

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

    const updateEncodingProgress = (processedSeconds: number, duration: number) => {
      const processed = Math.max(lastProcessedSeconds, Math.min(processedSeconds, duration));
      lastProcessedSeconds = processed;
      const ratio = duration > 0 ? Math.max(0, Math.min(1, processed / duration)) : 0;
      lastPercent = Math.max(lastPercent, 8 + ratio * 90);
      progress('converting', lastPercent, processed, duration, 'FFmpeg ile dönüştürülüyor');
    };

    const onProgress = ({ progress: value, time }: { progress: number; time: number }) => {
      lastActivityAt = Date.now();
      const processed = Number.isFinite(time) ? time / 1_000_000 : 0;
      if (processed > 0) updateEncodingProgress(processed, currentDuration);
      else if (Number.isFinite(value)) {
        lastPercent = Math.max(lastPercent, 8 + Math.max(0, Math.min(1, value)) * 90);
        progress('converting', lastPercent, lastProcessedSeconds, currentDuration, 'FFmpeg ile dönüştürülüyor');
      }
    };

    let currentDuration = 0;
    const onLog = ({ message }: { message: string }) => {
      lastActivityAt = Date.now();
      const parsed = parseProgressSeconds(message, currentDuration);
      if (parsed !== null && parsed >= 0) updateEncodingProgress(parsed, currentDuration);
      if (/progress=end/i.test(message)) {
        lastPercent = Math.max(lastPercent, 98);
        progress('converting', 98, currentDuration, currentDuration, 'FFmpeg kodlaması tamamlandı');
      }
      if (/error|invalid|failed|cannot|out of memory/i.test(message)) log('warn', 'FFmpeg', message);
    };

    const abort = () => {
      if (this.ffmpeg) this.ffmpeg.terminate();
      this.ffmpeg = null;
      this.loaded = false;
      rejectWatchdog?.(new DOMException('Dönüşüm iptal edildi.', 'AbortError'));
    };

    try {
      emitDebug({ stage: 'analyzing' });
      progress('analyzing', 1, 0, 0, 'Video analiz ediliyor');
      const info = await analyzeMedia(options.file);
      currentDuration = info.duration;
      options.onInfo?.(info);
      const targetVideoBitrate = getVideoBitrate(options.quality);
      emitDebug({
        inputVideoCodec: info.videoCodec,
        inputVideoCodecString: info.videoCodecString,
        inputAudioCodec: info.audioCodec,
        outputAudioCodec: info.hasAudio ? 'aac' : null,
        targetVideoBitrate,
        targetAudioBitrate: info.hasAudio ? AUDIO_BITRATE : null,
        requestedQuality: options.quality,
        keyFrameInterval: 2,
      });

      emitDebug({ stage: 'loading-engine' });
      progress('loading-engine', 3, 0, info.duration, 'FFmpeg hazırlanıyor');
      await this.ensureLoaded(log);
      emitDebug({ ffmpegLoaded: true, stage: 'preparing' });
      if (!this.ffmpeg) throw new Error('FFmpeg başlatılamadı.');
      if (options.signal?.aborted) throw new DOMException('Dönüşüm iptal edildi.', 'AbortError');

      progress('preparing', 5, 0, info.duration, 'Dosya FFmpeg belleğine aktarılıyor');
      await this.ffmpeg.writeFile(inputName, await fetchFile(options.file));
      lastActivityAt = Date.now();

      this.ffmpeg.on('progress', onProgress);
      this.ffmpeg.on('log', onLog);
      listenersAttached = true;
      options.signal?.addEventListener('abort', abort, { once: true });
      abortAttached = true;

      const args = [
        '-y',
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-threads', '1',
        '-b:v', String(targetVideoBitrate),
        '-maxrate', String(Math.round(targetVideoBitrate * 1.1)),
        '-bufsize', String(targetVideoBitrate * 2),
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ];
      if (info.hasAudio) args.push('-c:a', 'aac', '-b:a', String(AUDIO_BITRATE));
      else args.push('-an');
      args.push('-progress', 'pipe:1', outputFile);

      log('info', 'FFmpeg', `Komut: ffmpeg ${args.join(' ')}`);
      emitDebug({ stage: 'converting' });
      progress('converting', 8, 0, info.duration, 'FFmpeg ile dönüştürülüyor');
      conversionStartedAt = Date.now();
      lastActivityAt = conversionStartedAt;

      const watchdogPromise = new Promise<never>((_, reject) => {
        rejectWatchdog = reject;
        watchdogTimer = setInterval(() => {
          const now = Date.now();
          const sinceStart = now - conversionStartedAt;
          const sinceActivity = now - lastActivityAt;
          if (sinceStart > STARTUP_GRACE_MS && sinceActivity > INACTIVITY_TIMEOUT_MS) {
            if (this.ffmpeg) this.ffmpeg.terminate();
            this.ffmpeg = null;
            this.loaded = false;
            reject(new Error('FFmpeg 90 saniyedir ilerleme üretmiyor. İşlem durduruldu.'));
          }
        }, 5_000);
        absoluteTimer = setTimeout(() => {
          if (this.ffmpeg) this.ffmpeg.terminate();
          this.ffmpeg = null;
          this.loaded = false;
          reject(new Error('FFmpeg dönüşümü 30 dakikalık güvenlik sınırını aştı.'));
        }, ABSOLUTE_TIMEOUT_MS);
      });

      const code = await Promise.race([this.ffmpeg.exec(args), watchdogPromise]);
      if (code !== 0) throw new Error(`FFmpeg dönüşümü başarısız oldu (kod: ${code}).`);

      emitDebug({ stage: 'finalizing' });
      progress('finalizing', 99, info.duration, info.duration, 'MP4 dosyası hazırlanıyor');
      const data = await this.ffmpeg.readFile(outputFile);
      if (typeof data === 'string') throw new Error('FFmpeg geçersiz çıktı döndürdü.');
      const bytes = new Uint8Array(data);
      const blob = new Blob([bytes], { type: 'video/mp4' });
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
      const actualTotalBitrate = info.duration > 0 ? Math.round((blob.size * 8) / info.duration) : 0;
      const actualVideoBitrate = Math.max(0, actualTotalBitrate - (info.hasAudio ? AUDIO_BITRATE : 0));
      const bitrateDeviationPercent = targetVideoBitrate > 0
        ? ((actualVideoBitrate - targetVideoBitrate) / targetVideoBitrate) * 100
        : 0;
      const bitrateWithinTolerance = Math.abs(bitrateDeviationPercent) <= 15;
      emitDebug({
        stage: 'completed',
        actualVideoBitrate,
        actualTotalBitrate,
        bitrateDeviationPercent,
        bitrateWithinTolerance,
      });
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
        actualVideoBitrate,
        actualTotalBitrate,
        bitrateDeviationPercent,
        bitrateWithinTolerance,
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
      if (cancelled && normalized.name !== 'AbortError') {
        throw new DOMException('Dönüşüm iptal edildi.', 'AbortError');
      }
      throw normalized;
    } finally {
      rejectWatchdog = null;
      if (watchdogTimer) clearInterval(watchdogTimer);
      if (absoluteTimer) clearTimeout(absoluteTimer);
      if (abortAttached) options.signal?.removeEventListener('abort', abort);
      if (listenersAttached && this.ffmpeg) {
        this.ffmpeg.off('progress', onProgress);
        this.ffmpeg.off('log', onLog);
      }
      await this.safeDelete(inputName);
      await this.safeDelete(outputFile);
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
