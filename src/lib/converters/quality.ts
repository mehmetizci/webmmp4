import type { QualityPreset } from './types';

export const BITRATE_TOLERANCE_PERCENT = 15;

export interface QualityOption {
  label: string;
  detail: string;
  bitrate: number;
  keyFrameInterval: number;
}

export const QUALITY_OPTIONS: Record<QualityPreset, QualityOption> = {
  low: {
    label: 'Küçük',
    detail: '700 kbps',
    bitrate: 700_000,
    keyFrameInterval: 5,
  },
  standard: {
    label: 'Dengeli',
    detail: '1 Mbps',
    bitrate: 1_000_000,
    keyFrameInterval: 5,
  },
  high: {
    label: 'Yüksek',
    detail: '1.5 Mbps',
    bitrate: 1_500_000,
    keyFrameInterval: 5,
  },
};

export function getQualityOption(preset: QualityPreset): QualityOption {
  return QUALITY_OPTIONS[preset];
}

export function getVideoBitrate(preset: QualityPreset): number {
  return getQualityOption(preset).bitrate;
}
