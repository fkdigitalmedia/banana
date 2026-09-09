export const QUALITY_CATEGORIES = {
  FACT_CONSISTENCY: 'FACT_CONSISTENCY',
  INGREDIENT_CONSISTENCY: 'INGREDIENT_CONSISTENCY',
  QUANTITY_CONSISTENCY: 'QUANTITY_CONSISTENCY',
  TEMPERATURE_CONSISTENCY: 'TEMPERATURE_CONSISTENCY',
  TIME_CONSISTENCY: 'TIME_CONSISTENCY',
  YIELD_CONSISTENCY: 'YIELD_CONSISTENCY',
  INSTRUCTION_CONSISTENCY: 'INSTRUCTION_CONSISTENCY',
  CONTENT_COMPLETENESS: 'CONTENT_COMPLETENESS',
  RECIPE_SPECIFICITY: 'RECIPE_SPECIFICITY',
  REPETITION: 'REPETITION',
  FILLER: 'FILLER',
  KEYWORD_STUFFING: 'KEYWORD_STUFFING',
  SEO_QUALITY: 'SEO_QUALITY',
  STRUCTURED_DATA_CONSISTENCY: 'STRUCTURED_DATA_CONSISTENCY',
  METHOD_CONTRADICTION: 'METHOD_CONTRADICTION',
  SOURCE_CLAIM_TRANSFER: 'SOURCE_CLAIM_TRANSFER',
  UNSUPPORTED_DIETARY_CLAIM: 'UNSUPPORTED_DIETARY_CLAIM',
  STORAGE_INCONSISTENCY: 'STORAGE_INCONSISTENCY'
} as const;

export type QualityCategory = typeof QUALITY_CATEGORIES[keyof typeof QUALITY_CATEGORIES];

export type QualitySeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface QualityIssue {
  type: QualityCategory | string;
  severity: QualitySeverity;
  section?: string;
  message: string;
  expected?: string;
  found?: string;
}

export interface QualityCategoryScore {
  category: QualityCategory;
  score: number; // 0 to 100
  weight: number; // Weight in final score calculation
  passed: boolean;
  issues: QualityIssue[];
}

export interface QualityReport {
  status: 'PASS' | 'REVIEW' | 'FAIL';
  score: number; // Overall 0 - 100
  categoryScores: Record<string, number>;
  categories?: Record<string, { score: number; passed: boolean }>;
  issues: QualityIssue[];
  warnings: string[];
  passedChecks: string[];
  timestamp: string;
  repairAttempts?: number;
  contentPromptVersion?: string;
  claimLedger?: any[];
  deepSeekReview?: {
    reviewed: boolean;
    feedback?: string[];
  };
}
