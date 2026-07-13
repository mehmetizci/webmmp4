'use client';

import { LoaderCircle, Square } from 'lucide-react';
import type { ConversionProgress, MediaInfo } from '@/lib/converters/types';
import { formatDuration } from '@/lib/utils/format';

export function ProgressCard({ progress, mediaInfo, onCancel }: { progress: ConversionProgress; mediaInfo: MediaInfo | null; onCancel: () => void }) {
  const remaining = progress.speed && progress.totalSeconds > progress.processedSeconds
    ? (progress.totalSeconds - progress.processedSeconds) / progress.speed
    : null;
  return (
    <section className="card progress-card">
      <div className="progress-title"><LoaderCircle className="spin" size={26} /><div><strong>{progress.message}</strong><span>Video cihazınızda işleniyor</span></div><b>{progress.percent}%</b></div>
      <div className="progress-track"><div style={{ width: `${progress.percent}%` }} /></div>
      <div className="metrics-grid">
        <div><span>İşlenen</span><strong>{formatDuration(progress.processedSeconds)} / {formatDuration(progress.totalSeconds || mediaInfo?.duration || 0)}</strong></div>
        <div><span>Geçen süre</span><strong>{formatDuration(progress.elapsedSeconds)}</strong></div>
        <div><span>Hız</span><strong>{progress.speed ? `${progress.speed.toFixed(2)}x` : 'Hesaplanıyor'}</strong></div>
        <div><span>Kalan</span><strong>{remaining ? formatDuration(remaining) : 'Hesaplanıyor'}</strong></div>
      </div>
      <button type="button" className="button secondary full" onClick={onCancel}><Square size={17} /> İptal Et</button>
    </section>
  );
}
