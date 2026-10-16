import { defineCollection, z } from 'astro:content';

// Every recipe on the site is a Markdown file in src/content/recipes/.
// A daily cron adds one new file per day — no database, no admin panel.
const recipes = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    prepTime: z.number().optional(),
    cookTime: z.number().optional(),
    totalTime: z.number().optional(),
    servings: z.string().optional(),
    cuisine: z.string().optional(),
    category: z.string().default('baking'),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    ingredients: z.array(z.string()),
    instructions: z.array(z.string()),
    faq: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
        })
      )
      .optional(),
  }),
});

export const collections = { recipes };
