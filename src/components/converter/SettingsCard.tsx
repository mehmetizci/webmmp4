'use client';

import { Cpu, Gauge, Zap } from 'lucide-react';
import type { ConversionEngine, QualityPreset } from '@/lib/converters/types';

interface Props {
  engine: ConversionEngine;
  quality: QualityPreset;
  disabled: boolean;
  webCodecsSupported: boolean;
  webCodecsReason?: string;
  onEngine: (engine: ConversionEngine) => void;
  onQuality: (quality: QualityPreset) => void;
}

const qualities: Array<{ value: QualityPreset; title: string; subtitle: string }> = [
  { value: 'low', title: 'Düşük', subtitle: '700 kbps' },
  { value: 'standard', title: 'Standart', subtitle: '1 Mbps' },
  { value: 'high', title: 'Yüksek', subtitle: '1.5 Mbps' },
];

export function SettingsCard({ engine, quality, disabled, webCodecsSupported, webCodecsReason, onEngine, onQuality }: Props) {
  return (
    <section className="card settings-card">
      <div className="section-heading"><Gauge size={20} /><div><strong>Dönüşüm ayarları</strong><span>Kalite ve motor seçimi</span></div></div>
      <div className="settings-group">
        <label>Kalite</label>
        <div className="segmented three">
          {qualities.map((item) => (
            <button key={item.value} type="button" className={quality === item.value ? 'active' : ''} onClick={() => onQuality(item.value)} disabled={disabled}>
              <strong>{item.title}</strong><small>{item.subtitle}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="settings-group">
        <label>Dönüşüm motoru</label>
        <div className="segmented two">
          <button type="button" className={engine === 'webcodecs' ? 'active' : ''} onClick={() => onEngine('webcodecs')} disabled={disabled || !webCodecsSupported} title={webCodecsReason}>
            <Zap size={18} /><strong>WebCodecs</strong><small>Hızlı</small>
          </button>
          <button type="button" className={engine === 'ffmpeg' ? 'active' : ''} onClick={() => onEngine('ffmpeg')} disabled={disabled}>
            <Cpu size={18} /><strong>FFmpeg WASM</strong><small>Uyumlu</small>
          </button>
        </div>
        {!webCodecsSupported && <p className="helper warning">WebCodecs kullanılamıyor: {webCodecsReason ?? 'Desteklenmiyor'}</p>}
      </div>
    </section>
  );
}
