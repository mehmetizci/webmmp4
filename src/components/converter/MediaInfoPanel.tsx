import type { MediaInfo } from '@/lib/converters/types';
export function MediaInfoPanel({ info }: { info: MediaInfo | null }) { if (!info) return null; return <div className="media-info"><span>{info.width}×{info.height}</span><span>{info.duration.toFixed(1)} sn</span><span>{info.videoCodecString ?? info.videoCodec}</span><span>{info.hasAudio ? info.audioCodec ?? 'Ses' : 'Ses yok'}</span></div>; }
