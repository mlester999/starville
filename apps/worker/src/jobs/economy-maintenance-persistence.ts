import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { EconomyMaintenanceGateway } from './economy-maintenance-job.js';

const reconciliationSchema = z
  .object({
    runId: z.uuid(),
    checkedCount: z.number().int().nonnegative(),
    mismatchCount: z.number().int().nonnegative(),
    autoCorrected: z.literal(false),
  })
  .strict();
const riskSchema = z
  .object({ signalsCreated: z.number().int().nonnegative(), automaticPlayerActions: z.literal(0) })
  .strict();
const metricsSchema = z
  .object({
    metricDate: z.iso.date(),
    dustCreated: z.number().int().nonnegative(),
    dustDestroyed: z.number().int().nonnegative(),
    transactionCount: z.number().int().nonnegative(),
    activePlayerCount: z.number().int().nonnegative(),
    calculatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const activationFields = {
  policiesActivated: z.number().int().nonnegative(),
  shopsActivated: z.number().int().nonnegative(),
  requestId: z.string().min(1).max(128),
};
const activationRpcSchema = z
  .object({
    ...activationFields,
    publishedOnly: z.literal(true).optional(),
  })
  .strict();
const activationSchema = z
  .object({
    ...activationFields,
    publishedOnly: z.literal(true),
  })
  .strict();
const shopRestockSchema = z
  .object({
    status: z.literal('processed'),
    restocked: z.number().int().nonnegative(),
    requestId: z.string().min(1).max(128),
  })
  .strict();
const shopReconciliationSchema = z
  .object({
    status: z.literal('processed'),
    processed: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    manualReview: z.number().int().nonnegative(),
    requestId: z.string().min(1).max(128),
  })
  .strict();

async function rpc(client: SupabaseClient, operation: string, parameters: Record<string, unknown>) {
  const { data, error } = await client.rpc(operation, parameters);
  if (error !== null) throw new Error('Economy maintenance persistence failed.');
  return data;
}

function previousUtcDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function parseApprovedActivation(value: unknown) {
  const activation = activationRpcSchema.parse(value);

  // This fixed RPC activates only approved, scheduled versions; reject conflicting attestations.
  return activationSchema.parse({
    ...activation,
    publishedOnly: activation.publishedOnly ?? true,
  });
}

export function createEconomyMaintenanceGateway(client: SupabaseClient): EconomyMaintenanceGateway {
  return {
    async execute(reconciliationBatchSize, riskBatchSize) {
      const requestId = `worker-economy:${randomUUID()}`;
      const reconciliation = reconciliationSchema.parse(
        await rpc(client, 'run_economy_reconciliation_worker', {
          p_batch_size: reconciliationBatchSize,
          p_request_id: requestId,
        }),
      );
      const risk = riskSchema.parse(
        await rpc(client, 'scan_economy_risk_signals', {
          p_batch_size: riskBatchSize,
          p_request_id: requestId,
        }),
      );
      const metrics = metricsSchema.parse(
        await rpc(client, 'refresh_economy_daily_metrics', {
          p_metric_date: previousUtcDate(),
          p_request_id: requestId,
        }),
      );
      const activation = parseApprovedActivation(
        await rpc(client, 'activate_approved_economy_versions', {
          p_batch_size: Math.min(riskBatchSize, 100),
          p_request_id: requestId,
        }),
      );
      const shopRestock = shopRestockSchema.parse(
        await rpc(client, 'run_shop_restock_worker', {
          p_limit: Math.min(riskBatchSize, 100),
          p_request_id: requestId,
        }),
      );
      const shopReconciliation = shopReconciliationSchema.parse(
        await rpc(client, 'reconcile_shop_transactions', {
          p_limit: Math.min(riskBatchSize, 100),
          p_request_id: requestId,
        }),
      );
      return {
        reconciliation,
        risk,
        metrics: { metricDate: metrics.metricDate },
        activation: {
          policiesActivated: activation.policiesActivated,
          shopsActivated: activation.shopsActivated,
          publishedOnly: activation.publishedOnly,
        },
        shop: {
          restocked: shopRestock.restocked,
          reconciled: shopReconciliation.processed,
          manualReview: shopReconciliation.manualReview,
          automaticBalanceCorrections: 0,
        },
      };
    },
  };
}
