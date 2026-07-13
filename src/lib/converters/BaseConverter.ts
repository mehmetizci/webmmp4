import type { Converter } from './types';
export abstract class BaseConverter implements Converter {
  abstract checkSupport(): Promise<{ supported: boolean; reason?: string }>;
  abstract convert(options: Parameters<Converter['convert']>[0]): ReturnType<Converter['convert']>;
  abstract cleanup(): Promise<void>;
}
