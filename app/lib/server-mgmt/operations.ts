// app/lib/server-mgmt/operations.ts
// Durable operation lifecycle — manages hosting_operations table state machine.
// Enforces one active operation per app via unique partial index.
// Does NOT import exec.ts — this module only talks to the database.

import { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OperationType = 'provision' | 'deploy' | 'restart' | 'ssl_issue' | 'ssl_renew' | 'deprovision';
export type OperationStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'timed_out';
export type TriggerSource = 'api' | 'webhook' | 'system';

export interface OperationRow {
  id: string;
  hosting_app_id: string;
  operation_type: OperationType;
  status: OperationStatus;
  started_at: string;
  finished_at: string | null;
  heartbeat_at: string;
  error_message: string | null;
  metadata: Record<string, unknown>;
  trigger_source: TriggerSource;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum durations per operation type before considered stale (ms). */
export const OPERATION_TIMEOUTS: Record<OperationType, number> = {
  provision: 5 * 60_000,
  deploy: 10 * 60_000,
  restart: 30_000,
  ssl_issue: 2 * 60_000,
  ssl_renew: 2 * 60_000,
  deprovision: 2 * 60_000,
};

/** Heartbeat interval (ms). */
export const HEARTBEAT_INTERVAL = 30_000;

/** Stale threshold: 2 minutes without heartbeat. */
export const STALE_THRESHOLD = 2 * 60_000;

// ---------------------------------------------------------------------------
// Heartbeat Timer
// ---------------------------------------------------------------------------

/**
 * Start a background heartbeat that keeps an operation alive while work runs.
 * Returns a cleanup function that MUST be called when the operation finishes
 * (success or failure) to stop the interval.
 *
 * Usage:
 *   const stopHeartbeat = startHeartbeat(adminDb, operation.id);
 *   try { await longRunningWork(); } finally { stopHeartbeat(); }
 */
export function startHeartbeat(
  adminDb: SupabaseClient,
  operationId: string,
): () => void {
  const timer = setInterval(() => {
    heartbeat(adminDb, operationId).catch((err) => {
      console.error(`[heartbeat] Failed for operation ${operationId}:`, err);
    });
  }, HEARTBEAT_INTERVAL);

  return () => clearInterval(timer);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Begin a new operation for an app.
 *
 * The unique partial index on (hosting_app_id) WHERE status IN ('pending', 'running')
 * prevents concurrent operations on the same app.
 *
 * @returns The operation row, or null if an operation is already active.
 */
export async function beginOperation(
  adminDb: SupabaseClient,
  hostingAppId: string,
  operationType: OperationType,
  triggerSource: TriggerSource = 'api',
  metadata: Record<string, unknown> = {},
): Promise<OperationRow | null> {
  const { data, error } = await adminDb
    .from('hosting_operations')
    .insert({
      hosting_app_id: hostingAppId,
      operation_type: operationType,
      status: 'running',
      trigger_source: triggerSource,
      metadata,
    })
    .select()
    .single();

  if (error) {
    // Unique index violation = another operation is active
    if (error.code === '23505') return null;
    throw error;
  }

  return data as OperationRow;
}

/**
 * Update the heartbeat timestamp for a running operation.
 */
export async function heartbeat(
  adminDb: SupabaseClient,
  operationId: string,
): Promise<void> {
  await adminDb
    .from('hosting_operations')
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('id', operationId)
    .eq('status', 'running');
}

/**
 * Mark an operation as succeeded.
 * Idempotency: Safe to call multiple times.
 */
export async function completeOperation(
  adminDb: SupabaseClient,
  operationId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  // Merge new metadata with existing (preserves context from beginOperation)
  let mergedMetadata: Record<string, unknown> | undefined;
  if (metadata) {
    const { data: existing } = await adminDb
      .from('hosting_operations')
      .select('metadata')
      .eq('id', operationId)
      .single();
    mergedMetadata = { ...(existing?.metadata as Record<string, unknown> ?? {}), ...metadata };
  }

  const updates: Record<string, unknown> = {
    status: 'succeeded',
    finished_at: new Date().toISOString(),
  };
  if (mergedMetadata) {
    updates.metadata = mergedMetadata;
  }
  await adminDb
    .from('hosting_operations')
    .update(updates)
    .eq('id', operationId);
}

/**
 * Mark an operation as failed.
 * Idempotency: Safe to call multiple times.
 */
export async function failOperation(
  adminDb: SupabaseClient,
  operationId: string,
  errorMessage: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  // Merge new metadata with existing (preserves context from beginOperation)
  let mergedMetadata: Record<string, unknown> | undefined;
  if (metadata) {
    const { data: existing } = await adminDb
      .from('hosting_operations')
      .select('metadata')
      .eq('id', operationId)
      .single();
    mergedMetadata = { ...(existing?.metadata as Record<string, unknown> ?? {}), ...metadata };
  }

  const updates: Record<string, unknown> = {
    status: 'failed',
    finished_at: new Date().toISOString(),
    error_message: errorMessage.slice(0, 2000),
  };
  if (mergedMetadata) {
    updates.metadata = mergedMetadata;
  }
  await adminDb
    .from('hosting_operations')
    .update(updates)
    .eq('id', operationId);
}

/**
 * Recover stale operations (running but no heartbeat within STALE_THRESHOLD).
 * Should be called when the admin dashboard loads.
 * @returns Number of operations recovered.
 */
export async function recoverStaleOperations(
  adminDb: SupabaseClient,
): Promise<number> {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD).toISOString();

  const { data, error } = await adminDb
    .from('hosting_operations')
    .update({
      status: 'timed_out',
      finished_at: new Date().toISOString(),
      error_message: 'Operation timed out (no heartbeat)',
    })
    .eq('status', 'running')
    .lt('heartbeat_at', staleThreshold)
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

/**
 * Get the active operation for an app (if any).
 */
export async function getActiveOperation(
  adminDb: SupabaseClient,
  hostingAppId: string,
): Promise<OperationRow | null> {
  const { data } = await adminDb
    .from('hosting_operations')
    .select('*')
    .eq('hosting_app_id', hostingAppId)
    .in('status', ['pending', 'running'])
    .single();

  return (data as OperationRow) ?? null;
}

/**
 * Get recent operations for an app.
 */
export async function getRecentOperations(
  adminDb: SupabaseClient,
  hostingAppId: string,
  limit: number = 20,
): Promise<OperationRow[]> {
  const { data } = await adminDb
    .from('hosting_operations')
    .select('*')
    .eq('hosting_app_id', hostingAppId)
    .order('started_at', { ascending: false })
    .limit(limit);

  return (data as OperationRow[]) ?? [];
}
