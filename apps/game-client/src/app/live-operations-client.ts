import { publicLiveOperationsSchema, type PublicLiveOperations } from '@starville/live-operations';
import { z } from 'zod';

const responseSchema = z
  .object({ success: z.literal(true), data: publicLiveOperationsSchema })
  .passthrough();

export async function loadLiveOperations(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<PublicLiveOperations> {
  const response = await fetch(new URL('/api/v1/live-operations', apiUrl), {
    headers: { accept: 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw new Error('Live operations unavailable');
  return responseSchema.parse(await response.json()).data;
}
