/**
 * Recipe Fact Conflict Detection Engine
 * 
 * Compares structured metadata against instruction prose to flag contradictory baking facts
 * (e.g. 350°F vs 375°F, time mismatches, or yield discrepancies).
 */

import { parseTemperature } from './temperature';

export interface FactConflict {
  type: 'TEMPERATURE_CONFLICT' | 'TIME_CONFLICT' | 'YIELD_CONFLICT' | 'INGREDIENT_CONFLICT';
  severity: 'HIGH' | 'MEDIUM';
  field: string;
  valueA: string;
  valueB: string;
  message: string;
}

export interface ConflictDetectionResult {
  hasConflicts: boolean;
  hasHighSeverityConflicts: boolean;
  conflicts: FactConflict[];
}

/**
 * Detects discrepancies between structured recipe fields and cooking instructions.
 */
export function detectFactConflicts(
  meta: {
    temperature?: string | null;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    totalTimeMinutes?: number | null;
    servings?: string | null;
  },
  instructions: (string | { text: string })[]
): ConflictDetectionResult {
  const conflicts: FactConflict[] = [];

  const instructionTexts = (instructions || [])
    .map(i => (typeof i === 'string' ? i : i.text || ''))
    .filter(Boolean);

  const fullInstructionProse = instructionTexts.join(' ');

  // 1. Temperature Conflict Check
  if (meta.temperature) {
    const metaTemp = parseTemperature(meta.temperature);
    const instTemp = parseTemperature(fullInstructionProse);

    if (metaTemp && instTemp && metaTemp.fahrenheit && instTemp.fahrenheit) {
      // Allow minor variation of +/- 5 degrees (e.g. rounding difference)
      const diff = Math.abs(metaTemp.fahrenheit - instTemp.fahrenheit);
      if (diff >= 15) {
        conflicts.push({
          type: 'TEMPERATURE_CONFLICT',
          severity: 'HIGH',
          field: 'temperature',
          valueA: metaTemp.displayText,
          valueB: instTemp.displayText,
          message: `Temperature contradiction: metadata states ${metaTemp.displayText}, but instructions state ${instTemp.displayText}.`
        });
      }
    }
  }

  // 2. Cook Time Conflict Check
  if (meta.cookTimeMinutes && meta.cookTimeMinutes > 0) {
    // Look for bake/cook time mentions in instructions: e.g. "bake for 55 to 60 minutes" or "cook for 45 mins"
    const bakeTimeRegex = /(?:bake|cook|simmer|roast)[\w\s]{0,25}for\s+(\d+)(?:\s*(?:to|-)\s*(\d+))?\s*(?:minutes|mins|min|hours|hrs|hr)/gi;
    let match;
    while ((match = bakeTimeRegex.exec(fullInstructionProse)) !== null) {
      const minA = parseInt(match[1], 10);
      const minB = match[2] ? parseInt(match[2], 10) : minA;
      const isHours = /hours|hrs|hr/i.test(match[0]);
      const instMinutes = (isHours ? minB * 60 : minB);

      // If instruction bake time differs by more than 20 minutes and > 30% from metadata
      if (Math.abs(meta.cookTimeMinutes - instMinutes) >= 20 && Math.abs(meta.cookTimeMinutes - instMinutes) / meta.cookTimeMinutes > 0.3) {
        conflicts.push({
          type: 'TIME_CONFLICT',
          severity: 'MEDIUM',
          field: 'cook_time',
          valueA: `${meta.cookTimeMinutes} mins`,
          valueB: `${instMinutes} mins`,
          message: `Cook time discrepancy: metadata lists ${meta.cookTimeMinutes} mins, but instruction states "${match[0].trim()}".`
        });
        break;
      }
    }
  }

  // 3. Yield Conflict Check
  if (meta.servings) {
    const yieldRegex = /(?:yields?|makes?|serves?)\s+(?:about\s+)?(\d+)(?:\s*(?:to|-)\s*(\d+))?\s*(servings|muffins|cookies|portions|slices|loaf|loaves)/i;
    const yMatch = fullInstructionProse.match(yieldRegex);
    if (yMatch) {
      const instNum = parseInt(yMatch[1], 10);
      const metaNumMatch = meta.servings.match(/\d+/);
      if (metaNumMatch) {
        const metaNum = parseInt(metaNumMatch[0], 10);
        if (Math.abs(metaNum - instNum) >= 6 && Math.abs(metaNum - instNum) / Math.max(metaNum, 1) > 0.4) {
          conflicts.push({
            type: 'YIELD_CONFLICT',
            severity: 'MEDIUM',
            field: 'yield',
            valueA: meta.servings,
            valueB: yMatch[0].trim(),
            message: `Yield mismatch: metadata states "${meta.servings}", but text mentions "${yMatch[0].trim()}".`
          });
        }
      }
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    hasHighSeverityConflicts: conflicts.some(c => c.severity === 'HIGH'),
    conflicts
  };
}
