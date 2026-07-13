# WebM → MP4

Tarayıcı içinde çalışan WebM → MP4 dönüştürücü.

- Mediabunny 1.50.8 yüksek seviyeli `Conversion` API
- WebCodecs ile VP8/VP9 → H.264/AVC
- Ses varsa Opus/Vorbis → AAC
- FFmpeg WebAssembly fallback
- Kalite profilleri yalnızca hedef video bitrate değerini değiştirir
- Dosya sunucuya yüklenmez

## Geliştirme

```bash
npm install
npm run dev
```

## Kontroller

```bash
npm run typecheck
npm run lint
npm run build
```

FFmpeg fallback ilk kullanımda resmi ffmpeg.wasm çekirdeğini CDN üzerinden indirir (~31 MB).
