'use client';

import { CheckCircle2, Download, RefreshCcw } from 'lucide-react';
import type { ConversionResult } from '@/lib/converters/types';
import { formatBitrate, formatBytes, formatDuration, percentSaved } from '@/lib/utils/format';

export function ResultCard({ result, url, onReset }: { result: ConversionResult; url: string | null; onReset: () => void }) {
  return (
    <section className="card result-card">
      <div className="success-icon"><CheckCircle2 size={34} /></div>
      <h2>Dönüşüm tamamlandı</h2>
      <p className="result-name">{result.filename}</p>
      <div className="result-tags"><span>{formatBytes(result.outputBytes)}</span><span>{formatDuration(result.duration)}</span><span>{result.engine === 'webcodecs' ? 'Mediabunny / WebCodecs' : 'FFmpeg WASM'}</span></div>
      <div className="summary-grid">
        <div><span>Girdi</span><strong>{formatBytes(result.inputBytes)}</strong></div>
        <div><span>Çıktı</span><strong>{formatBytes(result.outputBytes)}</strong></div>
        <div><span>Sıkıştırma</span><strong>%{percentSaved(result.inputBytes, result.outputBytes)}</strong></div>
        <div><span>Süre</span><strong>{result.elapsedSeconds.toFixed(1)} sn</strong></div>
        <div><span>Ortalama hız</span><strong>{result.averageSpeed.toFixed(2)}x</strong></div>
        <div><span>Video bitrate</span><strong>{formatBitrate(result.actualVideoBitrate)}</strong></div>
        <div><span>Bitrate sapması</span><strong>{result.bitrateDeviationPercent > 0 ? '+' : ''}{result.bitrateDeviationPercent.toFixed(1)}%</strong></div>
      </div>
      <div className="button-row">
        <a className={`button primary ${url ? '' : 'disabled'}`} href={url ?? undefined} download={result.filename}><Download size={19} /> MP4 Dosyasını İndir</a>
        <button type="button" className="button secondary" onClick={onReset}><RefreshCcw size={18} /> Yeni Video</button>
      </div>
    </section>
  );
}
