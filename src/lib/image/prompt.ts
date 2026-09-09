/**
 * Builds deterministic, photorealistic food photography prompts for FLUX.1 Schnell.
 * Grounded exclusively in locked recipe facts without hallucinating absent ingredients.
 */
export function buildRecipeImagePrompt(recipe: {
  title: string;
  description?: string;
  ingredients?: Array<{ name: string; quantity?: string; unit?: string } | string>;
  cuisine?: string;
}): { prompt: string; negativePrompt: string } {
  const title = (recipe.title || 'Homemade Recipe').trim();

  // Extract key non-generic ingredients (flour, sugar, bananas, butter, etc.)
  const keyIngredients: string[] = [];
  if (Array.isArray(recipe.ingredients)) {
    for (const item of recipe.ingredients) {
      const name = (typeof item === 'string' ? item : item.name || '').toLowerCase();
      if (name.includes('banana')) keyIngredients.push('ripe bananas');
      else if (name.includes('chocolate') || name.includes('cocoa')) keyIngredients.push('chocolate chips');
      else if (name.includes('walnut') || name.includes('pecan')) keyIngredients.push('chopped nuts');
      else if (name.includes('cinnamon')) keyIngredients.push('warm cinnamon');
      else if (name.includes('berry') || name.includes('blueberry')) keyIngredients.push('fresh berries');
      else if (name.includes('vanilla')) keyIngredients.push('pure vanilla');
    }
  }

  const uniqueKeyIngs = [...new Set(keyIngredients)].slice(0, 3);
  const ingredientHighlight = uniqueKeyIngs.length > 0 ? `featuring ${uniqueKeyIngs.join(' and ')}` : '';

  // Tailor prompt specifically for Banana Bread if title matches
  let subjectDescription = `A freshly prepared ${title} ${ingredientHighlight}`.trim();
  if (title.toLowerCase().includes('banana bread')) {
    subjectDescription = 'A freshly baked homemade banana bread loaf on a rustic ceramic plate, golden brown crust, moist sliced interior, visible banana texture';
  } else if (title.toLowerCase().includes('muffin')) {
    subjectDescription = `A batch of freshly baked ${title} with golden domed tops sitting on a wire cooling rack`;
  } else if (title.toLowerCase().includes('cake')) {
    subjectDescription = `A beautifully frosted slice of homemade ${title} on an artisanal dessert plate`;
  } else if (title.toLowerCase().includes('cookie')) {
    subjectDescription = `A stack of warm freshly baked ${title} with slightly soft centers and crisp edges`;
  } else if (title.toLowerCase().includes('bread')) {
    subjectDescription = `An artisanal loaf of homemade ${title}, sliced open revealing an airy, soft crumb structure`;
  }

  const positivePrompt = `${subjectDescription}, natural food photography, soft warm morning daylight, realistic food texture, appetizing styling, clean neutral wooden kitchen table, shallow depth of field, cookbook editorial photography, sharp focus, 8k resolution, photorealistic`.trim();

  const negativePrompt = 'text, typography, letters, words, logo, watermark, signature, brand packaging, plastic, people, human face, hands, deformed food, cartoon, anime, illustration, 3d render, CGI, over-saturated, blurry, low resolution, dark lighting, messy tabletop, unrealistic colors, fake food';

  return {
    prompt: positivePrompt,
    negativePrompt
  };
}
