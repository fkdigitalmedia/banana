import type { APIRoute } from 'astro';
import { getRecipeWithAllDetails, saveQualityReport, upsertRecipeContent } from '../../../lib/db/recipes';
import { reconstructFactSheet } from '../../../lib/pipeline/runner';
import { evaluateRecipeQuality } from '../../../lib/quality/engine';
import { repairRecipeContent } from '../../../lib/quality/repair';
import { createDeepSeekClient } from '../../../lib/deepseek/client';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId, issueIndex, issueType } = body || {};

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

    // 2. Run Automated Repair Passes
    const aiClient = env.DEEPSEEK_API_KEY ? createDeepSeekClient(env.DEEPSEEK_API_KEY) : null;
    const repairOutcome = await repairRecipeContent(aiClient, factSheet, generatedContent, report);
    const repairedContent = repairOutcome.repairedContent;
    const finalReport = repairOutcome.finalReport;

    // 3. Save repaired editorial content to D1
    await upsertRecipeContent(db, id, {
      introduction: repairedContent.introduction,
      why_this_recipe: repairedContent.whyThisRecipe,
      ingredient_guidance: repairedContent.ingredientGuidance,
      cooking_guidance: repairedContent.cookingGuidance,
      tips: repairedContent.tips,
      variations: repairedContent.variations,
      serving_suggestions: repairedContent.servingSuggestions,
      storage: repairedContent.storage,
      faq: repairedContent.faq,
      full_article: repairedContent.fullArticle
    });

    // 4. Save updated Quality Report to D1
    await saveQualityReport(db, id, finalReport);

    return new Response(JSON.stringify({
      success: true,
      recipeId: id,
      message: `Quality issues resolved! Quality score is now ${finalReport.score}/100 (${finalReport.status}).`,
      report: finalReport,
      content: {
        introduction: repairedContent.introduction,
        why_this_recipe: repairedContent.whyThisRecipe,
        ingredient_guidance: repairedContent.ingredientGuidance,
        cooking_guidance: repairedContent.cookingGuidance,
        tips: repairedContent.tips,
        variations: repairedContent.variations,
        serving_suggestions: repairedContent.servingSuggestions,
        storage: repairedContent.storage,
        faq: repairedContent.faq,
        full_article: repairedContent.fullArticle
      },
      passesRun: repairOutcome.passesRun
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/quality/repair] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Failed to auto-repair quality issues.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
