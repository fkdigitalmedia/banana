import type { LockedFacts, GeneratedContent } from '../normalization/types.ts';
import type { QualityReport, QualityIssue } from './types.ts';
import { checkFactConsistency } from './facts.ts';
import { checkRepetition } from './repetition.ts';
import { checkFillerAndSpecificity } from './filler.ts';
import { checkSeoQuality } from './seo.ts';
import { checkSchemaConsistency } from './schema.ts';
import { extractClaimLedger } from './ledger.ts';

export interface RunQualityEngineOptions {
  primaryKeyword?: string;
  schemaJson?: any;
  repairAttempts?: number;
}

/**
 * Runs the deterministic Quality & Fact-Consistency Engine.
 * Aggregates all category checks, computes the 0-100 quality score, and determines publication status.
 */
export function evaluateRecipeQuality(
  locked: LockedFacts,
  content: GeneratedContent,
  options?: RunQualityEngineOptions
): QualityReport {
  const allIssues: QualityIssue[] = [];
  const passedChecks: string[] = [];
  const warnings: string[] = [];

  // 1. Fact Consistency Checks (Ingredients, Quantities, Temp, Time, Yield)
  const factIssues = checkFactConsistency(locked, content);
  allIssues.push(...factIssues);
  if (factIssues.length === 0) {
    passedChecks.push('Fact Consistency: 100% matched locked recipe facts');
  }

  // 2. Fact Safety & Claim Ledger Checks (Method, Social Proof, Dietary, Storage)
  const ledgerResult = extractClaimLedger(locked, content);
  allIssues.push(...ledgerResult.issues);
  if (ledgerResult.issues.length === 0) {
    passedChecks.push('Claim Ledger: All claims verified against locked facts (v2 fact-safe)');
  }

  // 3. Repetition Checks
  const repIssues = checkRepetition(content);
  allIssues.push(...repIssues);
  if (repIssues.length === 0) {
    passedChecks.push('Repetition: Zero cross-section sentence duplication');
  }

  // 4. Filler & Specificity Checks
  const fillerIssues = checkFillerAndSpecificity(locked, content);
  allIssues.push(...fillerIssues);
  if (fillerIssues.length === 0) {
    passedChecks.push('Editorial Quality: High recipe specificity and zero AI cliches');
  }

  // 5. SEO Quality Checks
  const seoIssues = checkSeoQuality(content, options?.primaryKeyword);
  allIssues.push(...seoIssues);
  if (seoIssues.length === 0) {
    passedChecks.push('SEO & Metadata: Clean natural titles and optimal keyword density');
  }

  // 6. Schema Structured Data Consistency
  if (options?.schemaJson) {
    const schemaIssues = checkSchemaConsistency(locked, options.schemaJson);
    allIssues.push(...schemaIssues);
    if (schemaIssues.length === 0) {
      passedChecks.push('Structured Data: Schema.org matches D1 database facts');
    }
  }

  // Calculate Weighted Score (0 - 100)
  let score = 100;
  const highCount = allIssues.filter(i => i.severity === 'HIGH').length;
  const medCount = allIssues.filter(i => i.severity === 'MEDIUM').length;
  const lowCount = allIssues.filter(i => i.severity === 'LOW').length;

  score -= (highCount * 25);
  score -= (medCount * 10);
  score -= (lowCount * 4);
  score = Math.max(0, Math.min(100, score));

  // Determine Quality Status
  let status: 'PASS' | 'REVIEW' | 'FAIL' = 'PASS';
  if (highCount > 0) {
    status = 'FAIL';
  } else if (score < 80 || medCount > 1) {
    status = 'REVIEW';
  }

  // Extract warnings list
  allIssues.forEach(issue => {
    if (issue.severity === 'LOW' || issue.severity === 'MEDIUM') {
      warnings.push(`[${issue.type}] ${issue.message}`);
    }
  });

  const categoryScores: Record<string, number> = {
    fact_consistency: (factIssues.length === 0 && ledgerResult.issues.length === 0) ? 30 : Math.max(0, 30 - (factIssues.length + ledgerResult.issues.length) * 15),
    recipe_specificity: fillerIssues.some(i => i.type === 'RECIPE_SPECIFICITY') ? 10 : 20,
    content_completeness: fillerIssues.some(i => i.type === 'CONTENT_COMPLETENESS') ? 5 : 15,
    repetition: repIssues.length === 0 ? 10 : Math.max(0, 10 - repIssues.length * 5),
    filler: fillerIssues.some(i => i.type === 'FILLER') ? 5 : 10,
    seo_quality: seoIssues.length === 0 ? 15 : Math.max(0, 15 - seoIssues.length * 5)
  };

  const categories: Record<string, { score: number; passed: boolean }> = {
    facts: { score: categoryScores.fact_consistency, passed: categoryScores.fact_consistency >= 20 },
    completeness: { score: categoryScores.content_completeness, passed: categoryScores.content_completeness >= 10 },
    repetition: { score: categoryScores.repetition, passed: categoryScores.repetition >= 8 },
    seo: { score: categoryScores.seo_quality, passed: categoryScores.seo_quality >= 10 },
    schema: { score: 100, passed: true },
    safety: { score: ledgerResult.issues.length === 0 ? 100 : 0, passed: ledgerResult.issues.length === 0 }
  };

  return {
    status,
    score,
    categoryScores,
    categories,
    issues: allIssues,
    warnings,
    passedChecks,
    timestamp: new Date().toISOString(),
    repairAttempts: options?.repairAttempts || 0,
    contentPromptVersion: 'v2',
    claimLedger: ledgerResult.ledger
  };
}
