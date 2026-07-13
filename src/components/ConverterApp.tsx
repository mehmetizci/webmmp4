'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileVideo2,
  Gauge,
  LoaderCircle,
  LockKeyhole,
  RefreshCcw,
  RotateCcw,
  UploadCloud,
  X,
} from 'lucide-react';
import { FFmpegConverter } from '@/lib/converters/FFmpegConverter';
import { WebCodecsConverter } from '@/lib/converters/WebCodecsConverter';
import { QUALITY_OPTIONS } from '@/lib/converters/quality';
import type {
  ConversionEngine,
  ConversionProgress,
  ConversionResult,
  Converter,
  ConverterDebugInfo,
  MediaInfo,
  QualityPreset,
} from '@/lib/converters/types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function stageLabel(progress: ConversionProgress | null): string {
  if (!progress) return '';
  return progress.message;
}

function userFacingError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/decod|decoder|codec.*çözülemiyor/i.test(message)) {
    return 'Bu video tarayıcınızdaki WebCodecs çözücüsüyle işlenemedi.';
  }
  if (/cancel|iptal/i.test(message)) return 'Dönüşüm iptal edildi.';
  return message || 'Dönüşüm tamamlanamadı.';
}

export default function ConverterApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const converters = useMemo<Record<ConversionEngine, Converter>>(
    () => ({ webcodecs: new WebCodecsConverter(), ffmpeg: new FFmpegConverter() }),
    [],
  );

  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState<QualityPreset>('standard');
  const [engine, setEngine] = useState<ConversionEngine>('webcodecs');
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [progress, setProgress] = useState<ConversionProgress | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [debug, setDebug] = useState<ConverterDebugInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [technicalError, setTechnicalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [support, setSupport] = useState({ webcodecs: 'Kontrol ediliyor…', ffmpeg: 'Kontrol ediliyor…' });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      converters.webcodecs.checkSupport(),
      converters.ffmpeg.checkSupport(),
    ]).then(([webcodecs, ffmpeg]) => {
      setSupport({
        webcodecs: webcodecs.supported ? 'Hazır' : webcodecs.reason ?? 'Desteklenmiyor',
        ffmpeg: ffmpeg.supported ? 'Hazır' : ffmpeg.reason ?? 'Desteklenmiyor',
      });
      if (!webcodecs.supported && ffmpeg.supported) setEngine('ffmpeg');
    });
    return () => {
      abortRef.current?.abort();
      for (const converter of Object.values(converters)) void converter.cleanup();
    };
  }, [converters]);

  useEffect(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const next = result ? URL.createObjectURL(result.blob) : null;
    setObjectUrl(next);
    return () => {
      if (next) URL.revokeObjectURL(next);
    };
    // objectUrl is intentionally omitted; the previous URL is revoked above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const chooseFile = (next: File | undefined) => {
    if (!next) return;
    if (!next.name.toLowerCase().endsWith('.webm') && next.type !== 'video/webm') {
      setError('Lütfen WebM biçiminde bir video seçin.');
      return;
    }
    setFile(next);
    setResult(null);
    setInfo(null);
    setProgress(null);
    setDebug(null);
    setError(null);
    setTechnicalError(null);
    setFallbackOpen(false);
  };

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      // Wake Lock is optional.
    }
  };

  const releaseWakeLock = async () => {
    try {
      await wakeLockRef.current?.release();
    } finally {
      wakeLockRef.current = null;
    }
  };

  const runConversion = async (selectedEngine: ConversionEngine) => {
    if (!file || busy) return;
    setBusy(true);
    setEngine(selectedEngine);
    setError(null);
    setTechnicalError(null);
    setResult(null);
    setFallbackOpen(false);
    setProgress(null);
    setDebug(null);
    abortRef.current = new AbortController();
    await requestWakeLock();

    try {
      const converted = await converters[selectedEngine].convert({
        file,
        quality,
        signal: abortRef.current.signal,
        onInfo: setInfo,
        onProgress: setProgress,
        onDebug: setDebug,
      });
      setResult(converted);
    } catch (caught) {
      const technical = caught instanceof Error ? caught.message : String(caught);
      setTechnicalError(technical);
      if (abortRef.current.signal.aborted) {
        setError('Dönüşüm iptal edildi.');
      } else if (selectedEngine === 'webcodecs') {
        setError(userFacingError(caught));
        setFallbackOpen(true);
      } else {
        setError(userFacingError(caught));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      await releaseWakeLock();
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setFile(null);
    setInfo(null);
    setProgress(null);
    setResult(null);
    setDebug(null);
    setError(null);
    setTechnicalError(null);
    setFallbackOpen(false);
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <span className="eyebrow">MEDIABUNNY 1.50.8 · CONVERSION API</span>
        <h1>WebM dosyanızı MP4’e dönüştürün</h1>
        <p>Videonuzu yükleyin; H.264 MP4 çıktısını doğrudan cihazınızda oluşturup indirin.</p>
        <div className="privacy"><LockKeyhole size={20} /> Dosyanız cihazınızdan ayrılmaz · Sunucuya yüklenmez</div>
      </section>

      <section className="card">
        {!file ? (
          <button
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              chooseFile(event.dataTransfer.files[0]);
            }}
          >
            <UploadCloud size={42} />
            <strong>WebM videonuzu seçin</strong>
            <span>Dosya seçmek için dokunun veya buraya sürükleyin</span>
            <small>Dosya boyutu cihazınızın kullanılabilir belleğiyle sınırlıdır.</small>
          </button>
        ) : (
          <div className="file-row">
            <div className="file-icon"><FileVideo2 /></div>
            <div>
              <strong>{file.name}</strong>
              <span>{formatBytes(file.size)}{info ? ` · ${formatTime(info.duration)} · ${info.width}×${info.height}` : ''}</span>
            </div>
            {!busy && <button className="icon-button" onClick={reset} aria-label="Dosyayı kaldır"><X /></button>}
          </div>
        )}
        <input ref={inputRef} hidden type="file" accept="video/webm,.webm" onChange={(event) => chooseFile(event.target.files?.[0])} />

        <div className="section-title"><span>Kalite</span><small>Sadece hedef bitrate değişir</small></div>
        <div className="quality-grid">
          {(Object.entries(QUALITY_OPTIONS) as [QualityPreset, (typeof QUALITY_OPTIONS)[QualityPreset]][]).map(([value, option]) => (
            <button key={value} className={quality === value ? 'quality active' : 'quality'} onClick={() => setQuality(value)} disabled={busy}>
              <strong>{option.label}</strong><span>{option.detail}</span>
            </button>
          ))}
        </div>

        <div className="section-title"><span>Dönüşüm motoru</span><small>WebCodecs önerilir</small></div>
        <div className="engine-grid">
          <button className={engine === 'webcodecs' ? 'engine active' : 'engine'} onClick={() => setEngine('webcodecs')} disabled={busy}>
            <strong>WebCodecs</strong><span>Güncel Mediabunny Conversion API</span><em>{support.webcodecs}</em>
          </button>
          <button className={engine === 'ffmpeg' ? 'engine active' : 'engine'} onClick={() => setEngine('ffmpeg')} disabled={busy}>
            <strong>FFmpeg WASM</strong><span>Daha geniş tarayıcı uyumluluğu</span><em>{support.ffmpeg}</em>
          </button>
        </div>

        {progress && busy && (
          <div className="progress-box">
            <div className="progress-head"><span>{stageLabel(progress)}</span><strong>%{progress.percent}</strong></div>
            <div className="progress-track"><div style={{ width: `${progress.percent}%` }} /></div>
            <div className="progress-stats">
              <span>İşlenen: {formatTime(progress.processedSeconds)} / {formatTime(progress.totalSeconds)}</span>
              <span>Hız: {progress.speed ? `${progress.speed.toFixed(2)}x` : 'Hesaplanıyor'}</span>
            </div>
            {progress.stage === 'loading-engine' && <p className="progress-note">FFmpeg ilk kullanımda yaklaşık 31 MB çekirdek indirir.</p>}
          </div>
        )}

        {error && !fallbackOpen && <div className="error-box"><AlertTriangle /> <span>{error}</span></div>}

        {!result ? (
          <div className="actions">
            <button className="primary" disabled={!file || busy} onClick={() => void runConversion(engine)}>
              {busy ? <><LoaderCircle className="spin" /> Dönüştürülüyor</> : 'MP4’e Dönüştür'}
            </button>
            {busy && <button className="secondary" onClick={() => abortRef.current?.abort()}>İptal et</button>}
          </div>
        ) : (
          <div className="result">
            <CheckCircle2 size={46} />
            <h2>Dönüşüm tamamlandı</h2>
            <p>{result.filename}</p>
            <div className="result-badges"><span>{result.engine === 'webcodecs' ? 'Mediabunny' : 'FFmpeg WASM'}</span><span>H.264 MP4</span></div>
            <div className="summary">
              <div><span>Girdi</span><strong>{formatBytes(result.inputBytes)}</strong></div>
              <div><span>Çıktı</span><strong>{formatBytes(result.outputBytes)}</strong></div>
              <div><span>Video süresi</span><strong>{formatTime(result.duration)}</strong></div>
              <div><span>Dönüşüm</span><strong>{result.elapsedSeconds.toFixed(1)} sn</strong></div>
              <div><span>Ortalama hız</span><strong>{result.averageSpeed.toFixed(2)}x</strong></div>
              <div><span>Toplam bitrate</span><strong>{(result.actualTotalBitrate / 1_000_000).toFixed(2)} Mbps</strong></div>
            </div>
            <div className="actions">
              <a className="primary" href={objectUrl ?? undefined} download={result.filename}><Download /> MP4 Dosyasını İndir</a>
              <button className="secondary" onClick={reset}><RotateCcw /> Yeni Video</button>
            </div>
          </div>
        )}
      </section>

      <details className="debug-card">
        <summary><Gauge size={18} /> Teknik bilgiler <ChevronDown size={18} /></summary>
        <div className="debug-grid">
          <div><span>Motor</span><strong>{debug?.engine ?? engine}</strong></div>
          <div><span>Mediabunny API</span><strong>{debug?.mediabunnyApi ?? '—'}</strong></div>
          <div><span>Giriş video</span><strong>{debug?.inputVideoCodecString ?? debug?.inputVideoCodec ?? '—'}</strong></div>
          <div><span>Giriş ses</span><strong>{debug?.inputAudioCodec ?? 'Yok / bilinmiyor'}</strong></div>
          <div><span>Hedef bitrate</span><strong>{debug?.targetVideoBitrate ? `${(debug.targetVideoBitrate / 1_000_000).toFixed(2)} Mbps` : '—'}</strong></div>
          <div><span>Aşama</span><strong>{debug?.stage ?? 'idle'}</strong></div>
        </div>
        {debug?.lastError && <pre>{debug.lastError}</pre>}
        {debug?.logs.length ? (
          <div className="log-list">
            {debug.logs.map((entry, index) => <div key={`${entry.at}-${index}`}><time>{new Date(entry.at).toLocaleTimeString('tr-TR')}</time><b>[{entry.scope}]</b><span>{entry.message}</span></div>)}
          </div>
        ) : null}
      </details>

      <section className="security-card">
        <CheckCircle2 />
        <div><strong>Videonuz güvende</strong><p>Seçtiğiniz video sunucuya gönderilmez; dönüşüm cihazınızın tarayıcısında gerçekleştirilir.</p></div>
      </section>

      {fallbackOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="fallback-title">
          <div className="modal-card">
            <div className="warning-icon"><AlertTriangle /></div>
            <h2 id="fallback-title">WebCodecs tamamlanamadı</h2>
            <p>{error} FFmpeg WebAssembly ile yeniden deneyebilirsiniz.</p>
            {technicalError && <code>{technicalError}</code>}
            <div className="modal-actions">
              <button className="secondary" onClick={() => setFallbackOpen(false)}><X /> Vazgeç</button>
              <button className="primary" onClick={() => void runConversion('ffmpeg')}><RefreshCcw /> FFmpeg ile tekrar dene</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
