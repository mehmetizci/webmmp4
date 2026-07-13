'use client';

import { ArrowRight } from 'lucide-react';
import { DebugPanel } from './converter/DebugPanel';
import { ErrorDialog } from './converter/ErrorDialog';
import { Header } from './converter/Header';
import { PrivacyCard } from './converter/PrivacyCard';
import { ProgressCard } from './converter/ProgressCard';
import { ResultCard } from './converter/ResultCard';
import { SettingsCard } from './converter/SettingsCard';
import { UploadCard } from './converter/UploadCard';
import { useConverter } from '@/hooks/useConverter';
import { useObjectUrl } from '@/hooks/useObjectUrl';

export function ConverterApp() {
  const converter = useConverter();
  const resultUrl = useObjectUrl(converter.result?.blob ?? null);

  return <main className="page-shell">
    <div className="container">
      <Header />
      {!converter.result && <>
        <UploadCard file={converter.file} disabled={converter.isBusy} onSelect={converter.chooseFile} onClear={() => converter.chooseFile(null)} />
        {converter.file && !converter.isBusy && <SettingsCard
          engine={converter.engine}
          quality={converter.quality}
          disabled={converter.isBusy}
          webCodecsSupported={converter.webCodecsSupport.supported}
          webCodecsReason={converter.webCodecsSupport.reason}
          onEngine={converter.setEngine}
          onQuality={converter.setQuality}
        />}
        {converter.file && !converter.isBusy && <button className="button primary convert-button" type="button" onClick={() => void converter.run()}>
          MP4&apos;e Dönüştür <ArrowRight size={20} />
        </button>}
        {converter.isBusy && <ProgressCard progress={converter.progress} mediaInfo={converter.mediaInfo} onCancel={converter.cancel} />}
      </>}
      {converter.result && <ResultCard result={converter.result} url={resultUrl} onReset={() => void converter.startOver()} />}
      <DebugPanel debug={converter.debug} mediaInfo={converter.mediaInfo} />
      <PrivacyCard />
    </div>
    {converter.error && <ErrorDialog message={converter.error} canFallback={converter.fallbackAvailable} onClose={converter.clearError} onFallback={() => { converter.clearError(); void converter.run('ffmpeg'); }} />}
  </main>;
}
