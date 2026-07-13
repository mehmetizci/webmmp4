import type { QualityPreset } from './types';

export const QUALITY_OPTIONS: Record<QualityPreset, { label: string; detail: string; bitrate: number }> = {
  low: { label: 'Küçük', detail: '700 kbps', bitrate: 700_000 },
  standard: { label: 'Dengeli', detail: '1 Mbps', bitrate: 1_000_000 },
  high: { label: 'Yüksek', detail: '1.5 Mbps', bitrate: 1_500_000 },
};

export function getVideoBitrate(preset: QualityPreset): number {
  return QUALITY_OPTIONS[preset].bitrate;
}
