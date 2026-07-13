'use client';

import { Bug, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { ConverterDebugInfo, MediaInfo } from '@/lib/converters/types';
import { formatBitrate } from '@/lib/utils/format';
import { LogViewer } from './LogViewer';

function formatDeviation(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function DebugPanel({ debug, mediaInfo }: { debug: ConverterDebugInfo | null; mediaInfo: MediaInfo | null }) {
  const [open, setOpen] = useState(false);
  if (!debug) return null;

  return <section className="card debug-card">
    <button className="debug-toggle" type="button" onClick={() => setOpen((value) => !value)}>
      <span><Bug size={18}/> Teknik Bilgiler</span>
      {open ? <ChevronUp size={18}/> : <ChevronDown size={18}/>} 
    </button>
    {open && <div className="debug-content">
      <div className="debug-grid">
        <div><span>Motor</span><strong>{debug.engine}</strong></div>
        <div><span>Aşama</span><strong>{debug.stage}</strong></div>
        <div><span>Mediabunny</span><strong>{debug.mediabunnyVersion ?? '—'}</strong></div>
        <div><span>API</span><strong>{debug.mediabunnyApi ?? 'Uygulanmadı'}</strong></div>
        <div><span>Giriş codec</span><strong>{debug.inputVideoCodecString ?? debug.inputVideoCodec ?? '—'}</strong></div>
        <div><span>Ses codec</span><strong>{debug.inputAudioCodec ?? 'Yok'}</strong></div>
        <div><span>Çözünürlük</span><strong>{mediaInfo ? `${mediaInfo.width}×${mediaInfo.height}` : '—'}</strong></div>
        <div><span>FPS</span><strong>{mediaInfo?.frameRate?.toFixed(2) ?? '—'}</strong></div>
        <div><span>Kalite</span><strong>{debug.requestedQuality ?? '—'}</strong></div>
        <div><span>Hedef video bitrate</span><strong>{formatBitrate(debug.targetVideoBitrate)}</strong></div>
        <div><span>Gerçek video bitrate</span><strong>{formatBitrate(debug.actualVideoBitrate)}</strong></div>
        <div><span>Toplam bitrate</span><strong>{formatBitrate(debug.actualTotalBitrate)}</strong></div>
        <div><span>Bitrate sapması</span><strong>{formatDeviation(debug.bitrateDeviationPercent)}</strong></div>
        <div><span>Tolerans</span><strong>{debug.bitrateWithinTolerance === null ? '—' : debug.bitrateWithinTolerance ? 'Uygun' : 'Hedef dışı'}</strong></div>
        <div><span>Keyframe aralığı</span><strong>{debug.keyFrameInterval ? `${debug.keyFrameInterval} sn` : '—'}</strong></div>
        <div><span>Force transcode</span><strong>{debug.forceTranscode ? 'Evet' : 'Hayır'}</strong></div>
        <div><span>Donanım tercihi</span><strong>{debug.hardwareAcceleration}</strong></div>
      </div>
      {debug.bitrateWithinTolerance === false && (
        <div className="debug-error">Mediabunny/WebCodecs çıktısı hedef video bitrate değerinden belirgin biçimde saptı. Bu cihazda kesin bitrate gerekiyorsa FFmpeg motorunu kullanın.</div>
      )}
      {debug.lastError && <div className="debug-error">{debug.lastError}</div>}
      <LogViewer logs={debug.logs}/>
    </div>}
  </section>;
}
