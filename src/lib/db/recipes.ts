import type { D1Database } from '@cloudflare/workers-types';

export async function createRecipe(db: D1Database, data: any) {
  const { title, slug, description, status, source_url, source_domain, prep_time, cook_time, total_time, servings, cuisine, keywords, equipment, nutrition } = data;
  const stmt = db.prepare(`
    INSERT INTO recipes (title, slug, description, status, source_url, source_domain, prep_time, cook_time, total_time, servings, cuisine, keywords, equipment, nutrition)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `).bind(title, slug, description, status, source_url, source_domain, prep_time, cook_time, total_time, servings, cuisine, keywords, equipment, nutrition);
  const result = await stmt.first<{ id: number }>();
  return result?.id;
}

export async function getRecipeBySlug(db: D1Database, slug: string) {
  const cleanSlug = slug.replace(/^\/+|\/+$/g, '');
  const recipe = await db.prepare(`
    SELECT r.*, c.name as category_name, c.slug as category_slug
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.slug = ?
  `).bind(cleanSlug).first<any>();
  if (!recipe) return null;
  const ingredients = await db.prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY sort_order').bind(recipe.id).all<any>();
  const instructions = await db.prepare('SELECT * FROM instructions WHERE recipe_id = ? ORDER BY step_number').bind(recipe.id).all<any>();
  const content = await db.prepare('SELECT * FROM recipe_content WHERE recipe_id = ?').bind(recipe.id).first<any>();
  const seo = await db.prepare('SELECT * FROM recipe_seo WHERE recipe_id = ?').bind(recipe.id).first<any>();
  return { ...recipe, ingredients: ingredients.results || [], instructions: instructions.results || [], content, seo };
}

export async function getPublishedRecipeBySlug(db: D1Database, slug: string) {
  const cleanSlug = slug.replace(/^\/+|\/+$/g, '');
  const recipe = await db.prepare(`
    SELECT r.*, c.name as category_name, c.slug as category_slug
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.slug = ? AND r.status = 'PUBLISHED'
  `).bind(cleanSlug).first<any>();
  if (!recipe) return null;
  const ingredients = await db.prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY sort_order').bind(recipe.id).all<any>();
  const instructions = await db.prepare('SELECT * FROM instructions WHERE recipe_id = ? ORDER BY step_number').bind(recipe.id).all<any>();
  const content = await db.prepare('SELECT * FROM recipe_content WHERE recipe_id = ?').bind(recipe.id).first<any>();
  const seo = await db.prepare('SELECT * FROM recipe_seo WHERE recipe_id = ?').bind(recipe.id).first<any>();
  return { ...recipe, ingredients: ingredients.results || [], instructions: instructions.results || [], content, seo };
}

export async function getRecipeById(db: D1Database, id: number) {
  return await db.prepare('SELECT * FROM recipes WHERE id = ?').bind(id).first<any>();
}

export async function getRecipeWithAllDetails(db: D1Database, id: number) {
  const recipe = await db.prepare(`
    SELECT r.*, c.name as category_name, c.slug as category_slug
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.id = ?
  `).bind(id).first<any>();
  if (!recipe) return null;
  const ingredients = await db.prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY sort_order').bind(id).all<any>();
  const instructions = await db.prepare('SELECT * FROM instructions WHERE recipe_id = ? ORDER BY step_number').bind(id).all<any>();
  const content = await db.prepare('SELECT * FROM recipe_content WHERE recipe_id = ?').bind(id).first<any>();
  const seo = await db.prepare('SELECT * FROM recipe_seo WHERE recipe_id = ?').bind(id).first<any>();
  const job = await db.prepare('SELECT * FROM generation_jobs WHERE recipe_id = ? ORDER BY created_at DESC LIMIT 1').bind(id).first<any>();
  const jobHistory = await db.prepare('SELECT * FROM generation_jobs WHERE recipe_id = ? ORDER BY created_at DESC LIMIT 5').bind(id).all<any>();
  return {
    ...recipe,
    ingredients: ingredients.results || [],
    instructions: instructions.results || [],
    content: content || null,
    seo: seo || null,
    job: job || null,
    jobHistory: jobHistory.results || []
  };
}

export async function updateRecipe(db: D1Database, id: number, data: any) {
  if (data.slug) {
    try {
      const existing = await db.prepare('SELECT slug FROM recipes WHERE id = ?').bind(id).first<any>();
      if (existing && existing.slug && existing.slug !== data.slug) {
        const { recordSlugChange } = await import('../seo/redirects');
        await recordSlugChange(db, existing.slug, data.slug, id);
      }
    } catch (e) {
      console.error('Error tracking slug change:', e);
    }
  }
  const keys = Object.keys(data);
  const values = Object.values(data).map(v => {
    if (v !== null && typeof v === 'object') {
      return JSON.stringify(v);
    }
    return v;
  });
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  await db.prepare(`UPDATE recipes SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).bind(...values, id).run();
}

export async function updateRecipeStatus(db: D1Database, id: number, status: string) {
  await db.prepare('UPDATE recipes SET status = ?, updated_at = datetime("now") WHERE id = ?').bind(status, id).run();
}

export async function publishRecipe(db: D1Database, id: number) {
  await db.prepare('UPDATE recipes SET status = "PUBLISHED", published_at = datetime("now"), updated_at = datetime("now") WHERE id = ?').bind(id).run();
}

export async function unpublishRecipe(db: D1Database, id: number) {
  await db.prepare('UPDATE recipes SET status = "DRAFT", published_at = NULL, updated_at = datetime("now") WHERE id = ?').bind(id).run();
}

export async function deleteRecipe(db: D1Database, id: number): Promise<void> {
  // Cascading deletes in SQLite
  await db.batch([
    db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').bind(id),
    db.prepare('DELETE FROM instructions WHERE recipe_id = ?').bind(id),
    db.prepare('DELETE FROM recipe_content WHERE recipe_id = ?').bind(id),
    db.prepare('DELETE FROM recipe_seo WHERE recipe_id = ?').bind(id),
    db.prepare('UPDATE generation_jobs SET recipe_id = NULL WHERE recipe_id = ?').bind(id),
    db.prepare('DELETE FROM recipes WHERE id = ?').bind(id),
  ]);
}

export async function listRecipes(db: D1Database, opts?: { status?: string; quality?: string; search?: string; limit?: number; offset?: number }) {
  let query = `
    SELECT r.*, c.name as category_name 
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (opts?.status && opts.status !== 'all') {
    query += ' AND r.status = ?';
    params.push(opts.status.toUpperCase());
  }
  if (opts?.quality && opts.quality !== 'all') {
    if (opts.quality === 'passed') {
      query += ' AND (r.quality_status = "QUALITY_PASSED" OR (r.quality_score >= 80 AND r.quality_status IS NULL))';
    } else if (opts.quality === 'review') {
      query += ' AND (r.quality_status = "QUALITY_REVIEW" OR (r.quality_score < 80 AND r.quality_score >= 50))';
    } else if (opts.quality === 'failed') {
      query += ' AND (r.quality_status = "QUALITY_FAILED" OR (r.quality_score < 50 AND r.quality_score IS NOT NULL))';
    }
  }
  if (opts?.search) {
    const term = `%${opts.search.trim().toLowerCase()}%`;
    query += ' AND (LOWER(r.title) LIKE ? OR LOWER(r.slug) LIKE ? OR LOWER(r.source_url) LIKE ?)';
    params.push(term, term, term);
  }
  query += ' ORDER BY r.updated_at DESC, r.created_at DESC LIMIT ? OFFSET ?';
  params.push(opts?.limit || 20, opts?.offset || 0);
  const result = await db.prepare(query).bind(...params).all<any>();
  return result.results || [];
}

export async function countRecipes(db: D1Database, opts?: { status?: string; quality?: string; search?: string }): Promise<number> {
  let query = `SELECT COUNT(*) as total FROM recipes r WHERE 1=1`;
  const params: any[] = [];
  if (opts?.status && opts.status !== 'all') {
    query += ' AND r.status = ?';
    params.push(opts.status.toUpperCase());
  }
  if (opts?.quality && opts.quality !== 'all') {
    if (opts.quality === 'passed') {
      query += ' AND (r.quality_status = "QUALITY_PASSED" OR (r.quality_score >= 80 AND r.quality_status IS NULL))';
    } else if (opts.quality === 'review') {
      query += ' AND (r.quality_status = "QUALITY_REVIEW" OR (r.quality_score < 80 AND r.quality_score >= 50))';
    } else if (opts.quality === 'failed') {
      query += ' AND (r.quality_status = "QUALITY_FAILED" OR (r.quality_score < 50 AND r.quality_score IS NOT NULL))';
    }
  }
  if (opts?.search) {
    const term = `%${opts.search.trim().toLowerCase()}%`;
    query += ' AND (LOWER(r.title) LIKE ? OR LOWER(r.slug) LIKE ? OR LOWER(r.source_url) LIKE ?)';
    params.push(term, term, term);
  }
  const result = await db.prepare(query).bind(...params).first<{ total: number }>();
  return result?.total || 0;
}

export async function getPublishedRecipes(db: D1Database, limit = 12, offset = 0) {
  const result = await db.prepare(`
    SELECT r.*, c.name as category_name, c.slug as category_slug
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.status = 'PUBLISHED'
    ORDER BY r.published_at DESC, r.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all<any>();
  return result.results || [];
}

export async function getFeaturedRecipe(db: D1Database) {
  const result = await db.prepare(`
    SELECT r.*, c.name as category_name, c.slug as category_slug
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.status = 'PUBLISHED'
    ORDER BY r.published_at DESC, r.created_at DESC
    LIMIT 1
  `).first<any>();
  return result || null;
}

export async function getPublishedRecipesByCategory(db: D1Database, categorySlug: string, limit = 24) {
  const result = await db.prepare(`
    SELECT r.*, c.name as category_name, c.slug as category_slug
    FROM recipes r
    JOIN categories c ON r.category_id = c.id
    WHERE r.status = 'PUBLISHED' AND c.slug = ?
    ORDER BY r.published_at DESC, r.created_at DESC
    LIMIT ?
  `).bind(categorySlug, limit).all<any>();
  return result.results || [];
}

export async function searchPublishedRecipes(db: D1Database, searchQuery: string, limit = 24) {
  const term = `%${searchQuery.trim().toLowerCase()}%`;
  const result = await db.prepare(`
    SELECT r.*, c.name as category_name, c.slug as category_slug
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.status = 'PUBLISHED' AND (
      LOWER(r.title) LIKE ? OR
      LOWER(r.description) LIKE ? OR
      LOWER(r.keywords) LIKE ? OR
      LOWER(r.cuisine) LIKE ?
    )
    ORDER BY r.published_at DESC
    LIMIT ?
  `).bind(term, term, term, term, limit).all<any>();
  return result.results || [];
}

export async function getRelatedRecipes(db: D1Database, currentRecipeId: number, categoryId?: number | null, limit = 3) {
  if (categoryId) {
    const result = await db.prepare(`
      SELECT r.*, c.name as category_name, c.slug as category_slug
      FROM recipes r
      LEFT JOIN categories c ON r.category_id = c.id
      WHERE r.status = 'PUBLISHED' AND r.id != ? AND r.category_id = ?
      ORDER BY r.published_at DESC
      LIMIT ?
    `).bind(currentRecipeId, categoryId, limit).all<any>();
    if (result.results && result.results.length >= limit) return result.results;
  }

  const result = await db.prepare(`
    SELECT r.*, c.name as category_name, c.slug as category_slug
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.status = 'PUBLISHED' AND r.id != ?
    ORDER BY r.published_at DESC
    LIMIT ?
  `).bind(currentRecipeId, limit).all<any>();
  return result.results || [];
}

export async function getAllPublishedSlugs(db: D1Database): Promise<{ recipes: Array<{ slug: string; updated_at: string }>; categories: Array<{ slug: string }> }> {
  const recipes = await db.prepare('SELECT slug, updated_at FROM recipes WHERE status = "PUBLISHED"').all<any>();
  const categories = await db.prepare('SELECT slug FROM categories').all<any>();
  return {
    recipes: recipes.results || [],
    categories: categories.results || []
  };
}

export async function createIngredients(db: D1Database, recipeId: number, ingredients: any[]) {
  const stmts = ingredients.map((ing, i) => 
    db.prepare('INSERT INTO ingredients (recipe_id, quantity, unit, name, notes, sort_order, original_text) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(recipeId, ing.quantity || '', ing.unit || '', ing.name, ing.notes || '', i, ing.originalText || '')
  );
  if (stmts.length) await db.batch(stmts);
}

export async function replaceRecipeIngredients(db: D1Database, recipeId: number, ingredients: any[]) {
  await db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').bind(recipeId).run();
  await createIngredients(db, recipeId, ingredients);
}

export async function createInstructions(db: D1Database, recipeId: number, instructions: any[]) {
  const stmts = instructions.map((inst, i) => 
    db.prepare('INSERT INTO instructions (recipe_id, step_number, instruction) VALUES (?, ?, ?)')
      .bind(recipeId, inst.stepNumber || (i + 1), inst.text || inst.instruction)
  );
  if (stmts.length) await db.batch(stmts);
}

export async function replaceRecipeInstructions(db: D1Database, recipeId: number, instructions: any[]) {
  await db.prepare('DELETE FROM instructions WHERE recipe_id = ?').bind(recipeId).run();
  await createInstructions(db, recipeId, instructions);
}

export async function upsertRecipeContent(db: D1Database, recipeId: number, content: any) {
  const { introduction, why_this_recipe, ingredient_guidance, cooking_guidance, tips, variations, serving_suggestions, storage, faq, full_article, content_prompt_version } = content;

  const toText = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('\n\n');
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  await db.prepare(`
    INSERT INTO recipe_content (recipe_id, introduction, why_this_recipe, ingredient_guidance, cooking_guidance, tips, variations, serving_suggestions, storage, faq, full_article, content_prompt_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(recipe_id) DO UPDATE SET
      introduction=excluded.introduction,
      why_this_recipe=excluded.why_this_recipe,
      ingredient_guidance=excluded.ingredient_guidance,
      cooking_guidance=excluded.cooking_guidance,
      tips=excluded.tips,
      variations=excluded.variations,
      serving_suggestions=excluded.serving_suggestions,
      storage=excluded.storage,
      faq=excluded.faq,
      full_article=excluded.full_article,
      content_prompt_version=excluded.content_prompt_version,
      updated_at=datetime('now')
  `).bind(
    recipeId,
    toText(introduction),
    toText(why_this_recipe),
    typeof ingredient_guidance === 'string' ? ingredient_guidance : JSON.stringify(ingredient_guidance || []),
    typeof cooking_guidance === 'string' ? cooking_guidance : JSON.stringify(cooking_guidance || []),
    typeof tips === 'string' ? tips : JSON.stringify(tips || []),
    typeof variations === 'string' ? variations : JSON.stringify(variations || []),
    toText(serving_suggestions),
    toText(storage),
    typeof faq === 'string' ? faq : JSON.stringify(faq || []),
    toText(full_article),
    content_prompt_version || 'v2'
  ).run();
}

export async function upsertRecipeSeo(db: D1Database, recipeId: number, seo: any) {
  const { seo_title, meta_description, canonical_url, og_title, og_description } = seo;
  await db.prepare(`
    INSERT INTO recipe_seo (recipe_id, seo_title, meta_description, canonical_url, og_title, og_description)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(recipe_id) DO UPDATE SET
      seo_title=excluded.seo_title,
      meta_description=excluded.meta_description,
      canonical_url=excluded.canonical_url,
      og_title=excluded.og_title,
      og_description=excluded.og_description
  `).bind(recipeId, seo_title || '', meta_description || '', canonical_url || '', og_title || seo_title || '', og_description || meta_description || '').run();
}

export async function getCategories(db: D1Database) {
  const res = await db.prepare('SELECT * FROM categories ORDER BY name').all<any>();
  return res.results || [];
}

export async function getCategoryBySlug(db: D1Database, slug: string) {
  return await db.prepare('SELECT * FROM categories WHERE slug = ?').bind(slug).first<any>();
}

export async function createGenerationJob(db: D1Database, sourceUrl: string) {
  const res = await db.prepare('INSERT INTO generation_jobs (source_url) VALUES (?) RETURNING id').bind(sourceUrl).first<{id: number}>();
  return res?.id;
}

export async function updateJobStatus(db: D1Database, jobId: number, status: string, stage?: string, error?: string) {
  let query = 'UPDATE generation_jobs SET status = ?, updated_at = datetime("now")';
  const params: any[] = [status];
  if (stage) {
    query += ', current_stage = ?';
    params.push(stage);
  }
  if (error) {
    query += ', error_message = ?';
    params.push(error);
  }
  if (status === 'COMPLETED' || status === 'FAILED') {
    query += ', completed_at = datetime("now")';
  }
  query += ' WHERE id = ?';
  params.push(jobId);
  await db.prepare(query).bind(...params).run();
}

export async function saveJobStageResults(db: D1Database, jobId: number, stage: string, results: any): Promise<void> {
  const serialized = typeof results === 'string' ? results : JSON.stringify(results);
  await db.prepare(`
    UPDATE generation_jobs 
    SET current_stage = ?, stage_results = ?, updated_at = datetime('now') 
    WHERE id = ?
  `).bind(stage, serialized, jobId).run();
}

export async function getJob(db: D1Database, jobId: number) {
  return await db.prepare('SELECT * FROM generation_jobs WHERE id = ?').bind(jobId).first<any>();
}

export async function getJobByRecipeId(db: D1Database, recipeId: number): Promise<any> {
  return await db.prepare('SELECT * FROM generation_jobs WHERE recipe_id = ? ORDER BY created_at DESC LIMIT 1').bind(recipeId).first<any>();
}

export async function listRecentGenerationJobs(db: D1Database, limit = 15): Promise<any[]> {
  try {
    const { results } = await db.prepare(`
      SELECT j.*, r.title as recipe_title, r.slug as recipe_slug, r.status as recipe_status
      FROM generation_jobs j
      LEFT JOIN recipes r ON j.recipe_id = r.id
      ORDER BY j.id DESC
      LIMIT ?
    `).bind(limit).all();
    return results || [];
  } catch (err) {
    console.error('[db/recipes] Error listing recent jobs:', err);
    return [];
  }
}

export async function getDashboardStats(db: D1Database) {
  const total = await db.prepare('SELECT COUNT(*) as c FROM recipes').first<{c: number}>();
  const pub = await db.prepare('SELECT COUNT(*) as c FROM recipes WHERE status = "PUBLISHED"').first<{c: number}>();
  const draft = await db.prepare('SELECT COUNT(*) as c FROM recipes WHERE status = "DRAFT"').first<{c: number}>();
  const processing = await db.prepare('SELECT COUNT(*) as c FROM recipes WHERE status = "PROCESSING"').first<{c: number}>();
  const failed = await db.prepare('SELECT COUNT(*) as c FROM recipes WHERE status = "FAILED"').first<{c: number}>();
  const imported = await db.prepare('SELECT COUNT(*) as c FROM recipes WHERE status = "IMPORTED"').first<{c: number}>();
  return {
    total: total?.c || 0,
    published: pub?.c || 0,
    drafts: draft?.c || 0,
    processing: processing?.c || 0,
    failed: failed?.c || 0,
    imported: imported?.c || 0
  };
}

export async function getDashboardAttentionItems(db: D1Database) {
  const failedJobs = await db.prepare(`
    SELECT j.*, r.title as recipe_title, r.slug
    FROM generation_jobs j
    LEFT JOIN recipes r ON j.recipe_id = r.id
    WHERE j.status = 'FAILED'
    ORDER BY j.updated_at DESC LIMIT 5
  `).all<any>();

  const processingJobs = await db.prepare(`
    SELECT j.*, r.title as recipe_title, r.slug
    FROM generation_jobs j
    LEFT JOIN recipes r ON j.recipe_id = r.id
    WHERE j.status = 'RUNNING'
    ORDER BY j.updated_at DESC LIMIT 5
  `).all<any>();

  const draftsAwaitingReview = await db.prepare(`
    SELECT r.*, c.name as category_name
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.status = 'DRAFT'
    ORDER BY r.updated_at DESC LIMIT 5
  `).all<any>();

  const recentlyPublished = await db.prepare(`
    SELECT r.*, c.name as category_name
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.status = 'PUBLISHED'
    ORDER BY r.published_at DESC LIMIT 5
  `).all<any>();

  const recentImports = await db.prepare(`
    SELECT r.*, c.name as category_name
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.status = 'IMPORTED'
    ORDER BY r.created_at DESC LIMIT 5
  `).all<any>();

  return {
    failedJobs: failedJobs.results || [],
    processingJobs: processingJobs.results || [],
    draftsAwaitingReview: draftsAwaitingReview.results || [],
    recentlyPublished: recentlyPublished.results || [],
    recentImports: recentImports.results || []
  };
}

export async function checkDuplicate(db: D1Database, sourceUrl?: string, slug?: string, title?: string) {
  if (sourceUrl && sourceUrl.trim().length > 0) {
    const byUrl = await db.prepare('SELECT id FROM recipes WHERE source_url = ? AND status != "FAILED"').bind(sourceUrl.trim()).first<any>();
    if (byUrl) return { isDuplicate: true, existingId: byUrl.id, reason: 'source_url' };
  }
  if (slug && slug.trim().length > 0) {
    const bySlug = await db.prepare('SELECT id FROM recipes WHERE slug = ? AND status != "FAILED"').bind(slug.trim()).first<any>();
    if (bySlug) return { isDuplicate: true, existingId: bySlug.id, reason: 'slug' };
  }
  if (title && title.trim().length >= 3) {
    const byTitle = await db.prepare('SELECT id FROM recipes WHERE title LIKE ? AND status != "FAILED"').bind(`%${title.trim()}%`).first<any>();
    if (byTitle) return { isDuplicate: true, existingId: byTitle.id, reason: 'title' };
  }
  return { isDuplicate: false };
}

export async function updateRecipeExtractionData(
  db: D1Database,
  recipeId: number,
  data: {
    rawExtractionData?: any;
    factSheet?: any;
    extractionMethod?: string;
    extractionConfidence?: string;
    originalImageUrl?: string | null;
    yieldText?: string;
    notes?: string | null;
  }
): Promise<void> {
  const keys = Object.keys(data);
  if (keys.length === 0) return;
  const dbKeys = keys.map(k => {
    switch (k) {
      case 'rawExtractionData': return 'raw_extraction_data';
      case 'factSheet': return 'fact_sheet';
      case 'extractionMethod': return 'extraction_method';
      case 'extractionConfidence': return 'extraction_confidence';
      case 'originalImageUrl': return 'original_image_url';
      case 'yieldText': return 'yield_text';
      default: return k;
    }
  });
  const setClause = dbKeys.map(k => `${k} = ?`).join(', ');
  const values = Object.values(data).map(v => {
    if (v !== null && typeof v === 'object') {
      return JSON.stringify(v);
    }
    return v;
  });
  await db.prepare(`UPDATE recipes SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).bind(...values, recipeId).run();
}

export async function saveIngredientsWithOriginal(
  db: D1Database,
  recipeId: number,
  ingredients: Array<{ originalText?: string; quantity: string; unit: string; name: string; notes: string }>
): Promise<void> {
  const stmts = ingredients.map((ing, i) => 
    db.prepare('INSERT INTO ingredients (recipe_id, quantity, unit, name, notes, sort_order, original_text) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(recipeId, ing.quantity || '', ing.unit || '', ing.name, ing.notes || '', i, ing.originalText || '')
  );
  if (stmts.length) await db.batch(stmts);
}

export async function linkJobToRecipe(db: D1Database, jobId: number, recipeId: number): Promise<void> {
  await db.prepare('UPDATE generation_jobs SET recipe_id = ? WHERE id = ?').bind(recipeId, jobId).run();
}

export async function getRecipeBySourceUrl(db: D1Database, sourceUrl: string): Promise<{ id: number; slug: string } | null> {
  const res = await db.prepare('SELECT id, slug FROM recipes WHERE source_url = ? AND status != "FAILED"').bind(sourceUrl).first<{id: number, slug: string}>();
  return res || null;
}

export async function getRecentJobs(db: D1Database, limit = 10): Promise<any[]> {
  const res = await db.prepare(`
    SELECT j.*, r.title as recipe_title, r.slug 
    FROM generation_jobs j
    LEFT JOIN recipes r ON j.recipe_id = r.id
    ORDER BY j.created_at DESC LIMIT ?
  `).bind(limit).all<any>();
  return res.results || [];
}

export async function saveQualityReport(
  db: D1Database,
  recipeId: number,
  report: any
): Promise<void> {
  const qualityStatus = report.status === 'PASS' ? 'QUALITY_PASSED' : (report.status === 'FAIL' ? 'QUALITY_FAILED' : 'QUALITY_REVIEW');
  const claimLedgerStr = report.claimLedger ? JSON.stringify(report.claimLedger) : null;
  const promptVersion = report.contentPromptVersion || 'v2';

  await db.prepare(`
    UPDATE recipes 
    SET quality_status = ?,
        quality_score = ?,
        quality_report = ?,
        quality_checked_at = datetime('now'),
        content_prompt_version = ?,
        claim_ledger = COALESCE(?, claim_ledger),
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(qualityStatus, report.score || 0, JSON.stringify(report), promptVersion, claimLedgerStr, recipeId).run();
}

export async function getQualityReport(db: D1Database, recipeId: number): Promise<any | null> {
  const res = await db.prepare('SELECT quality_status, quality_score, quality_report, quality_checked_at FROM recipes WHERE id = ?').bind(recipeId).first<any>();
  if (!res || !res.quality_report) return null;
  try {
    return typeof res.quality_report === 'string' ? JSON.parse(res.quality_report) : res.quality_report;
  } catch {
    return null;
  }
}
