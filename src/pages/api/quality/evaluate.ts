import type { APIRoute } from 'astro';
import { getRecipeWithAllDetails, saveQualityReport } from '../../../lib/db/recipes';
import { reconstructFactSheet } from '../../../lib/pipeline/runner';
import { evaluateRecipeQuality } from '../../../lib/quality/engine';
import { repairRecipeContent } from '../../../lib/quality/repair';
import { createDeepSeekClient } from '../../../lib/deepseek/client';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId, autoRepair = true } = body || {};

    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing recipeId in request body.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;
    const id = parseInt(recipeId, 10);

    const recipe = await getRecipeWithAllDetails(db, id);
    if (!recipe) {
      return new Response(JSON.stringify({ success: false, error: 'Recipe not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const factSheet = reconstructFactSheet(recipe);
    const rawContent = recipe.content || {};
    const toSafeString = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'string') return val;
      if (typeof val === 'object') {
        if (typeof val.introduction === 'string') return val.introduction;
        if (typeof val.whyThisRecipe === 'string') return val.whyThisRecipe;
        if (typeof val.text === 'string') return val.text;
        if (typeof val.content === 'string') return val.content;
      }
      return String(val);
    };

    const generatedContent = {
      introduction: toSafeString(rawContent.introduction),
      whyThisRecipe: toSafeString(rawContent.why_this_recipe),
      ingredientGuidance: typeof rawContent.ingredient_guidance === 'string' ? JSON.parse(rawContent.ingredient_guidance || '[]') : (rawContent.ingredient_guidance || []),
      cookingGuidance: typeof rawContent.cooking_guidance === 'string' ? JSON.parse(rawContent.cooking_guidance || '[]') : (rawContent.cooking_guidance || []),
      tips: typeof rawContent.tips === 'string' ? JSON.parse(rawContent.tips || '[]') : (rawContent.tips || []),
      variations: typeof rawContent.variations === 'string' ? JSON.parse(rawContent.variations || '[]') : (rawContent.variations || []),
      servingSuggestions: toSafeString(rawContent.serving_suggestions),
      storage: toSafeString(rawContent.storage),
      faq: typeof rawContent.faq === 'string' ? JSON.parse(rawContent.faq || '[]') : (rawContent.faq || []),
      seo: {
        title: recipe.seo?.seo_title || recipe.title,
        metaDescription: recipe.seo?.meta_description || recipe.description || '',
        slug: recipe.slug
      },
      fullArticle: toSafeString(rawContent.full_article)
    };

    // 1. Initial Evaluation
    let report = evaluateRecipeQuality(factSheet.lockedFacts, generatedContent);
    let passesRun = 0;

    // 2. Safe Auto Repair if required and enabled
    if (autoRepair && report.status !== 'PASS') {
      const aiClient = env.DEEPSEEK_API_KEY ? createDeepSeekClient(env.DEEPSEEK_API_KEY) : null;
      const repairOutcome = await repairRecipeContent(aiClient, factSheet, generatedContent, report);
      report = repairOutcome.finalReport;
      passesRun = repairOutcome.passesRun;
    }

    // 3. Save report to D1
    await saveQualityReport(db, id, report);

    return new Response(JSON.stringify({
      success: true,
      recipeId: id,
      report,
      passesRun
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/quality/evaluate] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Quality evaluation failed.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
