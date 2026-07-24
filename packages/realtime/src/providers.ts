import { z } from 'zod';

export const realtimeProviderSchema = z.enum(['custom', 'supabase']);
export type RealtimeProvider = z.infer<typeof realtimeProviderSchema>;

export const backgroundJobsProviderSchema = z.enum(['custom', 'supabase']);
export type BackgroundJobsProvider = z.infer<typeof backgroundJobsProviderSchema>;
