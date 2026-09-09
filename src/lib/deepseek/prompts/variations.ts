import type { FactSheet } from '../../normalization/types';

export function buildVariationsPrompt(factSheet: FactSheet): { system: string; user: string } {
  const system = `You are a creative pastry chef.
Suggest 3 to 5 delicious, realistic flavor and mix-in variations for this recipe.

CRITICAL EDITORIAL RULES:
1. The base recipe remains authoritative and unchanged.
2. Label each variation clearly as an optional addition or mix-in.
3. Suggest plausible combinations that work without disrupting the core batter chemistry (e.g. adding toasted walnuts, dark chocolate chips, cinnamon swirl, streusel topping, blueberries).
4. For each variation, specify exact quantities and any minor adjustments needed (e.g. fold in 1/2 cup chocolate chips with the dry ingredients).
5. Respond with a valid JSON object only.

JSON Schema:
{
  "variations": [
    {
      "name": "string - variation title (e.g. Chocolate Chip Walnut, Cinnamon Streusel Swirl)",
      "description": "string - 2 to 3 sentences explaining the addition, quantity to use, and when to incorporate it."
    }
  ]
}`;

  const user = JSON.stringify({
    title: factSheet.lockedFacts.title,
    ingredientsSummary: factSheet.lockedFacts.ingredients.map(i => i.name)
  }, null, 2);

  return { system, user };
}
