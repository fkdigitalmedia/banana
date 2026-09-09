import * as cheerio from 'cheerio';
import type { RawRecipeData } from '../normalization/types';

export interface HtmlExtractResult {
  data: RawRecipeData;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  foundFields: string[];
}

function cleanText(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export function extractFromHtml(html: string): HtmlExtractResult | null {
  const $ = cheerio.load(html);
  const data: RawRecipeData = {};
  const foundFields: string[] = [];

  // Title
  const titleSelectors = [
    '[itemprop="name"]',
    '.wprm-recipe-name',
    '.tasty-recipes-title',
    '.recipe-title',
    'h1.recipe-name',
    'h2.recipe-name',
    'h1'
  ];
  for (const sel of titleSelectors) {
    const el = $(sel).first();
    if (el.length) {
      data.title = cleanText(el.text());
      foundFields.push('title');
      break;
    }
  }

  // Description
  const descSelectors = [
    { sel: '[itemprop="description"]', method: 'text' },
    { sel: '.wprm-recipe-summary', method: 'text' },
    { sel: '.tasty-recipes-description p', method: 'text' },
    { sel: '.recipe-description', method: 'text' },
    { sel: '.recipe-summary', method: 'text' },
    { sel: 'meta[name="description"]', method: 'attr', attr: 'content' }
  ];
  for (const s of descSelectors) {
    const el = $(s.sel).first();
    if (el.length) {
      let val = '';
      if (s.method === 'attr' && s.attr) {
        val = el.attr(s.attr) || '';
      } else if (s.sel === '.tasty-recipes-description p') {
        val = $(s.sel).map((_, e) => $(e).text()).get().join('\n');
      } else {
        val = el.text();
      }
      if (val) {
        data.description = cleanText(val);
        foundFields.push('description');
        break;
      }
    }
  }

  // Ingredients
  const ingSelectors = [
    '[itemprop="recipeIngredient"]',
    '.wprm-recipe-ingredient',
    '.tasty-recipes-ingredients ul li',
    '.recipe-ingredients li',
    '.ingredients-item',
    '.ingredients li',
    'ul.ingredients li'
  ];
  for (const sel of ingSelectors) {
    const els = $(sel);
    if (els.length > 0) {
      const ings = els.map((_, el) => cleanText($(el).text())).get().filter(t => t.length > 0);
      if (ings.length > 0) {
        data.ingredients = ings;
        foundFields.push('ingredients');
        break;
      }
    }
  }

  // Instructions
  const instSelectors = [
    '[itemprop="recipeInstructions"]',
    '.wprm-recipe-instruction-text',
    '.wprm-recipe-instruction',
    '.wprm-recipe-instructions li',
    '.wprm-recipe-instructions div',
    '.tasty-recipes-instructions li',
    '.recipe-instructions li',
    '.recipe-instructions p',
    '.recipe-method li',
    '.instructions li',
    '.instructions p',
    'ol.instructions li',
    '.direction-step',
    '.step p'
  ];
  for (const sel of instSelectors) {
    const els = $(sel);
    if (els.length > 0) {
      const insts = els.map((_, el) => cleanText($(el).text())).get().filter(t => t.length > 0);
      if (insts.length > 0) {
        data.instructions = insts;
        foundFields.push('instructions');
        break;
      }
    }
  }

  // Times
  const timeExtracts = [
    { field: 'prepTime' as keyof RawRecipeData, sels: ['[itemprop="prepTime"]', '.wprm-recipe-prep-time-container'] },
    { field: 'cookTime' as keyof RawRecipeData, sels: ['[itemprop="cookTime"]', '.wprm-recipe-cook-time-container'] },
    { field: 'totalTime' as keyof RawRecipeData, sels: ['[itemprop="totalTime"]', '.wprm-recipe-total-time-container'] }
  ];
  for (const t of timeExtracts) {
    for (const sel of t.sels) {
      const el = $(sel).first();
      if (el.length) {
        let val = el.attr('content') || el.text();
        if (val) {
          data[t.field] = cleanText(val) as any;
          if (!foundFields.includes(t.field)) foundFields.push(t.field);
          break;
        }
      }
    }
  }

  // Servings
  const servSelectors = [
    '[itemprop="recipeYield"]',
    '.wprm-recipe-servings-container',
    '.tasty-recipes-yield'
  ];
  for (const sel of servSelectors) {
    const el = $(sel).first();
    if (el.length) {
      data.servings = cleanText(el.text());
      foundFields.push('servings');
      break;
    }
  }

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  const hasTitle = !!data.title;
  const ingCount = data.ingredients?.length || 0;
  const instCount = data.instructions?.length || 0;

  if (hasTitle && ingCount >= 3 && instCount >= 2) {
    confidence = 'HIGH';
  } else if (hasTitle && (ingCount >= 1 || instCount >= 1)) {
    confidence = 'MEDIUM';
  }

  if (confidence === 'LOW' && ingCount === 0 && instCount === 0) {
    return null;
  }

  return {
    data,
    confidence,
    foundFields
  };
}
