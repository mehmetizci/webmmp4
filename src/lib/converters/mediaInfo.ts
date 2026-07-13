import { ALL_FORMATS, BlobSource, Input, type InputVideoTrack } from 'mediabunny';
import type { MediaInfo } from './types';

function positive(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

async function getFrameRate(track: InputVideoTrack): Promise<number | null> {
  try {
    const stats = await track.computePacketStats(180);
    return positive(stats.averagePacketRate, 0) || null;
  } catch {
    return null;
  }
}

export async function analyzeMedia(file: File): Promise<MediaInfo> {
  const input = new Input({ source: new BlobSource(file, { useStreamReader: true }), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('Dosyada kullanılabilir video parçası bulunamadı.');
    const audioTrack = await input.getPrimaryAudioTrack();
    const [width, height, videoCodec, videoCodecString, durationMetadata, frameRate, audioCodec] = await Promise.all([
      videoTrack.getDisplayWidth(),
      videoTrack.getDisplayHeight(),
      videoTrack.getCodec(),
      videoTrack.getCodecParameterString(),
      input.getDurationFromMetadata(),
      getFrameRate(videoTrack),
      audioTrack ? audioTrack.getCodec() : Promise.resolve(null),
    ]);
    return {
      duration: positive(durationMetadata, await videoTrack.computeDuration()),
      width,
      height,
      frameRate,
      videoCodec,
      videoCodecString,
      audioCodec,
      hasAudio: Boolean(audioTrack),
    };
  } finally {
    input.dispose();
  }
}
