'use client';

import { Bug, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { ConverterDebugInfo, MediaInfo } from '@/lib/converters/types';
import { formatBitrate } from '@/lib/utils/format';

export function DebugPanel({ debug, mediaInfo }: { debug: ConverterDebugInfo | null; mediaInfo: MediaInfo | null }) {
  const [open, setOpen] = useState(false);
  if (!debug) return null;
  return (
    <section className="card debug-card">
      <button className="debug-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <span><Bug size={18} /> Teknik Bilgiler</span>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
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
          <div><span>Hedef bitrate</span><strong>{formatBitrate(debug.targetVideoBitrate)}</strong></div>
          <div><span>Donanım tercihi</span><strong>{debug.hardwareAcceleration}</strong></div>
        </div>
        {debug.lastError && <div className="debug-error">{debug.lastError}</div>}
        <div className="log-list">{debug.logs.length ? debug.logs.map((entry, index) => <div key={`${entry.at}-${index}`}><time>{new Date(entry.at).toLocaleTimeString('tr-TR')}</time><b>[{entry.scope}]</b><span>{entry.message}</span></div>) : <p>Henüz log yok.</p>}</div>
      </div>}
    </section>
  );
}
