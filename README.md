# WebM → MP4 Dönüştürücü

Tarayıcı içinde çalışan, dosyayı sunucuya göndermeden WebM videolarını MP4'e dönüştüren Next.js uygulaması.

## Mimari

- **Birincil motor:** Mediabunny 1.50.8 `Conversion` API + WebCodecs
- **Fallback:** FFmpeg WebAssembly 0.12
- **Video:** VP8/VP9 → H.264 / AVC
- **Ses:** Opus/Vorbis → AAC
- **Çıktı:** MP4 (`fastStart: in-memory`)

Mediabunny tarafında manuel frame döngüsü kullanılmaz. Yüksek seviyeli `Conversion` API dahili pipeline ve backpressure yönetimini yürütür. `forceTranscode: true` ve sayısal bitrate ile kalite presetleri gerçek transcode ayarlarına uygulanır.

## Komutlar

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
```

## Kalite presetleri

- Düşük: 700 kbps
- Standart: 1 Mbps
- Yüksek: 1.5 Mbps

AAC için tarayıcının yerel encoder'ı yoksa `@mediabunny/aac-encoder` devreye girer.

## Notlar

- WebCodecs kullanılabilmesi için HTTPS gerekir.
- FFmpeg çekirdeği yalnız fallback seçildiğinde CDN üzerinden indirilir (~31 MB).
- Büyük dosyalarda cihaz belleği ve tarayıcı limitleri geçerlidir.
