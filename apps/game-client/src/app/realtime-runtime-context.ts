import { createContext, useContext } from 'react';
import type { RealtimeProvider } from '@starville/realtime';

export interface RealtimeRuntimeConfig {
  readonly provider: RealtimeProvider;
  readonly supabase: {
    readonly url: string;
    readonly anonKey: string;
  };
}

export const RealtimeRuntimeContext = createContext<RealtimeRuntimeConfig | undefined>(undefined);

export function useRealtimeRuntimeConfig(): RealtimeRuntimeConfig {
  const config = useContext(RealtimeRuntimeContext);
  return (
    config ?? {
      provider: 'custom',
      supabase: { url: 'http://127.0.0.1:54321', anonKey: 'test-anonymous-key' },
    }
  );
}
