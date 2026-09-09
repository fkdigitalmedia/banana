import type { LockedFacts } from '../normalization/types.ts';
import type { QualityIssue } from './types.ts';

/**
 * Validates that structured data Schema.org properties match authoritative locked facts.
 */
export function checkSchemaConsistency(
  locked: LockedFacts,
  schemaJson: any
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!schemaJson) return issues;

  // 1. Title verification
  if (schemaJson.name && schemaJson.name !== locked.title && !schemaJson.name.includes(locked.title)) {
    issues.push({
      type: 'STRUCTURED_DATA_CONSISTENCY',
      severity: 'MEDIUM',
      message: `Schema.org name "${schemaJson.name}" diverges from locked recipe title "${locked.title}".`,
      expected: locked.title,
      found: schemaJson.name
    });
  }

  // 2. Ingredients count verification
  if (Array.isArray(schemaJson.recipeIngredient)) {
    if (schemaJson.recipeIngredient.length !== locked.ingredients.length) {
      issues.push({
        type: 'STRUCTURED_DATA_CONSISTENCY',
        severity: 'HIGH',
        message: `Schema.org ingredients count (${schemaJson.recipeIngredient.length}) does not match locked ingredients count (${locked.ingredients.length}).`,
        expected: `${locked.ingredients.length} ingredients`,
        found: `${schemaJson.recipeIngredient.length} ingredients`
      });
    }
  }

  // 3. Instructions count verification
  if (Array.isArray(schemaJson.recipeInstructions)) {
    if (schemaJson.recipeInstructions.length !== locked.instructions.length) {
      issues.push({
        type: 'STRUCTURED_DATA_CONSISTENCY',
        severity: 'HIGH',
        message: `Schema.org instruction step count (${schemaJson.recipeInstructions.length}) does not match locked instruction steps (${locked.instructions.length}).`,
        expected: `${locked.instructions.length} steps`,
        found: `${schemaJson.recipeInstructions.length} steps`
      });
    }
  }

  return issues;
}
