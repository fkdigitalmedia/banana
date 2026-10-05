import type { APIRoute } from 'astro';
import {
  createRecipe,
  updateRecipe,
  createIngredients,
  createInstructions,
  upsertRecipeContent,
  upsertRecipeSeo,
  checkDuplicate,
} from '../../../lib/db/recipes';
import { recordRevision } from '../../../lib/editorial/workflow';

export const prerender = false;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function parseLines(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((s) => String(s || '').trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);

    const title = String(body?.title || '').trim();
    const description = String(body?.description || '').trim();
    const categoryId = body?.category_id ? parseInt(body.category_id, 10) : null;
    const cuisine = String(body?.cuisine || '').trim() || null;
    const servings = String(body?.servings || '').trim() || null;
    const prepTime = body?.prep_time ? parseInt(body.prep_time, 10) : null;
    const cookTime = body?.cook_time ? parseInt(body.cook_time, 10) : null;
    const totalTime =
      body?.total_time != null && body?.total_time !== ''
        ? parseInt(body.total_time, 10)
        : (prepTime || 0) + (cookTime || 0) || null;
    const introduction = String(body?.introduction || '').trim();
    const heroImageUrl = String(body?.hero_image_url || '').trim() || null;

    const ingredientLines = parseLines(body?.ingredients);
    const instructionLines = parseLines(body?.instructions);
    const tipLines = parseLines(body?.tips);

    // ---- Validation ----
    if (title.length < 3) {
      return new Response(JSON.stringify({ success: false, error: 'Recipe title is required (min 3 characters).' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (ingredientLines.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Add at least one ingredient.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (instructionLines.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Add at least one instruction step.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    let slug = String(body?.slug || '').trim() || slugify(title);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      slug = slugify(slug) || slugify(title);
    }
    if (!slug) {
      return new Response(JSON.stringify({ success: false, error: 'Could not generate a valid URL slug from the title.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;

    // ---- Duplicate protection ----
    const dup = await checkDuplicate(db, undefined, slug, title);
    if (dup.isDuplicate) {
      // Try a suffixed slug before giving up
      let candidate = `${slug}-2`;
      let n = 2;
      while ((await checkDuplicate(db, undefined, candidate)).isDuplicate && n < 20) {
        n += 1;
        candidate = `${slug}-${n}`;
      }
      if (n >= 20) {
        return new Response(JSON.stringify({ success: false, error: 'A recipe with this title or slug already exists.', existingId: dup.existingId }), {
          status: 409, headers: { 'Content-Type': 'application/json' },
        });
      }
      slug = candidate;
    }

    // ---- Create recipe as DRAFT ----
    const recipeId = await createRecipe(db, {
      title,
      slug,
      description: description || null,
      status: 'DRAFT',
      source_url: null,
      source_domain: 'manual-entry',
      prep_time: prepTime,
      cook_time: cookTime,
      total_time: totalTime,
      servings,
      cuisine,
      keywords: null,
      equipment: null,
      nutrition: null,
    });

    if (!recipeId) {
      throw new Error('Failed to create recipe record.');
    }

    await updateRecipe(db, recipeId, {
      category_id: categoryId,
      extraction_method: 'manual',
      original_image_url: heroImageUrl,
    });

    // ---- Ingredients & instructions ----
    await createIngredients(
      db,
      recipeId,
      ingredientLines.map((line) => ({ quantity: '', unit: '', name: line, notes: '', originalText: line }))
    );
    await createInstructions(
      db,
      recipeId,
      instructionLines.map((line, i) => ({ stepNumber: i + 1, text: line }))
    );

    // ---- Editorial content ----
    await upsertRecipeContent(db, recipeId, {
      introduction: introduction || description,
      why_this_recipe: '',
      ingredient_guidance: [],
      cooking_guidance: [],
      tips: tipLines,
      variations: [],
      serving_suggestions: '',
      storage: '',
      faq: [],
      full_article: '',
      content_prompt_version: 'manual-v1',
    });

    // ---- SEO defaults (editable in the recipe editor) ----
    await upsertRecipeSeo(db, recipeId, {
      seo_title: title.slice(0, 60),
      meta_description: (description || `${title} — tested homemade recipe.`).slice(0, 160),
      canonical_url: `/${slug}/`,
    });

    await recordRevision(db, recipeId, 'CONTENT_EDIT', 'admin', 'Recipe created manually via admin panel');

    return new Response(JSON.stringify({ success: true, recipeId, slug, message: 'Manual recipe draft created.' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[/api/recipes/manual] Error:', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Failed to create manual recipe.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
