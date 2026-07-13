# Vercel dağıtımı

1. Repo kökünde `src/app`, `package.json` ve `next.config.ts` bulunmalıdır.
2. Node sürümü `.nvmrc` ile 24 olarak sabitlenmiştir.
3. Vercel Framework Preset: Next.js.
4. Build Command: `pnpm build`.
5. Install Command: `pnpm install`.
6. Output Directory boş bırakılır.

FFmpeg çekirdeği tarayıcıda CDN üzerinden yüklenir; sunucuya video yüklenmez.
