/**
 * Master Recipe Extraction Orchestrator
 * 
 * Implements strict extraction priority:
 * 1. Structured JSON-LD Recipe data (including @graph and multi-recipe resolution)
 * 2. Clearly identifiable HTML fallback structures
 * 
 * Performs:
 * - Deterministic recipe selection
 * - Fact conflict detection (e.g. TEMPERATURE_CONFLICT)
 * - Transparent extraction confidence grading
 * - Source URL canonicalization
 */

import { fetchSource, validateUrl, ExtractionError, type FetchResult, type UrlValidationResult } from './fetcher';
import { extractJsonLd } from './jsonld';
import { extractFromHtml } from './html';
import { canonicalizeUrl } from './canonical';
import { detectFactConflicts, type ConflictDetectionResult } from './conflicts';
import { evaluateExtractionConfidence, type ExtractionConfidenceResult } from './confidence';
import { extractBestRecipeImage, extractAllRecipeImages } from './image';
import type { RawRecipeData } from '../normalization/types';

export { ExtractionError };
export type { UrlValidationResult, FetchResult };
export { fetchSource, validateUrl };

export interface ExtractionResult {
  data: RawRecipeData;
  method: 'json-ld' | 'html-fallback';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceReport: ExtractionConfidenceResult;
  conflicts: ConflictDetectionResult;
  foundFields: string[];
  rawData: any;
  canonicalUrl: string;
}

export async function extractRecipeFromPage(html: string, pageUrl: string): Promise<ExtractionResult> {
  const canonicalUrl = canonicalizeUrl(pageUrl);

  // 1. Primary Source: Structured JSON-LD
  const jsonLdResult = extractJsonLd(html, canonicalUrl);

  let candidateData: RawRecipeData | null = null;
  let method: 'json-ld' | 'html-fallback' = 'json-ld';
  let rawData: any = null;
  let foundFields: string[] = [];
  let isAmbiguous = false;

  if (jsonLdResult && (jsonLdResult.confidence === 'HIGH' || jsonLdResult.confidence === 'MEDIUM')) {
    candidateData = jsonLdResult.data;
    method = 'json-ld';
    rawData = jsonLdResult.rawRecipeObject;
    foundFields = jsonLdResult.foundFields;
    isAmbiguous = Boolean(jsonLdResult.isAmbiguous);
  } else {
    // 2. Secondary Source: Structured HTML Fallback
    const htmlResult = extractFromHtml(html);
    if (htmlResult && (htmlResult.confidence === 'HIGH' || htmlResult.confidence === 'MEDIUM')) {
      candidateData = htmlResult.data;
      method = 'html-fallback';
      rawData = htmlResult.data;
      foundFields = htmlResult.foundFields;
    }
  }

  if (!candidateData) {
    throw new ExtractionError('NO_RECIPE', 'No usable recipe data found on this page.');
  }

  // 2b. Extract verified food images (hero + in-article process photos)
  const imageResults = extractAllRecipeImages(html, rawData, canonicalUrl);
  if (imageResults.hero?.url) {
    candidateData.image = imageResults.hero.url;
  }
  if (imageResults.inArticle && imageResults.inArticle.length > 0) {
    candidateData.additionalImages = imageResults.inArticle.map(img => ({
      url: img.url,
      source: img.source,
      placement: img.placement || 'ARTICLE',
      stepNumber: img.stepNumber,
      alt: img.alt,
      caption: img.caption,
      width: img.width,
      height: img.height
    }));
  }

  // 3. Required Fields Validation Gate
  if (!candidateData.title || candidateData.title.trim().length === 0) {
    throw new ExtractionError('NO_RECIPE', 'Recipe title could not be found.');
  }
  if (!candidateData.ingredients || candidateData.ingredients.length < 2) {
    throw new ExtractionError('NO_RECIPE', 'Recipe ingredients could not be extracted (minimum 2 required).');
  }
  if (!candidateData.instructions || candidateData.instructions.length < 1) {
    throw new ExtractionError('NO_RECIPE', 'Recipe cooking instructions could not be extracted.');
  }

  // 4. Detect Fact Conflicts (e.g. metadata temp vs instruction temp)
  const conflicts = detectFactConflicts(
    {
      temperature: candidateData.temperature,
      prepTimeMinutes: typeof candidateData.prepTime === 'number' ? candidateData.prepTime : null,
      cookTimeMinutes: typeof candidateData.cookTime === 'number' ? candidateData.cookTime : null,
      totalTimeMinutes: typeof candidateData.totalTime === 'number' ? candidateData.totalTime : null,
      servings: candidateData.servings
    },
    candidateData.instructions || []
  );

  // 5. Calculate Extraction Confidence
  const confidenceReport = evaluateExtractionConfidence(
    {
      title: candidateData.title,
      ingredients: candidateData.ingredients,
      instructions: candidateData.instructions,
      prepTime: candidateData.prepTime,
      cookTime: candidateData.cookTime,
      totalTime: candidateData.totalTime,
      temperature: candidateData.temperature,
      servings: candidateData.servings,
      isAmbiguous
    },
    conflicts
  );

  return {
    data: candidateData,
    method,
    confidence: confidenceReport.overall,
    confidenceReport,
    conflicts,
    foundFields,
    rawData,
    canonicalUrl
  };
}

export { extractRecipeFromPage as extractRecipe };
