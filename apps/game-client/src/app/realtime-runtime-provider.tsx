import type { ReactNode } from 'react';

import { RealtimeRuntimeContext, type RealtimeRuntimeConfig } from './realtime-runtime-context';

export function RealtimeRuntimeProvider({
  config,
  children,
}: {
  readonly config: RealtimeRuntimeConfig;
  readonly children: ReactNode;
}) {
  return (
    <RealtimeRuntimeContext.Provider value={config}>{children}</RealtimeRuntimeContext.Provider>
  );
}
