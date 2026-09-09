import { validateRecipeFacts } from './recipe';
import { validateContent } from './content';
import type { LockedFacts, GeneratedContent, ValidationResult } from '../normalization/types';

export { validateRecipeFacts, validateContent };

/**
 * Runs all validation checks against locked recipe facts and generated editorial content.
 */
export function validateAll(
  lockedFacts: LockedFacts,
  content: GeneratedContent,
  primaryKeyword?: string
): ValidationResult {
  const factResult = validateRecipeFacts(lockedFacts, content);
  const contentResult = validateContent(content, primaryKeyword);

  const mergedIssues = [...factResult.issues, ...contentResult.issues];
  const hasErrors = mergedIssues.some(issue => issue.level === 'error');

  return {
    passed: !hasErrors,
    issues: mergedIssues
  };
}
