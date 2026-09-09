import { validateUrl } from '../extraction/fetcher';
import { normalizeSourceUrl } from './duplicate';
import { createGenerationJob, updateRecipeStatus } from '../db/recipes';
import { runMasterPipeline } from './orchestrator';
import { recoverStaleJobs } from './locking';
import { logger } from '../utils/logger';

export interface UrlValidationSummaryItem {
  url: string;
  normalizedUrl: string;
  status: 'VALID' | 'INVALID' | 'DUPLICATE' | 'ALREADY_IMPORTED' | 'ALREADY_QUEUED';
  reason?: string;
}

export interface BulkValidationResult {
  totalDetected: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  alreadyImportedCount: number;
  alreadyQueuedCount: number;
  items: UrlValidationSummaryItem[];
}

export interface BulkJobRecord {
  id: number;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED' | 'CANCELLED';
  total_count: number;
  queued_count: number;
  processing_count: number;
  completed_count: number;
  failed_count: number;
  concurrency_limit: number;
  created_at: string;
  updated_at: string;
}

export interface BulkItemRecord {
  id: number;
  bulk_job_id: number;
  pipeline_job_id?: number | null;
  source_url: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'SKIPPED_DUPLICATE';
  current_stage?: string | null;
  recipe_id?: number | null;
  recipe_title?: string | null;
  recipe_slug?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Validates a list of raw text URLs for bulk queue ingestion.
 * Performs syntax validation, in-batch deduplication, and database duplicate checks.
 */
export async function validateBulkUrls(db: any, rawUrls: string[]): Promise<BulkValidationResult> {
  const items: UrlValidationSummaryItem[] = [];
  const seenUrls = new Set<string>();

  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  let alreadyImportedCount = 0;
  let alreadyQueuedCount = 0;

  for (const raw of rawUrls) {
    let cleanUrl = (raw || '').trim();
    if (!cleanUrl) continue; // ignore empty lines

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    // 1. Basic URL syntax validation
    const urlValidation = validateUrl(cleanUrl);
    if (!urlValidation.valid) {
      invalidCount++;
      items.push({
        url: cleanUrl,
        normalizedUrl: cleanUrl,
        status: 'INVALID',
        reason: 'reason' in urlValidation ? urlValidation.reason : 'Malformed HTTP/HTTPS URL'
      });
      continue;
    }

    const normalized = normalizeSourceUrl(cleanUrl);

    // 2. In-batch duplicate check
    if (seenUrls.has(normalized)) {
      duplicateCount++;
      items.push({
        url: trimmed,
        normalizedUrl: normalized,
        status: 'DUPLICATE',
        reason: 'Duplicate URL in current submission'
      });
      continue;
    }
    seenUrls.add(normalized);

    // 3. Database check: Already imported recipe?
    if (db) {
      try {
        const existingRecipe = await db.prepare(`
          SELECT id, title, slug FROM recipes WHERE source_url = ? OR source_url = ? LIMIT 1
        `).bind(normalized, trimmed).first();

        if (existingRecipe) {
          alreadyImportedCount++;
          items.push({
            url: trimmed,
            normalizedUrl: normalized,
            status: 'ALREADY_IMPORTED',
            reason: `Already imported as "${existingRecipe.title}"`
          });
          continue;
        }

        // 4. Database check: Already queued or currently processing job?
        const activeJob = await db.prepare(`
          SELECT id FROM generation_jobs 
          WHERE (source_url = ? OR source_url = ?) AND status IN ('PENDING', 'RUNNING') 
          LIMIT 1
        `).bind(normalized, trimmed).first();

        if (activeJob) {
          alreadyQueuedCount++;
          items.push({
            url: trimmed,
            normalizedUrl: normalized,
            status: 'ALREADY_QUEUED',
            reason: 'Recipe is already being processed in an active job'
          });
          continue;
        }
      } catch (err) {
        console.error('Error checking duplicate in db:', err);
      }
    }

    // URL is completely valid and clean
    validCount++;
    items.push({
      url: trimmed,
      normalizedUrl: normalized,
      status: 'VALID'
    });
  }

  return {
    totalDetected: items.length,
    validCount,
    invalidCount,
    duplicateCount,
    alreadyImportedCount,
    alreadyQueuedCount,
    items
  };
}

/**
 * Creates a new bulk import job and its child items.
 */
export async function createBulkJob(
  db: any,
  validUrls: string[],
  concurrencyLimit = 3
): Promise<number> {
  const insertJob = await db.prepare(`
    INSERT INTO bulk_import_jobs (status, total_count, queued_count, processing_count, completed_count, failed_count, concurrency_limit, created_at, updated_at)
    VALUES ('QUEUED', ?, ?, 0, 0, 0, ?, datetime('now'), datetime('now'))
    RETURNING id
  `).bind(validUrls.length, validUrls.length, concurrencyLimit).first();

  const bulkJobId = insertJob.id as number;

  const stmts = validUrls.map(url =>
    db.prepare(`
      INSERT INTO bulk_import_items (bulk_job_id, source_url, status, created_at, updated_at)
      VALUES (?, ?, 'QUEUED', datetime('now'), datetime('now'))
    `).bind(bulkJobId, url)
  );

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return bulkJobId;
}

/**
 * Fetches bulk job record and all its items (with recipe titles joined).
 */
export async function getBulkJobDetails(
  db: any,
  bulkJobId: number
): Promise<{ job: BulkJobRecord | null; items: BulkItemRecord[] }> {
  if (!db || !bulkJobId) return { job: null, items: [] };

  const job = await db.prepare(`
    SELECT * FROM bulk_import_jobs WHERE id = ?
  `).bind(bulkJobId).first() as BulkJobRecord | null;

  if (!job) return { job: null, items: [] };

  const { results } = await db.prepare(`
    SELECT 
      i.*,
      r.title as recipe_title,
      r.slug as recipe_slug
    FROM bulk_import_items i
    LEFT JOIN recipes r ON i.recipe_id = r.id
    WHERE i.bulk_job_id = ?
    ORDER BY i.id ASC
  `).bind(bulkJobId).all();

  return {
    job,
    items: (results || []) as BulkItemRecord[]
  };
}

/**
 * Lists past bulk jobs for the history view.
 */
export async function listBulkJobs(db: any, limit = 20, offset = 0): Promise<BulkJobRecord[]> {
  if (!db) return [];

  const { results } = await db.prepare(`
    SELECT *
    FROM bulk_import_jobs
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all();

  return (results || []) as BulkJobRecord[];
}

/**
 * Cancels a bulk job. Queued items are set to CANCELLED.
 */
export async function cancelBulkJob(db: any, bulkJobId: number): Promise<boolean> {
  if (!db || !bulkJobId) return false;

  await db.prepare(`
    UPDATE bulk_import_items
    SET status = 'CANCELLED', updated_at = datetime('now')
    WHERE bulk_job_id = ? AND status = 'QUEUED'
  `).bind(bulkJobId).run();

  await syncBulkJobCounts(db, bulkJobId);

  await db.prepare(`
    UPDATE bulk_import_jobs
    SET status = 'CANCELLED', updated_at = datetime('now')
    WHERE id = ?
  `).bind(bulkJobId).run();

  return true;
}

/**
 * Retries failed items in a bulk job.
 */
export async function retryFailedBulkItems(
  db: any,
  bulkJobId: number,
  itemId?: number
): Promise<boolean> {
  if (!db || !bulkJobId) return false;

  if (itemId) {
    await db.prepare(`
      UPDATE bulk_import_items
      SET status = 'QUEUED', error_message = NULL, updated_at = datetime('now')
      WHERE bulk_job_id = ? AND id = ? AND status = 'FAILED'
    `).bind(bulkJobId, itemId).run();
  } else {
    await db.prepare(`
      UPDATE bulk_import_items
      SET status = 'QUEUED', error_message = NULL, updated_at = datetime('now')
      WHERE bulk_job_id = ? AND status = 'FAILED'
    `).bind(bulkJobId).run();
  }

  await syncBulkJobCounts(db, bulkJobId);

  await db.prepare(`
    UPDATE bulk_import_jobs
    SET status = 'PROCESSING', updated_at = datetime('now')
    WHERE id = ? AND status IN ('COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED')
  `).bind(bulkJobId).run();

  return true;
}

/**
 * Recalculates and updates the aggregated counts on a bulk_import_jobs record.
 */
export async function syncBulkJobCounts(db: any, bulkJobId: number): Promise<void> {
  const counts = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'QUEUED' THEN 1 ELSE 0 END) as queued,
      SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
    FROM bulk_import_items
    WHERE bulk_job_id = ?
  `).bind(bulkJobId).first();

  const total = (counts?.total as number) || 0;
  const queued = (counts?.queued as number) || 0;
  const processing = (counts?.processing as number) || 0;
  const completed = (counts?.completed as number) || 0;
  const failed = (counts?.failed as number) || 0;

  let newStatus: string = 'PROCESSING';
  if (queued === 0 && processing === 0) {
    if (failed > 0) {
      newStatus = completed > 0 ? 'COMPLETED_WITH_ERRORS' : 'FAILED';
    } else {
      newStatus = 'COMPLETED';
    }
  }

  await db.prepare(`
    UPDATE bulk_import_jobs
    SET 
      total_count = ?,
      queued_count = ?,
      processing_count = ?,
      completed_count = ?,
      failed_count = ?,
      status = CASE WHEN status = 'CANCELLED' THEN 'CANCELLED' ELSE ? END,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(total, queued, processing, completed, failed, newStatus, bulkJobId).run();
}

/**
 * Queue Orchestrator Tick.
 * Runs on every polling request or background worker event.
 * Picks up to (concurrencyLimit - currentProcessing) items from the queue and launches the master pipeline.
 */
export async function processBulkQueueTick(env: any, bulkJobId: number): Promise<void> {
  const db = env?.DB;
  if (!db || !bulkJobId) return;

  // 0. Recover stale pipeline jobs and stranded bulk items
  try {
    await recoverStaleJobs(db, 10);
    await db.prepare(`
      UPDATE bulk_import_items
      SET status = 'FAILED', error_message = 'Item processing timed out.', updated_at = datetime('now')
      WHERE bulk_job_id = ? AND status = 'PROCESSING' AND updated_at < datetime('now', '-10 minutes')
    `).bind(bulkJobId).run();
  } catch (recoverErr) {
    logger.warn('[Bulk] Error during stale item recovery:', recoverErr);
  }

  // 1. Fetch bulk job
  const job = await db.prepare(`
    SELECT * FROM bulk_import_jobs WHERE id = ?
  `).bind(bulkJobId).first() as BulkJobRecord | null;

  if (!job || job.status === 'CANCELLED' || job.status === 'COMPLETED' || job.status === 'FAILED') {
    return;
  }

  const concurrencyLimit = job.concurrency_limit || 3;

  // 2. Count currently processing items
  const activeCountRow = await db.prepare(`
    SELECT COUNT(*) as count FROM bulk_import_items
    WHERE bulk_job_id = ? AND status = 'PROCESSING'
  `).bind(bulkJobId).first();

  const activeCount = (activeCountRow?.count as number) || 0;
  const slotsAvailable = Math.max(0, concurrencyLimit - activeCount);

  if (slotsAvailable <= 0) {
    return; // Concurrency limit reached, wait for running jobs
  }

  // 3. Fetch up to slotsAvailable queued items
  const { results: queuedItems } = await db.prepare(`
    SELECT * FROM bulk_import_items
    WHERE bulk_job_id = ? AND status = 'QUEUED'
    ORDER BY id ASC
    LIMIT ?
  `).bind(bulkJobId, slotsAvailable).all();

  if (!queuedItems || queuedItems.length === 0) {
    if (activeCount === 0) {
      await syncBulkJobCounts(db, bulkJobId);
    }
    return;
  }

  // Update job status to PROCESSING
  await db.prepare(`
    UPDATE bulk_import_jobs SET status = 'PROCESSING', updated_at = datetime('now') WHERE id = ?
  `).bind(bulkJobId).run();

  // 4. Launch each queued item in parallel up to available slots
  for (const item of queuedItems) {
    const itemId = item.id as number;
    const sourceUrl = item.source_url as string;

    // Create single recipe generation_job
    const pipelineJobId = await createGenerationJob(db, sourceUrl);

    // Mark item as PROCESSING
    await db.prepare(`
      UPDATE bulk_import_items
      SET status = 'PROCESSING', pipeline_job_id = ?, current_stage = 'VALIDATE_URL', updated_at = datetime('now')
      WHERE id = ?
    `).bind(pipelineJobId, itemId).run();

    await syncBulkJobCounts(db, bulkJobId);

    // Launch pipeline execution asynchronously
    const runPromise = (async () => {
      try {
        const result = await runMasterPipeline(env, {
          jobId: pipelineJobId,
          sourceUrl,
          onStageProgress: async (stage) => {
            try {
              await db.prepare(`
                UPDATE bulk_import_items
                SET current_stage = ?, updated_at = datetime('now')
                WHERE id = ?
              `).bind(stage, itemId).run();
            } catch {}
          }
        });

        if (result.status === 'success') {
          await db.prepare(`
            UPDATE bulk_import_items
            SET 
              status = 'COMPLETED',
              current_stage = 'DRAFT_READY',
              recipe_id = ?,
              error_message = NULL,
              updated_at = datetime('now')
            WHERE id = ?
          `).bind(result.recipeId || null, itemId).run();
        } else {
          await db.prepare(`
            UPDATE bulk_import_items
            SET 
              status = 'FAILED',
              current_stage = ?,
              error_message = ?,
              recipe_id = ?,
              updated_at = datetime('now')
            WHERE id = ?
          `).bind(result.stage, result.error || 'Pipeline execution failed.', result.recipeId || null, itemId).run();
        }
      } catch (err: any) {
        console.error(`[Bulk Job ${bulkJobId} / Item ${itemId}] Execution error:`, err);
        await db.prepare(`
          UPDATE bulk_import_items
          SET 
            status = 'FAILED',
            current_stage = 'FAILED',
            error_message = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).bind(err.message || 'Unexpected failure.', itemId).run();
      } finally {
        await syncBulkJobCounts(db, bulkJobId);
        // Trigger next iteration immediately to pick up next waiting queued item
        await processBulkQueueTick(env, bulkJobId);
      }
    })();

    // Allow execution in background without blocking response
    if (typeof env?.ctx?.waitUntil === 'function') {
      env.ctx.waitUntil(runPromise);
    }
  }
}
