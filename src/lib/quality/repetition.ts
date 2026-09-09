import type { GeneratedContent } from '../normalization/types.ts';
import type { QualityIssue } from './types.ts';

/**
 * Normalizes a sentence for duplicate detection.
 */
function normalizeSentence(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

/**
 * Computes Jaccard word-overlap similarity between two sentences.
 */
function sentenceSimilarity(s1: string, s2: string): number {
  const words1 = new Set(s1.split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(s2.split(/\s+/).filter(w => w.length > 3));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

function toSafeString(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(toSafeString).filter(Boolean).join(' ');
  if (typeof val === 'object') return Object.values(val).map(toSafeString).filter(Boolean).join(' ');
  return String(val || '');
}

/**
 * Detects cross-section sentence and phrase repetition.
 */
export function checkRepetition(content: GeneratedContent): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const sectionSentences: Array<{ section: string; sentences: string[] }> = [
    {
      section: 'Introduction',
      sentences: toSafeString(content.introduction).split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 25)
    },
    {
      section: 'Why You\'ll Love It',
      sentences: toSafeString(content.whyThisRecipe).split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 25)
    },
    {
      section: 'Tips',
      sentences: (Array.isArray(content.tips) ? content.tips.map(toSafeString) : [toSafeString(content.tips)]).map(s => s.trim()).filter(s => s.length > 25)
    },
    {
      section: 'Serving Suggestions',
      sentences: toSafeString(content.servingSuggestions).split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 25)
    },
    {
      section: 'Storage',
      sentences: toSafeString(content.storage).split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 25)
    }
  ];

  // Compare every section's sentences against other sections
  for (let i = 0; i < sectionSentences.length; i++) {
    for (let j = i + 1; j < sectionSentences.length; j++) {
      const secA = sectionSentences[i];
      const secB = sectionSentences[j];

      for (const sentA of secA.sentences) {
        const normA = normalizeSentence(sentA);

        for (const sentB of secB.sentences) {
          const normB = normalizeSentence(sentB);

          // Exact duplicate sentence
          if (normA === normB) {
            issues.push({
              type: 'REPETITION',
              severity: 'MEDIUM',
              section: secB.section,
              message: `Exact sentence duplicated between ${secA.section} and ${secB.section}: "${sentA}".`,
              expected: 'Distinct editorial content in each section',
              found: sentA
            });
          } else {
            // High similarity (> 80% key word overlap)
            const sim = sentenceSimilarity(normA, normB);
            if (sim > 0.8) {
              issues.push({
                type: 'REPETITION',
                severity: 'LOW',
                section: secB.section,
                message: `Similar sentence repeated between ${secA.section} and ${secB.section}: "${sentB}".`,
                expected: 'Unique phrasing and insight',
                found: sentB
              });
            }
          }
        }
      }
    }
  }

  return issues;
}
