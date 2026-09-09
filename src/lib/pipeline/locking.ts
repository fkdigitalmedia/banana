/**
 * Distributed Job Locking & Stale Job Recovery for Cloudflare D1.
 * Ensures concurrent queue runners or duplicate triggers do not execute the same job concurrently,
 * and recovers jobs stranded by unexpected worker terminations or timeouts.
 */

export function generateWorkerId(prefix = 'worker'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

export interface LockAcquisitionResult {
  acquired: boolean;
  workerId: string;
  reason?: string;
}

/**
 * Attempts to acquire an exclusive lock on a generation_job.
 * Uses atomic UPDATE with lease expiration logic.
 * 
 * Lock is acquired if:
 * 1. locked_at is NULL, OR
 * 2. locked_at is older than leaseMinutes ago (expired lease), OR
 * 3. locked_by is already the current workerId (re-entrant lock)
 */
export async function acquireJobLock(
  db: D1Database,
  jobId: number,
  workerId: string,
  leaseMinutes = 10
): Promise<boolean> {
  try {
    const result = await db.prepare(`
      UPDATE generation_jobs
      SET 
        locked_at = datetime('now'),
        locked_by = ?,
        updated_at = datetime('now')
      WHERE id = ? 
        AND (
          locked_at IS NULL 
          OR locked_at < datetime('now', '-' || ? || ' minutes')
          OR locked_by = ?
        )
    `).bind(workerId, jobId, leaseMinutes, workerId).run();

    return ((result.meta as any)?.changes || 0) > 0;
  } catch (err) {
    console.error(`[Locking] Error acquiring lock for job ${jobId}:`, err);
    return false;
  }
}

/**
 * Extends the lease of an existing lock owned by workerId.
 */
export async function extendJobLock(
  db: D1Database,
  jobId: number,
  workerId: string
): Promise<boolean> {
  try {
    const result = await db.prepare(`
      UPDATE generation_jobs
      SET 
        locked_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ? AND locked_by = ?
    `).bind(jobId, workerId).run();

    return ((result.meta as any)?.changes || 0) > 0;
  } catch (err) {
    console.error(`[Locking] Error extending lock for job ${jobId}:`, err);
    return false;
  }
}

/**
 * Releases the lock on a job when execution completes or fails.
 */
export async function releaseJobLock(
  db: D1Database,
  jobId: number,
  workerId?: string
): Promise<void> {
  try {
    if (workerId) {
      await db.prepare(`
        UPDATE generation_jobs
        SET locked_at = NULL, locked_by = NULL
        WHERE id = ? AND locked_by = ?
      `).bind(jobId, workerId).run();
    } else {
      await db.prepare(`
        UPDATE generation_jobs
        SET locked_at = NULL, locked_by = NULL
        WHERE id = ?
      `).bind(jobId).run();
    }
  } catch (err) {
    console.error(`[Locking] Error releasing lock for job ${jobId}:`, err);
  }
}

/**
 * Scans for stale jobs stranded in RUNNING state whose lock expired or were abandoned.
 * - If attempt_count < maxAttempts, resets status to PENDING for retry.
 * - If attempt_count >= maxAttempts, marks status as FAILED.
 */
export async function recoverStaleJobs(
  db: D1Database,
  staleMinutes = 10,
  maxAttempts = 3
): Promise<{ recoveredCount: number; failedCount: number }> {
  try {
    // 1. Mark exhausted stale jobs as FAILED
    const failRes = await db.prepare(`
      UPDATE generation_jobs
      SET 
        status = 'FAILED',
        error_message = 'Job timed out after multiple attempts without completion.',
        locked_at = NULL,
        locked_by = NULL,
        completed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE status = 'RUNNING'
        AND attempt_count >= ?
        AND (
          locked_at < datetime('now', '-' || ? || ' minutes')
          OR (locked_at IS NULL AND updated_at < datetime('now', '-' || ? || ' minutes'))
        )
    `).bind(maxAttempts, staleMinutes, staleMinutes).run();

    // 2. Reset retryable stale jobs back to PENDING
    const resetRes = await db.prepare(`
      UPDATE generation_jobs
      SET 
        status = 'PENDING',
        locked_at = NULL,
        locked_by = NULL,
        attempt_count = attempt_count + 1,
        updated_at = datetime('now')
      WHERE status = 'RUNNING'
        AND attempt_count < ?
        AND (
          locked_at < datetime('now', '-' || ? || ' minutes')
          OR (locked_at IS NULL AND updated_at < datetime('now', '-' || ? || ' minutes'))
        )
    `).bind(maxAttempts, staleMinutes, staleMinutes).run();

    const failedCount = (failRes.meta as any)?.changes || 0;
    const recoveredCount = (resetRes.meta as any)?.changes || 0;

    if (failedCount > 0 || recoveredCount > 0) {
      console.log(`[Locking] Recovered ${recoveredCount} stale jobs (retry) and marked ${failedCount} as FAILED.`);
    }

    return { recoveredCount, failedCount };
  } catch (err) {
    console.error('[Locking] Error recovering stale jobs:', err);
    return { recoveredCount: 0, failedCount: 0 };
  }
}
