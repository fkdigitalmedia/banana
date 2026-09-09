import type { APIRoute } from 'astro';
import { getRecipeWithAllDetails, publishRecipe, saveQualityReport } from '../../lib/db/recipes';
import { recordRevision } from '../../lib/editorial/workflow';
import { invalidateRelatedCache } from '../../lib/seo/linking';
import { reconstructFactSheet } from '../../lib/pipeline/runner';
import { evaluateRecipeQuality } from '../../lib/quality/engine';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId, force } = body || {};

    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing recipeId in request.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;

    const recipe = await getRecipeWithAllDetails(db, parseInt(recipeId, 10));
    if (!recipe) {
      return new Response(JSON.stringify({ success: false, error: 'Recipe not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Allowed statuses for publishing: APPROVED, DRAFT, REVIEW_REQUIRED
    const ALLOWED_PUBLISH_STATUSES = ['APPROVED', 'DRAFT', 'REVIEW_REQUIRED'];
    if (!ALLOWED_PUBLISH_STATUSES.includes(recipe.status)) {
      return new Response(JSON.stringify({
        success: false,
        error: `Recipe cannot be published from status "${recipe.status}". It must be a draft or approved recipe.`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Auto-record approval revision if publishing directly from DRAFT or REVIEW_REQUIRED
    if (recipe.status !== 'APPROVED') {
      await recordRevision(db, recipe.id, 'APPROVED', 'admin', 'Recipe approved for publication by administrator');
    }

    // 1. Run Quality & Fact-Consistency evaluation prior to publishing
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

      const qualityReport = evaluateRecipeQuality(factSheet.lockedFacts, generatedContent);
      await saveQualityReport(db, recipe.id, qualityReport);

      const highSeverityIssues = qualityReport.issues.filter(i => i.severity === 'HIGH');
      
      if (highSeverityIssues.length > 0) {
        return new Response(JSON.stringify({
          success: false,
          error: `Publishing blocked by Quality Gate: ${highSeverityIssues[0].message}`,
          issues: qualityReport.issues,
          qualityScore: qualityReport.score,
          qualityStatus: qualityReport.status
        }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 2. Run Technical SEO Validation
    const { validateTechnicalSeo, isPrePublishSeoPassed } = await import('../../lib/seo/validation');
    const { analyzeInternalLinks } = await import('../../lib/seo/internal-links');
    const linkAnalysis = await analyzeInternalLinks(db, recipe.id, recipe.slug, recipe.category_id, recipe.cuisine);
    const siteUrl = env.SITE_URL || 'https://yoursite.com';

    const seoReport = validateTechnicalSeo(
      recipe,
      recipe.ingredients || [],
      recipe.instructions || [],
      recipe.content || {},
      recipe.seo || {},
      siteUrl,
      { incomingLinksCount: linkAnalysis.incomingLinksCount }
    );

    if (!isPrePublishSeoPassed(seoReport) && !force) {
      const criticalSeo = seoReport.issues.find(i => i.level === 'CRITICAL');
      return new Response(JSON.stringify({
        success: false,
        error: `Publishing blocked by Technical SEO Gate: ${criticalSeo?.message || 'Critical SEO issue detected.'}`,
        seoReport
      }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await publishRecipe(db, recipe.id);
    await recordRevision(db, recipe.id, 'PUBLISHED', 'admin', 'Recipe published to live website');
    await invalidateRelatedCache(db);

    return new Response(JSON.stringify({
      success: true,
      recipeId: recipe.id,
      slug: recipe.slug,
      status: 'PUBLISHED'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/publish] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Failed to publish recipe.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
