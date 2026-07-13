import type { QualityPreset } from '@/lib/converters/types';
import { QUALITY_OPTIONS } from '@/lib/converters/quality';
export function QualitySelector({ value, onChange, disabled }: { value: QualityPreset; onChange:(value:QualityPreset)=>void; disabled?: boolean }) { return <div className="quality-grid">{Object.entries(QUALITY_OPTIONS).map(([key,preset])=><button type="button" key={key} disabled={disabled} className={value===key?'active':''} onClick={()=>onChange(key as QualityPreset)}><strong>{preset.label}</strong><small>{preset.detail}</small></button>)}</div>; }
