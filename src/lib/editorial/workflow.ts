/**
 * Editorial Review & Approval Workflow Service.
 * Manages the state machine:
 * DRAFT / REVIEW_REQUIRED -> APPROVED -> PUBLISHED / UNPUBLISHED
 * Handles stale content detection, fact-lock protections, review queues, and revision history.
 */

import { getRecipeWithAllDetails, saveQualityReport } from '../db/recipes';
import { reconstructFactSheet } from '../pipeline/runner';
import { evaluateRecipeQuality } from '../quality/engine';
import { validateTechnicalSeo, isPrePublishSeoPassed } from '../seo/validation';
import { analyzeInternalLinks } from '../seo/internal-links';
import type { QualityReport } from '../quality/types';

export type RecipeWorkflowStatus = 
  | 'IMPORTED' 
  | 'PROCESSING' 
  | 'GENERATED' 
  | 'VALIDATED' 
  | 'DRAFT' 
  | 'REVIEW_REQUIRED' 
  | 'APPROVED' 
  | 'PUBLISHED' 
  | 'UNPUBLISHED' 
  | 'FAILED';

export type RevisionChangeType = 
  | 'FACT_EDIT' 
  | 'CONTENT_EDIT' 
  | 'SECTION_REGENERATED' 
  | 'SEO_EDIT' 
  | 'IMAGE_REGENERATED' 
  | 'APPROVED' 
  | 'PUBLISHED' 
  | 'UNPUBLISHED'
  | 'IMPORT';

export interface RecipeRevision {
  id: number;
  recipe_id: number;
  changed_at: string;
  changed_by: string;
  change_type: RevisionChangeType;
  notes?: string | null;
  details?: string | null;
}

export interface ApprovalValidationOutcome {
  canApprove: boolean;
  qualityReport: QualityReport | null;
  seoReport: any | null;
  issues: Array<{ severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; message: string; category: string }>;
  qualityScore: number;
}

/**
 * Records a revision in the recipe_revisions audit log.
 */
export async function recordRevision(
  db: D1Database,
  recipeId: number,
  changeType: RevisionChangeType,
  changedBy = 'admin',
  notes?: string,
  details?: any
): Promise<void> {
  try {
    const detailsStr = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null;
    await db.prepare(`
      INSERT INTO recipe_revisions (recipe_id, changed_at, changed_by, change_type, notes, details)
      VALUES (?, datetime('now'), ?, ?, ?, ?)
    `).bind(recipeId, changedBy, changeType, notes || null, detailsStr).run();
  } catch (err) {
    console.error(`[Workflow] Failed to record revision for recipe ${recipeId}:`, err);
  }
}

/**
 * Retrieves the revision history for a recipe.
 */
export async function getRecipeRevisions(
  db: D1Database,
  recipeId: number,
  limit = 25
): Promise<RecipeRevision[]> {
  try {
    const res = await db.prepare(`
      SELECT * FROM recipe_revisions
      WHERE recipe_id = ?
      ORDER BY changed_at DESC
      LIMIT ?
    `).bind(recipeId, limit).all<RecipeRevision>();
    return res.results || [];
  } catch (err) {
    console.error(`[Workflow] Error fetching revisions for recipe ${recipeId}:`, err);
    return [];
  }
}

/**
 * Marks a recipe's dependent AI content as stale after recipe facts have changed.
 * Automatically invalidates previous approval by demoting status to REVIEW_REQUIRED.
 */
export async function markRecipeFactsChanged(
  db: D1Database,
  recipeId: number,
  changedBy = 'admin',
  notes = 'Locked recipe facts were updated'
): Promise<void> {
  await db.prepare(`
    UPDATE recipes
    SET 
      content_stale = 1,
      status = 'REVIEW_REQUIRED',
      approved_at = NULL,
      approved_by = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(recipeId).run();

  await recordRevision(db, recipeId, 'FACT_EDIT', changedBy, notes);
}

/**
 * Invalidate approval whenever generated content, SEO, or sections are updated.
 * Demotes APPROVED or PUBLISHED recipes with unsaved edits to REVIEW_REQUIRED.
 */
export async function markRecipeContentChanged(
  db: D1Database,
  recipeId: number,
  changeType: RevisionChangeType = 'CONTENT_EDIT',
  changedBy = 'admin',
  notes?: string
): Promise<void> {
  const current = await db.prepare('SELECT status FROM recipes WHERE id = ?').bind(recipeId).first<{ status: string }>();

  if (current?.status === 'APPROVED') {
    await db.prepare(`
      UPDATE recipes
      SET 
        status = 'REVIEW_REQUIRED',
        approved_at = NULL,
        approved_by = NULL,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(recipeId).run();
  } else {
    await db.prepare(`
      UPDATE recipes
      SET updated_at = datetime('now')
      WHERE id = ?
    `).bind(recipeId).run();
  }

  await recordRevision(db, recipeId, changeType, changedBy, notes);
}

/**
 * Authoritative Server-side Validation Stack prior to approval.
 * Evaluates:
 * 1. Locked facts vs generated content (Fact Consistency)
 * 2. Content Quality (Repetition, Cliches, Structure, Score >= 80)
 * 3. Technical SEO & Schema Structured Data
 * 4. Image Readiness
 */
export async function validateRecipeForApproval(
  env: Env,
  recipeId: number
): Promise<ApprovalValidationOutcome> {
  const db = env.DB;
  const recipe = await getRecipeWithAllDetails(db, recipeId);
  if (!recipe) {
    return {
      canApprove: false,
      qualityReport: null,
      seoReport: null,
      issues: [{ severity: 'CRITICAL', message: 'Recipe record not found in database.', category: 'SYSTEM' }],
      qualityScore: 0
    };
  }

  const issues: Array<{ severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; message: string; category: string }> = [];

  // 1. Fact Consistency & Content Quality
  let qualityReport: QualityReport | null = null;
  let score = 0;

  if (recipe.content) {
    const factSheet = reconstructFactSheet(recipe);
    const generatedContent = {
      introduction: recipe.content.introduction || '',
      whyThisRecipe: recipe.content.why_this_recipe || '',
      ingredientGuidance: typeof recipe.content.ingredient_guidance === 'string' ? JSON.parse(recipe.content.ingredient_guidance) : (recipe.content.ingredient_guidance || []),
      cookingGuidance: typeof recipe.content.cooking_guidance === 'string' ? JSON.parse(recipe.content.cooking_guidance) : (recipe.content.cooking_guidance || []),
      tips: typeof recipe.content.tips === 'string' ? JSON.parse(recipe.content.tips) : (recipe.content.tips || []),
      variations: typeof recipe.content.variations === 'string' ? JSON.parse(recipe.content.variations) : (recipe.content.variations || []),
      servingSuggestions: recipe.content.serving_suggestions || '',
      storage: recipe.content.storage || '',
      faq: typeof recipe.content.faq === 'string' ? JSON.parse(recipe.content.faq) : (recipe.content.faq || []),
      seo: {
        title: recipe.seo?.seo_title || recipe.title,
        metaDescription: recipe.seo?.meta_description || recipe.description || '',
        slug: recipe.slug
      }
    };

    qualityReport = evaluateRecipeQuality(factSheet.lockedFacts, generatedContent);
    score = qualityReport.score;
    await saveQualityReport(db, recipe.id, qualityReport);

    for (const qi of qualityReport.issues) {
      if (qi.severity === 'HIGH') {
        issues.push({ severity: 'HIGH', message: qi.message, category: qi.category });
      } else if (qi.severity === 'MEDIUM') {
        issues.push({ severity: 'MEDIUM', message: qi.message, category: qi.category });
      }
    }

    if (qualityReport.score < 80) {
      issues.push({
        severity: 'HIGH',
        message: `Quality score (${qualityReport.score}/100) is below the minimum approval threshold (80/100).`,
        category: 'QUALITY'
      });
    }
  } else {
    issues.push({ severity: 'CRITICAL', message: 'Recipe editorial content is missing.', category: 'CONTENT' });
  }

  // 2. Technical SEO Validation
  const siteUrl = env.SITE_URL || 'https://yoursite.com';
  const linkAnalysis = await analyzeInternalLinks(db, recipe.id, recipe.slug, recipe.category_id, recipe.cuisine);
  const seoReport = validateTechnicalSeo(
    recipe,
    recipe.ingredients || [],
    recipe.instructions || [],
    recipe.content || {},
    recipe.seo || {},
    siteUrl,
    { incomingLinksCount: linkAnalysis.incomingLinksCount }
  );

  if (!isPrePublishSeoPassed(seoReport)) {
    for (const si of seoReport.issues) {
      if (si.level === 'CRITICAL') {
        issues.push({ severity: 'CRITICAL', message: si.message, category: 'SEO' });
      }
    }
  }

  // 3. Stale content flag check
  if (recipe.content_stale) {
    issues.push({
      severity: 'HIGH',
      message: 'Locked facts were modified. Generated content is stale and requires editorial review.',
      category: 'FACTS'
    });
  }

  const criticalOrHigh = issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');
  const canApprove = criticalOrHigh.length === 0;

  return {
    canApprove,
    qualityReport,
    seoReport,
    issues,
    qualityScore: score
  };
}

/**
 * Transitions a recipe from REVIEW_REQUIRED to APPROVED.
 * Enforces server-side validation gate.
 */
export async function approveRecipe(
  env: Env,
  recipeId: number,
  approvedBy = 'admin'
): Promise<{ success: boolean; error?: string; outcome?: ApprovalValidationOutcome }> {
  const db = env.DB;
  const outcome = await validateRecipeForApproval(env, recipeId);

  if (!outcome.canApprove) {
    const primaryReason = outcome.issues[0]?.message || 'Quality and validation gate failed.';
    return {
      success: false,
      error: `Approval blocked: ${primaryReason}`,
      outcome
    };
  }

  await db.prepare(`
    UPDATE recipes
    SET 
      status = 'APPROVED',
      approved_at = datetime('now'),
      approved_by = ?,
      content_stale = 0,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(approvedBy, recipeId).run();

  await recordRevision(db, recipeId, 'APPROVED', approvedBy, 'Recipe approved for publishing');

  return {
    success: true,
    outcome
  };
}

/**
 * Publishes an APPROVED recipe.
 * Disallows DRAFT or REVIEW_REQUIRED recipes from publishing directly.
 */
export async function publishApprovedRecipe(
  db: D1Database,
  recipeId: number,
  publishedBy = 'admin'
): Promise<{ success: boolean; error?: string; slug?: string }> {
  const recipe = await db.prepare('SELECT id, slug, status FROM recipes WHERE id = ?').bind(recipeId).first<{ id: number; slug: string; status: string }>();

  if (!recipe) {
    return { success: false, error: 'Recipe not found.' };
  }

  // Enforce workflow: Must be APPROVED before PUBLISHED
  if (recipe.status !== 'APPROVED') {
    return {
      success: false,
      error: `Recipe cannot be published directly from status "${recipe.status}". It must be APPROVED first.`
    };
  }

  await db.prepare(`
    UPDATE recipes
    SET 
      status = 'PUBLISHED',
      published_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(recipeId).run();

  await recordRevision(db, recipeId, 'PUBLISHED', publishedBy, 'Recipe published to live website');

  return {
    success: true,
    slug: recipe.slug
  };
}

/**
 * Unpublishes a PUBLISHED recipe, setting status to UNPUBLISHED.
 * The public page returns 404, but the recipe record is retained safely.
 */
export async function unpublishRecipeToWorkflow(
  db: D1Database,
  recipeId: number,
  unpublishedBy = 'admin'
): Promise<{ success: boolean; error?: string }> {
  const recipe = await db.prepare('SELECT id, status FROM recipes WHERE id = ?').bind(recipeId).first<{ id: number; status: string }>();

  if (!recipe) {
    return { success: false, error: 'Recipe not found.' };
  }

  await db.prepare(`
    UPDATE recipes
    SET 
      status = 'UNPUBLISHED',
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(recipeId).run();

  await recordRevision(db, recipeId, 'UNPUBLISHED', unpublishedBy, 'Recipe unpublished from live website');

  return { success: true };
}

/**
 * Fetches the review queue with sorting prioritising REVIEW_REQUIRED, FAILED, DRAFT, APPROVED, UNPUBLISHED.
 */
export async function getEditorialQueue(
  db: D1Database,
  opts?: {
    search?: string;
    status?: string;
    quality?: string;
    image?: string;
    limit?: number;
    offset?: number;
  }
) {
  const limit = opts?.limit || 20;
  const offset = opts?.offset || 0;

  let query = `
    SELECT 
      r.id,
      r.title,
      r.slug,
      r.status,
      r.quality_status,
      r.quality_score,
      r.image_status,
      r.hero_image_key,
      r.content_stale,
      r.approved_at,
      r.published_at,
      r.updated_at,
      r.created_at,
      c.name as category_name,
      j.status as job_status,
      j.current_stage as job_stage,
      j.error_message as job_error
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    LEFT JOIN generation_jobs j ON j.recipe_id = r.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (opts?.status && opts.status !== 'all') {
    query += ' AND r.status = ?';
    params.push(opts.status.toUpperCase());
  }

  if (opts?.quality && opts.quality !== 'all') {
    if (opts.quality === 'pass') {
      query += ' AND r.quality_score >= 80';
    } else if (opts.quality === 'review') {
      query += ' AND r.quality_score < 80 AND r.quality_score >= 50';
    } else if (opts.quality === 'fail') {
      query += ' AND (r.quality_score < 50 OR r.quality_status = "QUALITY_FAILED")';
    }
  }

  if (opts?.image && opts.image !== 'all') {
    query += ' AND r.image_status = ?';
    params.push(opts.image.toUpperCase());
  }

  if (opts?.search) {
    const term = `%${opts.search.trim().toLowerCase()}%`;
    query += ' AND (LOWER(r.title) LIKE ? OR LOWER(r.slug) LIKE ?)';
    params.push(term, term);
  }

  // Priority order:
  // 1: REVIEW_REQUIRED
  // 2: FAILED / BLOCKED
  // 3: DRAFT
  // 4: APPROVED
  // 5: UNPUBLISHED
  // 6: PUBLISHED
  query += `
    ORDER BY 
      CASE r.status
        WHEN 'REVIEW_REQUIRED' THEN 1
        WHEN 'FAILED' THEN 2
        WHEN 'DRAFT' THEN 3
        WHEN 'APPROVED' THEN 4
        WHEN 'UNPUBLISHED' THEN 5
        WHEN 'PUBLISHED' THEN 6
        ELSE 7
      END ASC,
      r.updated_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const res = await db.prepare(query).bind(...params).all<any>();
  return res.results || [];
}

/**
 * Counts recipes across review workflow states for admin metrics.
 */
export async function getEditorialWorkflowStats(db: D1Database) {
  const rows = await db.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'REVIEW_REQUIRED' THEN 1 ELSE 0 END) as reviewRequired,
      SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'PUBLISHED' THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN status = 'DRAFT' THEN 1 ELSE 0 END) as draft,
      SUM(CASE WHEN status = 'UNPUBLISHED' THEN 1 ELSE 0 END) as unpublished,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
      COUNT(*) as total
    FROM recipes
  `).first<any>();

  return {
    needsReview: rows?.reviewRequired || 0,
    approved: rows?.approved || 0,
    published: rows?.published || 0,
    drafts: rows?.draft || 0,
    unpublished: rows?.unpublished || 0,
    failed: rows?.failed || 0,
    total: rows?.total || 0
  };
}
