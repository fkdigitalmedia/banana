export const PIPELINE_STAGES = {
  // Phase 1: Ingestion & Extraction (Deterministic)
  VALIDATE_URL: 'VALIDATE_URL',
  FETCH_SOURCE: 'FETCH_SOURCE',
  EXTRACT_RECIPE: 'EXTRACT_RECIPE',
  NORMALIZE: 'NORMALIZE',
  VALIDATE_RECIPE: 'VALIDATE_RECIPE',
  CREATE_FACT_SHEET: 'CREATE_FACT_SHEET',
  CREATE_RECIPE_RECORD: 'CREATE_RECIPE_RECORD',

  // Phase 2: DeepSeek Editorial Generation (AI)
  ANALYSIS: 'ANALYSIS',
  ANALYZE: 'ANALYZE',
  INTRODUCTION: 'INTRODUCTION',
  GENERATE_INTRO: 'GENERATE_INTRO',
  INGREDIENT_GUIDANCE: 'INGREDIENT_GUIDANCE',
  GENERATE_INGREDIENT_GUIDANCE: 'GENERATE_INGREDIENT_GUIDANCE',
  COOKING_GUIDANCE: 'COOKING_GUIDANCE',
  GENERATE_COOKING_GUIDANCE: 'GENERATE_COOKING_GUIDANCE',
  TIPS: 'TIPS',
  GENERATE_TIPS: 'GENERATE_TIPS',
  VARIATIONS: 'VARIATIONS',
  GENERATE_VARIATIONS: 'GENERATE_VARIATIONS',
  SERVING: 'SERVING',
  GENERATE_SERVING: 'GENERATE_SERVING',
  STORAGE: 'STORAGE',
  GENERATE_STORAGE: 'GENERATE_STORAGE',
  FAQ: 'FAQ',
  GENERATE_FAQ: 'GENERATE_FAQ',
  SEO: 'SEO',
  GENERATE_SEO: 'GENERATE_SEO',
  ASSEMBLY: 'ASSEMBLY',
  ASSEMBLE: 'ASSEMBLE',

  // Phase 3: Validation, Media & Quality Gate
  VALIDATION: 'VALIDATION',
  VALIDATE_CONTENT: 'VALIDATE_CONTENT',
  IMAGE_PROCESSING: 'IMAGE_PROCESSING',
  FINAL_QA: 'FINAL_QA',
  DRAFT: 'DRAFT',
  DRAFT_READY: 'DRAFT_READY',

  // Terminal Statuses
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
} as const;

export type PipelineStage = typeof PIPELINE_STAGES[keyof typeof PIPELINE_STAGES];

// Backward-compatible alias
export const STAGES = PIPELINE_STAGES;
export type Stage = PipelineStage;

export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  VALIDATE_URL: '1. Validate URL & Security',
  FETCH_SOURCE: '2. Fetch Source Web Page',
  EXTRACT_RECIPE: '3. Extract Recipe JSON-LD & HTML',
  NORMALIZE: '4. Normalize Ingredients & Times',
  VALIDATE_RECIPE: '5. Validate Source Recipe Facts',
  CREATE_FACT_SHEET: '6. Create Locked Fact Sheet',
  CREATE_RECIPE_RECORD: '7. Save Recipe Record in D1',
  ANALYZE: '8. Editorial Positioning Analysis',
  ANALYSIS: '8. Editorial Positioning Analysis',
  GENERATE_INTRO: '9. Introduction & Sensory Hook',
  INTRODUCTION: '9. Introduction & Sensory Hook',
  GENERATE_INGREDIENT_GUIDANCE: '10. Ingredient Science Guidance',
  INGREDIENT_GUIDANCE: '10. Ingredient Science Guidance',
  GENERATE_COOKING_GUIDANCE: '11. Cooking Technique Guidance',
  COOKING_GUIDANCE: '11. Cooking Technique Guidance',
  GENERATE_TIPS: '12. Pro Baking Tips',
  TIPS: '12. Pro Baking Tips',
  GENERATE_VARIATIONS: '13. Flavor Variations & Mix-ins',
  VARIATIONS: '13. Flavor Variations & Mix-ins',
  GENERATE_SERVING: '14. Serving Suggestions & Pairings',
  SERVING: '14. Serving Suggestions & Pairings',
  GENERATE_STORAGE: '15. Storage & Reheating Instructions',
  STORAGE: '15. Storage & Reheating Instructions',
  GENERATE_FAQ: '16. Recipe-Specific Reader FAQ',
  FAQ: '16. Recipe-Specific Reader FAQ',
  GENERATE_SEO: '17. SEO Title, Description & Slug',
  SEO: '17. SEO Title, Description & Slug',
  ASSEMBLE: '18. Full Markdown Article Assembly',
  ASSEMBLY: '18. Full Markdown Article Assembly',
  VALIDATE_CONTENT: '19. Factual & Quality Validation',
  VALIDATION: '19. Factual & Quality Validation',
  IMAGE_PROCESSING: '20. Image Metadata Verification',
  FINAL_QA: '21. Final Quality Gate',
  DRAFT: '22. Ready as Validated Draft',
  DRAFT_READY: '22. Ready as Validated Draft',
  COMPLETED: 'Pipeline Completed',
  FAILED: 'Generation Failed',
  CANCELLED: 'Pipeline Cancelled'
};

export const DETERMINISTIC_STAGES: PipelineStage[] = [
  PIPELINE_STAGES.VALIDATE_URL,
  PIPELINE_STAGES.FETCH_SOURCE,
  PIPELINE_STAGES.EXTRACT_RECIPE,
  PIPELINE_STAGES.NORMALIZE,
  PIPELINE_STAGES.VALIDATE_RECIPE,
  PIPELINE_STAGES.CREATE_FACT_SHEET,
  PIPELINE_STAGES.CREATE_RECIPE_RECORD
];

export const AI_STAGES: PipelineStage[] = [
  PIPELINE_STAGES.ANALYZE,
  PIPELINE_STAGES.GENERATE_INTRO,
  PIPELINE_STAGES.GENERATE_INGREDIENT_GUIDANCE,
  PIPELINE_STAGES.GENERATE_COOKING_GUIDANCE,
  PIPELINE_STAGES.GENERATE_TIPS,
  PIPELINE_STAGES.GENERATE_VARIATIONS,
  PIPELINE_STAGES.GENERATE_SERVING,
  PIPELINE_STAGES.GENERATE_STORAGE,
  PIPELINE_STAGES.GENERATE_FAQ,
  PIPELINE_STAGES.GENERATE_SEO,
  PIPELINE_STAGES.ASSEMBLE
];

export const VALIDATION_STAGES: PipelineStage[] = [
  PIPELINE_STAGES.VALIDATE_CONTENT,
  PIPELINE_STAGES.IMAGE_PROCESSING,
  PIPELINE_STAGES.FINAL_QA,
  PIPELINE_STAGES.DRAFT_READY
];

export const FULL_PIPELINE_ORDER: PipelineStage[] = [
  ...DETERMINISTIC_STAGES,
  ...AI_STAGES,
  ...VALIDATION_STAGES
];

export const STAGE_ORDER: Stage[] = FULL_PIPELINE_ORDER;

export class PipelineError extends Error {
  constructor(
    public readonly stage: PipelineStage | string,
    message: string,
    public readonly retriable: boolean = false,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}
