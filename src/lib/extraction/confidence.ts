/**
 * Extraction Confidence & Quality Calculator
 * 
 * Provides an objective, transparent assessment of extraction quality across core recipe fields.
 */

import type { ConflictDetectionResult } from './conflicts';

export interface ConfidenceBreakdown {
  title: 'PASS' | 'FAIL';
  ingredients: 'PASS' | 'FAIL';
  instructions: 'PASS' | 'FAIL';
  times: 'PASS' | 'FAIL';
  temperature: 'PASS' | 'FAIL';
  yield: 'PASS' | 'FAIL';
}

export interface ExtractionConfidenceResult {
  overall: 'HIGH' | 'MEDIUM' | 'LOW';
  breakdown: ConfidenceBreakdown;
  requiresReview: boolean;
  scorePercent: number;
  reasons: string[];
}

export function evaluateExtractionConfidence(
  data: {
    title?: string;
    ingredients?: any[];
    instructions?: any[];
    prepTime?: any;
    cookTime?: any;
    totalTime?: any;
    temperature?: any;
    servings?: any;
    isAmbiguous?: boolean;
  },
  conflictReport?: ConflictDetectionResult
): ExtractionConfidenceResult {
  const reasons: string[] = [];

  const titlePass = Boolean(data.title && data.title.trim().length >= 4);
  if (!titlePass) reasons.push('Recipe title is missing or too short.');

  const ingCount = (data.ingredients || []).length;
  const ingredientsPass = ingCount >= 2;
  if (!ingredientsPass) reasons.push(`Insufficient ingredients extracted (${ingCount} found, minimum 2 required).`);

  const instCount = (data.instructions || []).length;
  const instructionsPass = instCount >= 1;
  if (!instructionsPass) reasons.push(`No cooking instructions extracted (${instCount} steps found).`);

  const timesPass = Boolean(data.prepTime || data.cookTime || data.totalTime);
  if (!timesPass) reasons.push('No prep, cook, or total time data found.');

  const tempPass = Boolean(data.temperature);

  const yieldPass = Boolean(data.servings && String(data.servings).trim().length > 0);

  const breakdown: ConfidenceBreakdown = {
    title: titlePass ? 'PASS' : 'FAIL',
    ingredients: ingredientsPass ? 'PASS' : 'FAIL',
    instructions: instructionsPass ? 'PASS' : 'FAIL',
    times: timesPass ? 'PASS' : 'FAIL',
    temperature: tempPass ? 'PASS' : 'FAIL',
    yield: yieldPass ? 'PASS' : 'FAIL'
  };

  // Calculate score weight
  let score = 0;
  if (titlePass) score += 25;
  if (ingredientsPass) score += ingCount >= 4 ? 30 : 20;
  if (instructionsPass) score += instCount >= 3 ? 25 : 15;
  if (timesPass) score += 10;
  if (yieldPass) score += 5;
  if (tempPass) score += 5;

  let overall: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  let requiresReview = false;

  if (data.isAmbiguous) {
    overall = 'LOW';
    requiresReview = true;
    reasons.push('Ambiguous multiple recipes detected on page without a dominant match.');
  } else if (conflictReport?.hasHighSeverityConflicts) {
    overall = 'LOW';
    requiresReview = true;
    reasons.push(...conflictReport.conflicts.map(c => c.message));
  } else if (!titlePass || !ingredientsPass || !instructionsPass) {
    overall = 'LOW';
    requiresReview = true;
  } else if (score >= 80 && ingCount >= 4 && instCount >= 2) {
    overall = 'HIGH';
  } else {
    overall = 'MEDIUM';
  }

  return {
    overall,
    breakdown,
    requiresReview,
    scorePercent: Math.min(100, score),
    reasons
  };
}
