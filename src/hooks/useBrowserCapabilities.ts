'use client';
import { useState } from 'react';
import { getBrowserCapabilities, type BrowserCapabilities } from '@/lib/media/browserCapabilities';
export function useBrowserCapabilities(): BrowserCapabilities {
  const [capabilities] = useState<BrowserCapabilities>(() => getBrowserCapabilities());
  return capabilities;
}
