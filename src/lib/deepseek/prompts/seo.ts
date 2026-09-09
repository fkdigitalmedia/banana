import type { FactSheet } from '../../normalization/types';

export function buildSeoPrompt(factSheet: FactSheet, primaryKeyword: string): { system: string; user: string } {
  const system = `You are a culinary SEO specialist and copywriter.
Generate high-ranking, click-worthy, natural SEO metadata for this recipe.

CRITICAL SEO RULES:
1. Target Keyword: "${primaryKeyword}".
2. SEO Title: 50 to 60 characters max. Include the primary keyword naturally with a distinctive culinary attribute.
   - STRICTLY FORBIDDEN: Formulaic templates such as "Best [Recipe] Recipe", "The Best...", "#1 Recipe", "World's Best", "Guaranteed", or "Award-Winning".
   - PREFERRED: Specific descriptors highlighting technique, texture, or flavor (e.g. "One-Bowl Cinnamon Banana Bread (Tender & Moist)", "Classic Buttermilk Scones with Golden Crumb").
3. Meta Description: 140 to 155 characters max. Accurately describe the recipe, mention realistic highlights (prep time, crumb, simple ingredients), and avoid fake claims or repetitive templates.
4. Slug: URL-safe slug (lowercase, hyphens only, concise e.g. "banana-bread-recipe", "blueberry-lemon-muffins"). NEVER generate keyword-stuffed slugs (e.g. "best-easy-amazing-delicious-banana-bread-recipe-ever").
5. Secondary Keywords: 4 to 6 naturally relevant supporting search terms (e.g. "homemade banana bread", "moist banana bread", "quick bread with ripe bananas").
6. NO keyword stuffing.
7. Respond with a valid JSON object only.

JSON Schema:
{
  "title": "string - SEO title (50-60 characters)",
  "metaDescription": "string - Meta description (140-155 characters)",
  "slug": "string - Clean URL slug",
  "secondaryKeywords": ["string - 4 to 6 secondary search phrases"]
}`;

  const user = JSON.stringify({
    recipeTitle: factSheet.lockedFacts.title,
    prepTime: factSheet.lockedFacts.prepTimeMinutes,
    cookTime: factSheet.lockedFacts.cookTimeMinutes,
    totalTime: factSheet.lockedFacts.totalTimeMinutes,
    yield: factSheet.lockedFacts.yieldText,
    primaryKeyword
  }, null, 2);

  return { system, user };
}
