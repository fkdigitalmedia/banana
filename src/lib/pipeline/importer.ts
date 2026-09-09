import { fetchSource, extractRecipeFromPage, ExtractionError, validateUrl } from '../extraction';
import { normalizeRecipe, slugify } from '../normalization/normalizer';
import { createFactSheet } from './factsheet';
import type { ImportResult, SourceMetadata } from '../normalization/types';
import {
  createRecipe,
  createIngredients,
  createInstructions,
  updateRecipeExtractionData,
  createGenerationJob,
  linkJobToRecipe,
  getRecipeBySourceUrl,
  checkDuplicate,
  updateJobStatus,
  saveIngredientsWithOriginal
} from '../db/recipes';

export async function importRecipe(env: any, sourceUrl: string): Promise<ImportResult> {
  try {
    const validation = validateUrl(sourceUrl);
    if (!validation.valid) {
      return { success: false, error: validation.reason, errorCode: 'INVALID_URL' };
    }

    const existing = await getRecipeBySourceUrl(env.DB, sourceUrl);
    if (existing) {
      return { success: false, error: 'This recipe URL has already been imported.', errorCode: 'DUPLICATE', existingRecipeId: existing.id };
    }

    const fetchResult = await fetchSource(sourceUrl);
    const extractionResult = await extractRecipeFromPage(fetchResult.html, fetchResult.finalUrl);

    const sourceMetadata: SourceMetadata = {
      sourceUrl: fetchResult.finalUrl,
      sourceDomain: fetchResult.domain,
      importedAt: new Date().toISOString(),
      extractionMethod: extractionResult.method,
      extractionConfidence: extractionResult.confidence,
      originalImageUrl: extractionResult.data.image || null,
      yieldText: extractionResult.data.servings || '',
    };

    const normalized = normalizeRecipe(extractionResult.data, sourceMetadata);

    let slug = normalized.slug;
    const dupCheck = await checkDuplicate(env.DB, fetchResult.finalUrl, slug, normalized.title);
    if (dupCheck.isDuplicate && dupCheck.reason === 'slug') {
      let counter = 2;
      while (true) {
        const candidateSlug = `${slug}-${counter}`;
        const dupCheck2 = await checkDuplicate(env.DB, fetchResult.finalUrl, candidateSlug, '');
        if (!dupCheck2.isDuplicate) { 
          slug = candidateSlug; 
          break; 
        }
        counter++;
        if (counter > 20) break;
      }
    }

    const recipeId = await createRecipe(env.DB, {
      title: normalized.title,
      slug,
      description: normalized.description,
      status: 'IMPORTED',
      source_url: sourceMetadata.sourceUrl,
      source_domain: sourceMetadata.sourceDomain,
      prep_time: normalized.prepTime,
      cook_time: normalized.cookTime,
      total_time: normalized.totalTime,
      servings: normalized.servings,
      cuisine: normalized.cuisine,
      keywords: JSON.stringify(normalized.keywords),
      equipment: JSON.stringify(normalized.equipment),
      nutrition: JSON.stringify(normalized.nutrition)
    });

    if (!recipeId) throw new Error('Failed to insert recipe into database.');

    await saveIngredientsWithOriginal(env.DB, recipeId, normalized.ingredients);
    await createInstructions(env.DB, recipeId, normalized.instructions);

    const factSheet = createFactSheet(normalized);
    
    await updateRecipeExtractionData(env.DB, recipeId, {
      rawExtractionData: JSON.stringify(extractionResult.rawData),
      factSheet: JSON.stringify(factSheet),
      extractionMethod: sourceMetadata.extractionMethod,
      extractionConfidence: sourceMetadata.extractionConfidence,
      originalImageUrl: sourceMetadata.originalImageUrl,
      yieldText: sourceMetadata.yieldText,
      notes: JSON.stringify(normalized.notes)
    });

    const jobId = await createGenerationJob(env.DB, fetchResult.finalUrl);
    if (jobId) {
      await linkJobToRecipe(env.DB, jobId, recipeId);
      await updateJobStatus(env.DB, jobId, 'PENDING', 'IMPORTED');
    }

    return {
      success: true,
      recipeId,
      jobId,
      recipe: {
        title: normalized.title,
        slug,
        ingredientCount: normalized.ingredients.length,
        instructionCount: normalized.instructions.length,
        prepTime: normalized.prepTime,
        cookTime: normalized.cookTime,
        servings: normalized.servings,
        extractionMethod: sourceMetadata.extractionMethod,
        extractionConfidence: sourceMetadata.extractionConfidence,
        sourceDomain: sourceMetadata.sourceDomain,
        hasImage: !!sourceMetadata.originalImageUrl,
        hasNutrition: Object.keys(normalized.nutrition).length > 0,
      }
    };
  } catch (err: any) {
    if (err instanceof ExtractionError) {
      return { success: false, error: err.message, errorCode: err.code };
    }
    console.error('Import failed:', err);
    return { success: false, error: 'Import failed due to an internal error.', errorCode: 'INTERNAL' };
  }
}
