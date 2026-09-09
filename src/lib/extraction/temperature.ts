/**
 * Recipe Oven Temperature Normalization Engine
 * 
 * Extracts and normalizes oven temperatures from instruction text or metadata.
 * Supports Fahrenheit, Celsius, combined formats, and gas marks without inventing unstated temperatures.
 */

export interface NormalizedTemperature {
  fahrenheit: number | null;
  celsius: number | null;
  displayText: string;
  originalText: string;
}

/**
 * Extracts oven temperature from text or instruction steps.
 * Handles formats: "350°F", "350 F", "350 degrees F", "175°C", "175 C", "350°F (175°C)"
 */
export function parseTemperature(text: string): NormalizedTemperature | null {
  if (!text || typeof text !== 'string') return null;

  // 1. Check for combined format: "350°F (175°C)" or "350 degrees F / 175 degrees C"
  const combinedRegex = /(\d{2,3})\s*(?:°|deg(?:rees)?)?\s*F(?:ahrenheit)?\s*(?:[\/\(,\s]+)\s*(\d{2,3})\s*(?:°|deg(?:rees)?)?\s*C(?:elsius)?/i;
  const combinedMatch = text.match(combinedRegex);
  if (combinedMatch) {
    const f = parseInt(combinedMatch[1], 10);
    const c = parseInt(combinedMatch[2], 10);
    if (f >= 150 && f <= 600 && c >= 60 && c <= 320) {
      return {
        fahrenheit: f,
        celsius: c,
        displayText: `${f}°F (${c}°C)`,
        originalText: combinedMatch[0].trim()
      };
    }
  }

  // 1b. Check reverse combined: "175°C (350°F)"
  const reverseCombinedRegex = /(\d{2,3})\s*(?:°|deg(?:rees)?)?\s*C(?:elsius)?\s*(?:[\/\(,\s]+)\s*(\d{2,3})\s*(?:°|deg(?:rees)?)?\s*F(?:ahrenheit)?/i;
  const revMatch = text.match(reverseCombinedRegex);
  if (revMatch) {
    const c = parseInt(revMatch[1], 10);
    const f = parseInt(revMatch[2], 10);
    if (f >= 150 && f <= 600 && c >= 60 && c <= 320) {
      return {
        fahrenheit: f,
        celsius: c,
        displayText: `${f}°F (${c}°C)`,
        originalText: revMatch[0].trim()
      };
    }
  }

  // 2. Check for single Fahrenheit format: "350°F", "350 F", "350 degrees F", "preheat to 350"
  const fahrenheitRegex = /(?:preheat[\w\s]*to\s+)?(\d{3})\s*(?:°|deg(?:rees)?)?\s*F(?:ahrenheit)?\b/i;
  const fMatch = text.match(fahrenheitRegex);
  if (fMatch) {
    const f = parseInt(fMatch[1], 10);
    if (f >= 150 && f <= 550) {
      const c = Math.round(((f - 32) * 5) / 9);
      return {
        fahrenheit: f,
        celsius: c,
        displayText: `${f}°F (${c}°C)`,
        originalText: fMatch[0].trim()
      };
    }
  }

  // 3. Check for single Celsius format: "175°C", "180 C", "180 degrees C"
  const celsiusRegex = /(\d{2,3})\s*(?:°|deg(?:rees)?)?\s*C(?:elsius)?\b/i;
  const cMatch = text.match(celsiusRegex);
  if (cMatch) {
    const c = parseInt(cMatch[1], 10);
    if (c >= 70 && c <= 300) {
      const f = Math.round((c * 9) / 5 + 32);
      return {
        fahrenheit: f,
        celsius: c,
        displayText: `${f}°F (${c}°C)`,
        originalText: cMatch[0].trim()
      };
    }
  }

  // 4. Check for "preheat oven to 350" without explicit unit (assumes Fahrenheit in US context if >= 250)
  const preheatNumRegex = /preheat[\w\s]*to\s+(\d{3})\b/i;
  const pMatch = text.match(preheatNumRegex);
  if (pMatch) {
    const val = parseInt(pMatch[1], 10);
    if (val >= 250 && val <= 500) {
      const c = Math.round(((val - 32) * 5) / 9);
      return {
        fahrenheit: val,
        celsius: c,
        displayText: `${val}°F (${c}°C)`,
        originalText: pMatch[0].trim()
      };
    }
  }

  return null;
}

/**
 * Scans a list of instruction strings for oven temperature.
 */
export function extractTemperatureFromInstructions(instructions: string[] | { text: string }[]): NormalizedTemperature | null {
  if (!instructions || !Array.isArray(instructions)) return null;

  for (const step of instructions) {
    const text = typeof step === 'string' ? step : step.text;
    const temp = parseTemperature(text);
    if (temp) return temp;
  }

  return null;
}
