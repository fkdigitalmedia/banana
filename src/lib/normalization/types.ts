export interface ExtractedImageInfo {
  url: string;
  source: 'json-ld' | 'og' | 'html';
  placement: 'HERO' | 'STEP' | 'ARTICLE';
  stepNumber?: number;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface RawRecipeData {
  title?: string;
  description?: string;
  ingredients?: string[];
  instructions?: string[];
  prepTime?: string;
  cookTime?: string;
  coolingTime?: string;
  restingTime?: string;
  totalTime?: string;
  servings?: string;
  yieldText?: string;
  category?: string | string[];
  cuisine?: string | string[];
  keywords?: string[];
  equipment?: string[];
  notes?: string[];
  nutrition?: Record<string, string>;
  image?: string | null;
  additionalImages?: ExtractedImageInfo[];
  author?: string;
}

export interface ParsedIngredient {
  originalText: string;
  quantity: string;
  unit: string;
  name: string;
  notes: string;
}

export interface ParsedInstruction {
  stepNumber: number;
  text: string;
}

export interface NutritionInfo {
  calories?: string;
  fatContent?: string;
  saturatedFatContent?: string;
  carbohydrateContent?: string;
  sugarContent?: string;
  fiberContent?: string;
  proteinContent?: string;
  sodiumContent?: string;
  [key: string]: string | undefined;
}

export interface SourceMetadata {
  sourceUrl: string;
  sourceDomain: string;
  importedAt: string;
  extractionMethod: 'json-ld' | 'html-fallback';
  extractionConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  originalImageUrl: string | null;
  yieldText: string;
}

export interface StorageFacts {
  roomTempDays: string;
  fridgeDays: string;
  freezerMonths: string;
  container: string;
  isSourceProvided: boolean;
}

export interface ClaimLedgerEntry {
  claim: string;
  type: 'METHOD_CLAIM' | 'DIETARY_CLAIM' | 'STORAGE_CLAIM' | 'SUPERLATIVE_CLAIM' | 'SOURCE_SOCIAL_PROOF' | 'INGREDIENT_FACT';
  supported: boolean;
  evidence?: string;
  section?: string;
}

export interface NormalizedRecipe {
  title: string;
  slug: string;
  description: string;
  ingredients: ParsedIngredient[];
  instructions: ParsedInstruction[];
  prepTime: number | null;
  cookTime: number | null;
  coolingTime?: number | null;
  restingTime?: number | null;
  totalTime: number | null;
  servings: string;
  yieldText: string;
  category: string;
  cuisine: string;
  keywords: string[];
  equipment: string[];
  notes: string[];
  nutrition: NutritionInfo;
  image: string | null;
  additionalImages?: ExtractedImageInfo[];
  sourceMetadata: SourceMetadata;
}

export interface LockedFacts {
  title: string;
  ingredients: ParsedIngredient[];
  instructions: ParsedInstruction[];
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  coolingTimeMinutes?: number | null;
  restingTimeMinutes?: number | null;
  totalTimeMinutes: number | null;
  servings: string;
  yieldText: string;
  temperature: string | null;
  storageFacts: StorageFacts;
  bowlCount: number;
  isOneBowl: boolean;
}

export interface EditorialOpportunity {
  section: string;
  suggestion: string;
}

export interface FactSheet {
  lockedFacts: LockedFacts;
  editorialOpportunities: EditorialOpportunity[];
  recipe: NormalizedRecipe;
  createdAt: string;
  contentPromptVersion?: string;
}

export interface GeneratedContent {
  introduction: string;
  whyThisRecipe: string;
  ingredientGuidance: { ingredient: string; guidance: string }[];
  cookingGuidance: string[];
  tips: string[];
  variations: { name: string; description: string }[];
  servingSuggestions: string;
  storage: string;
  faq: { question: string; answer: string }[];
  seo: { title: string; metaDescription: string; slug: string };
  contentPromptVersion?: string;
  claimLedger?: ClaimLedgerEntry[];
}

export interface ValidationResult {
  passed: boolean;
  issues: { level: 'error' | 'warning'; message: string }[];
}

export interface ImportResult {
  success: boolean;
  recipeId?: number;
  jobId?: number;
  recipe?: {
    title: string;
    slug: string;
    ingredientCount: number;
    instructionCount: number;
    prepTime: number | null;
    cookTime: number | null;
    servings: string;
    extractionMethod: string;
    extractionConfidence: string;
    sourceDomain: string;
    hasImage: boolean;
    hasNutrition: boolean;
  };
  error?: string;
  errorCode?: string;
  existingRecipeId?: number;
}
