# WebM → MP4 Dönüştürücü

Next.js 16, React 19, TypeScript, Mediabunny 1.50.8 ve FFmpeg WebAssembly ile hazırlanmış, tamamen tarayıcıda çalışan WebM → MP4 dönüştürücü.

## Özellikler

- WebM VP8/VP9 → H.264/AVC MP4
- Opus/Vorbis → AAC
- Mediabunny yüksek seviyeli `Conversion` API
- WebCodecs capability ve codec desteği kontrolü
- FFmpeg WebAssembly fallback
- Motor ve kalite seçimi
- Gerçek zamanlı progress, hız ve kalan süre
- İptal, Wake Lock ve kaynak temizliği
- Mobil uyumlu arayüz
- Teknik debug paneli ve log sistemi
- Node test runner ile saf fonksiyon testleri
- GitHub Actions CI
- Vercel dağıtım ayarları

## Kurulum

```bash
corepack enable
pnpm install
pnpm dev
```

## Kontroller

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

veya:

```bash
pnpm validate
```

## Vercel

Repo Vercel'e bağlandığında Next.js otomatik algılanır. Node 24 `.nvmrc` ve `package.json#engines` ile belirtilmiştir. Ayrıntılar `docs/DEPLOYMENT.md` dosyasındadır.

## Gizlilik

Video dosyası uygulama sunucusuna yüklenmez. WebCodecs, Mediabunny ve FFmpeg WASM işlemleri kullanıcının tarayıcısında yürütür.

## Mimari

- `src/components`: UI bileşenleri
- `src/hooks`: orchestration, wake lock ve object URL yönetimi
- `src/lib/converters`: dönüşüm motorları ve ortak sözleşmeler
- `src/lib/media`: dosya doğrulama, capability ve indirme yardımcıları
- `src/lib/progress`: progress hesapları
- `src/lib/debug`: debug log altyapısı
- `src/lib/errors`: normalize edilmiş hata modeli
- `tests`: hızlı saf fonksiyon testleri
- `docs`: mimari, tarayıcı desteği, test ve dağıtım belgeleri

## Bilinen sınırlar

Tarayıcı tabanlı dönüşüm performansı ve maksimum dosya boyutu cihazın belleğine, codec donanım desteğine ve tarayıcı uygulamasına bağlıdır. iOS ve Firefox'ta gerçek destek çalışma anında kontrol edilir; gerektiğinde FFmpeg fallback sunulur.
