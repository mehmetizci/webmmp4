'use client';
import { Gauge } from 'lucide-react';
import type { ConversionEngine, QualityPreset } from '@/lib/converters/types';
import { EngineSelector } from './EngineSelector';
import { QualitySelector } from './QualitySelector';
import { SupportNotice } from './SupportNotice';

interface Props {
  engine: ConversionEngine; quality: QualityPreset; disabled: boolean;
  webCodecsSupported: boolean; webCodecsReason?: string;
  onEngine: (engine: ConversionEngine) => void; onQuality: (quality: QualityPreset) => void;
}
export function SettingsCard({ engine, quality, disabled, webCodecsSupported, webCodecsReason, onEngine, onQuality }: Props) {
  return <section className="card settings-card">
    <div className="section-heading"><Gauge size={20}/><div><strong>Dönüşüm ayarları</strong><span>Kalite ve motor seçimi</span></div></div>
    <div className="settings-group"><label>Kalite</label><QualitySelector value={quality} onChange={onQuality} disabled={disabled}/></div>
    <div className="settings-group"><label>Dönüşüm motoru</label><EngineSelector value={engine} onChange={onEngine} disabled={disabled} webCodecsSupported={webCodecsSupported}/><SupportNotice reason={!webCodecsSupported ? webCodecsReason : undefined}/></div>
  </section>;
}
