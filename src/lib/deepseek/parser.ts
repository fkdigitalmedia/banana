/**
 * Safe JSON parser for LLM responses.
 * Handles markdown backticks, trailing commas, and partial JSON wrapper text.
 */
export function parseDeepSeekJson<T = any>(raw: string, defaultFallback?: T): T {
  if (!raw || typeof raw !== 'string') {
    if (defaultFallback !== undefined) return defaultFallback;
    throw new Error('Cannot parse empty or non-string response from DeepSeek.');
  }

  // 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
  let clean = raw.trim();
  clean = clean.replace(/^```(?:json)?\s*/i, '');
  clean = clean.replace(/\s*```$/i, '');
  clean = clean.trim();

  // 2. Direct JSON.parse attempt
  try {
    return JSON.parse(clean);
  } catch (initialErr) {
    // 3. Fallback: Find the first '{' and last '}' or first '[' and last ']'
    try {
      const firstBrace = clean.indexOf('{');
      const lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonSubstring = clean.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonSubstring);
      }

      const firstBracket = clean.indexOf('[');
      const lastBracket = clean.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        const jsonSubstring = clean.substring(firstBracket, lastBracket + 1);
        return JSON.parse(jsonSubstring);
      }
    } catch (substringErr) {
      // Continue to sanitizing trailing commas
    }

    // 4. Try cleaning trailing commas: e.g. ", }" -> " }" and ", ]" -> " ]"
    try {
      const sanitized = clean
        .replace(/,\s*([\}\]])/g, '$1')
        .replace(/[\u201C\u201D]/g, '"'); // Smart quotes to normal quotes
      return JSON.parse(sanitized);
    } catch (sanitizedErr) {
      if (defaultFallback !== undefined) {
        console.warn('[parseDeepSeekJson] Failed to parse JSON, returning fallback:', initialErr);
        return defaultFallback;
      }
      throw new Error(`Failed to parse DeepSeek JSON response: ${(initialErr as Error).message}. Raw content was: ${clean.slice(0, 300)}...`);
    }
  }
}
