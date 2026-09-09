/**
 * Ingredient Normalization Engine
 * 
 * Accurately parses ingredient strings into structured components:
 * quantity, unit, name, preparation notes, and preserves original source text.
 * Normalizes unicode fractions and standardizes equivalent units without altering values.
 */

export interface ParsedIngredient {
  originalText: string;
  quantity: string;
  unit: string;
  name: string;
  notes: string;
}

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2',
  '¼': '1/4',
  '¾': '3/4',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8'
};

// Canonical unit mapping: maps various plural/abbreviation forms to standard canonical units
const UNIT_CANONICAL_MAP: Record<string, string> = {
  'tablespoons': 'tbsp',
  'tablespoon': 'tbsp',
  'tbsp': 'tbsp',
  'tbs': 'tbsp',
  'tbsps': 'tbsp',
  'teaspoons': 'tsp',
  'teaspoon': 'tsp',
  'tsp': 'tsp',
  'tsps': 'tsp',
  'cups': 'cup',
  'cup': 'cup',
  'c.': 'cup',
  'c': 'cup',
  'fluid ounces': 'fl oz',
  'fluid ounce': 'fl oz',
  'fl oz': 'fl oz',
  'fl. oz.': 'fl oz',
  'pints': 'pint',
  'pint': 'pint',
  'pt': 'pint',
  'quarts': 'quart',
  'quart': 'quart',
  'qt': 'quart',
  'gallons': 'gallon',
  'gallon': 'gallon',
  'liters': 'liter',
  'liter': 'liter',
  'litres': 'liter',
  'litre': 'liter',
  'l': 'liter',
  'milliliters': 'ml',
  'milliliter': 'ml',
  'ml': 'ml',
  'ounces': 'oz',
  'ounce': 'oz',
  'oz': 'oz',
  'oz.': 'oz',
  'pounds': 'lb',
  'pound': 'lb',
  'lbs': 'lb',
  'lb': 'lb',
  'lb.': 'lb',
  'grams': 'g',
  'gram': 'g',
  'g': 'g',
  'g.': 'g',
  'kilograms': 'kg',
  'kilogram': 'kg',
  'kg': 'kg',
  'kg.': 'kg',
  'pieces': 'piece',
  'piece': 'piece',
  'slices': 'slice',
  'slice': 'slice',
  'cans': 'can',
  'can': 'can',
  'packages': 'package',
  'package': 'package',
  'pkg': 'package',
  'sticks': 'stick',
  'stick': 'stick',
  'bunches': 'bunch',
  'bunch': 'bunch',
  'heads': 'head',
  'head': 'head',
  'cloves': 'clove',
  'clove': 'clove',
  'sprigs': 'sprig',
  'sprig': 'sprig',
  'leaves': 'leaf',
  'leaf': 'leaf',
  'pinches': 'pinch',
  'pinch': 'pinch',
  'dashes': 'dash',
  'dash': 'dash',
  'handfuls': 'handful',
  'handful': 'handful',
  'sheets': 'sheet',
  'sheet': 'sheet'
};

// Sorted by length descending to match multi-word units first (e.g. "fluid ounces" before "ounces")
const SORTED_UNITS = Object.keys(UNIT_CANONICAL_MAP).sort((a, b) => b.length - a.length);

/**
 * Parses an individual ingredient line into structured fields.
 */
export function parseIngredient(text: string): ParsedIngredient {
  const originalText = (text || '').trim();
  if (!originalText) {
    return { originalText: '', quantity: '', unit: '', name: '', notes: '' };
  }

  let workingText = originalText;
  const notesArr: string[] = [];

  // 1. Extract parenthetical notes: e.g. "(about 1 cup)" or "(mashed)"
  workingText = workingText.replace(/\(([^)]+)\)/g, (_match, p1) => {
    notesArr.push(p1.trim());
    return ' ';
  });

  // 2. Extract trailing preparation notes after comma:
  // e.g. ", mashed", ", sifted", ", melted", ", softened to room temperature", ", divided", ", chopped"
  const commaNoteMatch = workingText.match(/,\s*(softened|melted|divided|roughly chopped|finely chopped|diced|minced|sliced|chopped|sifted|mashed|whisked|beaten|room temperature|at room temperature|to taste|for garnish|packed|firmly packed|thawed|peeled|grated)(.*)$/i);
  if (commaNoteMatch) {
    notesArr.push((commaNoteMatch[1] + (commaNoteMatch[2] || '')).trim());
    workingText = workingText.substring(0, commaNoteMatch.index);
  }

  // 3. Replace unicode fractions with ASCII equivalents
  for (const [uni, frac] of Object.entries(UNICODE_FRACTIONS)) {
    workingText = workingText.replace(new RegExp(uni, 'g'), ` ${frac} `);
  }

  // Normalize multi-spaces
  workingText = workingText.replace(/\s+/g, ' ').trim();

  // 4. Match quantity:
  // Matches: "1 1/2", "1/2", "1.5", "1-2", "1 to 2", "1"
  let quantity = '';
  const qtyMatch = workingText.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?|\d+\s+to\s+\d+)/i);
  if (qtyMatch) {
    quantity = qtyMatch[1].replace(/\s+/g, ' ').trim();
    workingText = workingText.substring(qtyMatch[0].length).trim();
  }

  // 5. Match unit against known unit list
  let unit = '';
  for (const u of SORTED_UNITS) {
    const unitRegex = new RegExp(`^${u.replace('.', '\\.')}(?:\\s+|$)`, 'i');
    const uMatch = workingText.match(unitRegex);
    if (uMatch) {
      unit = UNIT_CANONICAL_MAP[u.toLowerCase()] || u.toLowerCase();
      workingText = workingText.substring(uMatch[0].length).trim();
      break;
    }
  }

  // Clean leading "of" (e.g. "1 cup of flour" -> name: "flour")
  workingText = workingText.replace(/^of\s+/i, '').trim();

  // Final ingredient name
  let name = workingText.trim();
  if (!name && unit && !quantity) {
    // If working text was treated as unit but no name exists (e.g. "salt")
    name = unit;
    unit = '';
  }

  return {
    originalText,
    quantity,
    unit,
    name,
    notes: notesArr.filter(Boolean).join(', ')
  };
}

/**
 * Batch parses an array of raw ingredient inputs.
 */
export function parseIngredients(items: (string | any)[]): ParsedIngredient[] {
  if (!items || !Array.isArray(items)) return [];
  
  return items
    .map(item => {
      if (typeof item === 'string') {
        return parseIngredient(item);
      }
      if (typeof item === 'object' && item !== null) {
        if (item.raw || item.originalText) {
          return parseIngredient(item.raw || item.originalText);
        }
        return {
          originalText: item.name || '',
          quantity: item.quantity || '',
          unit: item.unit || '',
          name: item.name || '',
          notes: item.notes || ''
        };
      }
      return null;
    })
    .filter((ing): ing is ParsedIngredient => ing !== null && ing.name.length > 0);
}
