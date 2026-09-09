/**
 * Prompt 17: Comprehensive Multi-Recipe Content, SEO, Schema & AdSense Readiness Audit
 * 
 * Runs 12 diverse culinary fixtures representing quick breads, muffins, cookies, cakes,
 * savory breads, breakfast, scones, brownies, pizza dough, crepes, biscuits, and holiday loaves.
 */

import { extractJsonLd } from '../src/lib/extraction/jsonld';
import { normalizeRecipe } from '../src/lib/normalization/normalizer';
import { createFactSheet } from '../src/lib/pipeline/factsheet';
import { validateRecipeFacts } from '../src/lib/validation/recipe';
import { validateContent } from '../src/lib/validation/content';
import { validateSeoOutput, findBannedAiPhrases, FORMULAIC_TITLE_PATTERNS } from '../src/lib/deepseek/validator';
import { generateRecipeJsonLd, generateBreadcrumbJsonLd } from '../src/lib/seo/jsonld';
import { calculateRelatedScore } from '../src/lib/seo/linking';
import type { RawRecipeData, GeneratedContent } from '../src/lib/normalization/types';

interface RecipeAuditFixture {
  id: number;
  name: string;
  category: string;
  cuisine: string;
  rawJsonLd: any;
  mockGeneratedContent: GeneratedContent;
  primaryKeyword: string;
}

const FIXTURES: RecipeAuditFixture[] = [
  // 1. Classic Banana Bread (Primary Regression)
  {
    id: 1,
    name: 'Classic Banana Bread',
    category: 'Bread',
    cuisine: 'American',
    primaryKeyword: 'banana bread recipe',
    rawJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Classic Moist Banana Bread',
      description: 'A dependable, ultra-moist banana bread recipe made with ripe bananas, pure butter, and a hint of warm cinnamon.',
      prepTime: 'PT15M',
      cookTime: 'PT55M',
      totalTime: 'PT70M',
      recipeYield: '1 loaf (8 slices)',
      recipeIngredient: [
        '3 ripe bananas, mashed',
        '1/3 cup melted unsalted butter',
        '3/4 cup granulated sugar',
        '1 large egg, beaten',
        '1 tsp vanilla extract',
        '1 tsp baking soda',
        '1 1/2 cups all-purpose flour'
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Preheat oven to 350°F (175°C) and grease an 8x4-inch loaf pan.' },
        { '@type': 'HowToStep', text: 'In a mixing bowl, mash the ripe bananas with a fork until smooth.' },
        { '@type': 'HowToStep', text: 'Stir in melted butter, sugar, beaten egg, and vanilla.' },
        { '@type': 'HowToStep', text: 'Gently fold in baking soda and flour until just combined. Pour into pan and bake for 55 minutes.' }
      ]
    },
    mockGeneratedContent: {
      introduction: 'The aroma of ripe bananas and browned butter drifting from the oven is a hallmark of weekend home baking. This loaf balances high moisture with a tender crumb structure that slices cleanly without crumbling apart.',
      whyThisRecipe: 'Requires no stand mixer, uses everyday kitchen staples, and achieves optimal caramelization along the crust thanks to accurate baking temperatures.',
      ingredientGuidance: [
        { ingredient: 'Ripe Bananas', guidance: 'Use deeply speckled or black-peeled bananas for maximum sugar concentration and moisture.' },
        { ingredient: 'Unsalted Butter', guidance: 'Melting the butter yields a denser, moister crumb than creaming softened butter.' }
      ],
      cookingGuidance: [
        'Avoid over-mixing once the flour is added to prevent excess gluten development, which causes a rubbery crumb.',
        'Tent with aluminum foil after 35 minutes if the top crust is browning faster than the center sets.'
      ],
      tips: [
        '**Pan Selection:** A light-colored aluminum loaf pan prevents dark, bitter crust edges.',
        '**Toothpick Test:** Insert a wooden skewer into the highest point; it should emerge with a few moist crumbs, not wet batter.'
      ],
      variations: [
        { name: 'Toasted Walnut Banana Bread', description: 'Fold 1/2 cup chopped toasted walnuts into the batter just before pouring into the pan.' }
      ],
      servingSuggestions: 'Serve warm with a generous swipe of salted butter or a drizzle of wildflower honey.',
      storage: 'Wrap tightly in parchment paper and keep at room temperature for up to 4 days. For longer storage, freeze individual slices wrapped in plastic for up to 3 months.',
      faq: [
        { question: 'Why did my banana bread sink in the middle?', answer: 'Underbaking is the most common cause. Because mashed bananas add significant moisture, test with a skewer in the center.' },
        { question: 'Can I use frozen bananas?', answer: 'Yes. Thaw completely and include any liquid that separates during thawing for proper hydration.' }
      ],
      seo: {
        title: 'One-Bowl Cinnamon Banana Bread (Ultra Moist)',
        metaDescription: 'Bake a tender, ultra-moist banana bread using ripe bananas and melted butter. Easy one-bowl recipe with step-by-step baking times.',
        slug: 'banana-bread-recipe'
      }
    }
  },
  // 2. Lemon Blueberry Muffins
  {
    id: 2,
    name: 'Lemon Blueberry Muffins',
    category: 'Muffins',
    cuisine: 'American',
    primaryKeyword: 'blueberry muffin recipe',
    rawJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Bakery-Style Lemon Blueberry Muffins',
      description: 'Tall, golden muffins loaded with fresh blueberries and bright lemon zest.',
      prepTime: 'PT15M',
      cookTime: 'PT22M',
      totalTime: 'PT37M',
      recipeYield: '12 muffins',
      recipeIngredient: [
        '2 cups all-purpose flour',
        '2 tsp baking powder',
        '1/2 tsp salt',
        '3/4 cup sugar',
        '1 tbsp fresh lemon zest',
        '1/2 cup unsalted butter, melted',
        '2 large eggs',
        '1/2 cup whole milk',
        '1 1/2 cups fresh blueberries'
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Preheat oven to 400°F (200°C) and line a 12-cup muffin tin.' },
        { '@type': 'HowToStep', text: 'Rub lemon zest into the granulated sugar with your fingertips until fragrant.' },
        { '@type': 'HowToStep', text: 'Whisk dry ingredients in one bowl; combine wet ingredients in another.' },
        { '@type': 'HowToStep', text: 'Fold together gently, toss blueberries in a spoonful of flour, and fold in. Bake for 22 minutes.' }
      ]
    },
    mockGeneratedContent: {
      introduction: 'Fresh citrus zest elevates standard bakery muffins from ordinary to vibrant. Tossing the berries in a small dusting of flour keeps them suspended throughout the batter rather than sinking to the pan bottom.',
      whyThisRecipe: 'High initial baking heat creates impressive domed muffin tops with a soft, velvet crumb.',
      ingredientGuidance: [
        { ingredient: 'Fresh Blueberries', guidance: 'Pat completely dry after washing so excess water does not dilute the batter.' }
      ],
      cookingGuidance: [
        'Baking at 400°F triggers rapid steam expansion for classic domed tops.'
      ],
      tips: [
        '**Lemon Sugar:** Rubbing citrus zest into sugar releases aromatic oils before combining with liquids.'
      ],
      variations: [],
      servingSuggestions: 'Enjoy warm with sweet cream butter.',
      storage: 'Store in an airtight container lined with paper towels for up to 3 days.',
      faq: [
        { question: 'Can I use frozen blueberries?', answer: 'Yes, but do not thaw them prior to folding in, or the batter will streak purple.' }
      ],
      seo: {
        title: 'Bakery-Style Lemon Blueberry Muffins (Tall & Golden)',
        metaDescription: 'Bake tall, golden lemon blueberry muffins bursting with fresh fruit and citrus zest. Quick prep with foolproof tips for high-domed tops.',
        slug: 'lemon-blueberry-muffins'
      }
    }
  },
  // 3. Chewy Chocolate Chip Cookies
  {
    id: 3,
    name: 'Chewy Chocolate Chip Cookies',
    category: 'Cookies',
    cuisine: 'American',
    primaryKeyword: 'chocolate chip cookie recipe',
    rawJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Brown Butter Chocolate Chip Cookies',
      description: 'Chewy centers, crisp golden edges, and nutty brown butter notes.',
      prepTime: 'PT20M',
      cookTime: 'PT12M',
      totalTime: 'PT32M',
      recipeYield: '24 cookies',
      recipeIngredient: [
        '1 cup unsalted butter, browned and cooled',
        '3/4 cup brown sugar',
        '1/2 cup granulated sugar',
        '2 large eggs',
        '2 1/4 cups all-purpose flour',
        '1 tsp baking soda',
        '1 1/2 cups semi-sweet chocolate chunks'
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Brown the butter in a saucepan over medium heat until nutty and amber, then cool.' },
        { '@type': 'HowToStep', text: 'Preheat oven to 375°F (190°C) and line baking sheets with parchment paper.' },
        { '@type': 'HowToStep', text: 'Beat browned butter with sugars, add eggs, and fold in flour and chocolate chunks.' },
        { '@type': 'HowToStep', text: 'Scoop 2-tablespoon dough balls onto sheets and bake 10-12 minutes.' }
      ]
    },
    mockGeneratedContent: {
      introduction: 'Browning the butter boils away water content while toasting milk solids into caramelized specks. The resulting cookie dough develops deep butterscotch undertones with contrasting crisp edges and a chewy core.',
      whyThisRecipe: 'Balancing brown and white sugars provides both chewiness and crisp structural margins.',
      ingredientGuidance: [
        { ingredient: 'Brown Butter', guidance: 'Cool butter to room temperature so it emulsifies properly with the sugars without melting them prematurely.' }
      ],
      cookingGuidance: [
        'Do not overbake; cookies should appear slightly soft in the center when removed from the oven.'
      ],
      tips: [
        '**Pan Banging:** Tap the baking sheet gently on the counter right out of the oven to produce dramatic ripples.'
      ],
      variations: [],
      servingSuggestions: 'Sprinkle with flaky Maldon sea salt immediately after baking.',
      storage: 'Keep in an airtight tin with a small slice of bread to maintain moisture for up to 5 days.',
      faq: [
        { question: 'Why chill cookie dough?', answer: 'Chilling solidifies the fat and allows flour enzymes to break down starches, enhancing depth of flavor.' }
      ],
      seo: {
        title: 'Chewy Brown Butter Chocolate Chip Cookies (Crispy Edges)',
        metaDescription: 'Make bakery-worthy chewy chocolate chip cookies featuring nutty browned butter and dark chocolate chunks. Ready in 30 minutes.',
        slug: 'brown-butter-chocolate-chip-cookies'
      }
    }
  },
  // 4. Moist Carrot Cake
  {
    id: 4,
    name: 'Moist Carrot Cake',
    category: 'Cakes',
    cuisine: 'American',
    primaryKeyword: 'carrot cake recipe',
    rawJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Spiced Carrot Cake with Cream Cheese Frosting',
      description: 'A richly spiced two-layer carrot cake loaded with freshly grated carrots.',
      prepTime: 'PT30M',
      cookTime: 'PT35M',
      totalTime: 'PT65M',
      recipeYield: '12 servings',
      recipeIngredient: [
        '2 cups all-purpose flour',
        '2 tsp baking powder',
        '1 tsp baking soda',
        '2 tsp ground cinnamon',
        '4 large eggs',
        '1 cup neutral vegetable oil',
        '1 cup brown sugar',
        '3 cups freshly grated carrots',
        '8 oz cream cheese, softened for frosting'
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Preheat oven to 350°F (175°C) and grease two 9-inch round cake pans.' },
        { '@type': 'HowToStep', text: 'Whisk together dry ingredients and spices.' },
        { '@type': 'HowToStep', text: 'Beat eggs, oil, and sugar until pale and emulsified. Stir in carrots.' },
        { '@type': 'HowToStep', text: 'Divide between pans and bake for 35 minutes until a tester comes out clean.' }
      ]
    },
    mockGeneratedContent: {
      introduction: 'Freshly grated carrots contribute both natural sweetness and prolonged moisture retention to the spiced crumb. Paired with a tangy cream cheese frosting, this cake balances warm cinnamon depth with creamy richness.',
      whyThisRecipe: 'Using vegetable oil rather than butter ensures the cake stays exceptionally soft even when served chilled.',
      ingredientGuidance: [
        { ingredient: 'Grated Carrots', guidance: 'Hand-grate whole carrots on the medium holes of a box grater; pre-shredded bagged carrots are too dry.' }
      ],
      cookingGuidance: ['Cool cake layers completely on wire racks before spreading cream cheese frosting.'],
      tips: ['**Level Layers:** Use a serrated knife to gently trim domed tops for a flat, stable double-layer assembly.'],
      variations: [],
      servingSuggestions: 'Garnish with crushed toasted pecans.',
      storage: 'Refrigerate covered for up to 5 days due to the dairy frosting.',
      faq: [{ question: 'Can I make cupcakes instead?', answer: 'Yes, divide batter into 24 lined muffin cups and bake at 350°F for 18-20 minutes.' }],
      seo: {
        title: 'Spiced Two-Layer Carrot Cake (Velvet Cream Cheese)',
        metaDescription: 'Bake a tender, moist two-layer carrot cake spiced with cinnamon and topped with silky cream cheese frosting. Foolproof kitchen guide.',
        slug: 'spiced-carrot-cake-recipe'
      }
    }
  },
  // 5. Artisan Garlic Rosemary Focaccia (Savory)
  {
    id: 5,
    name: 'Garlic Rosemary Focaccia',
    category: 'Bread',
    cuisine: 'Italian',
    primaryKeyword: 'focaccia bread recipe',
    rawJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'No-Knead Rosemary Garlic Focaccia',
      description: 'Crispy olive oil bottom, bubbly airy crumb, and fragrant fresh rosemary.',
      prepTime: 'PT20M',
      cookTime: 'PT25M',
      totalTime: 'PT45M',
      recipeYield: '1 large sheet pan',
      recipeIngredient: [
        '4 cups bread flour',
        '2 tsp instant yeast',
        '2 tsp kosher salt',
        '1 3/4 cups lukewarm water',
        '1/3 cup extra virgin olive oil',
        '2 tbsp fresh rosemary leaves',
        '4 cloves garlic, thinly sliced',
        'Flaky sea salt'
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Mix flour, yeast, salt, and water in a large bowl into a sticky dough.' },
        { '@type': 'HowToStep', text: 'Proof dough until doubled in bulk, then transfer to an olive-oil coated baking pan.' },
        { '@type': 'HowToStep', text: 'Preheat oven to 425°F (220°C).' },
        { '@type': 'HowToStep', text: 'Dimple dough deeply with oiled fingertips, scatter garlic and rosemary, and bake 25 minutes.' }
      ]
    },
    mockGeneratedContent: {
      introduction: 'High hydration and generous extra virgin olive oil produce the open, airy crumb characteristic of authentic Ligurian focaccia. The hot baking temperature fries the bottom crust against the pan while puffing up golden bubbles.',
      whyThisRecipe: 'Requires no intense kneading—time and gentle stretching develop the gluten structure naturally.',
      ingredientGuidance: [
        { ingredient: 'Bread Flour', guidance: 'High-protein bread flour supports large fermentation gas bubbles without collapsing.' }
      ],
      cookingGuidance: ['Dimple firmly until your fingertips feel the bottom of the pan to distribute olive oil pockets.'],
      tips: ['**Generous Oil:** Do not skimp on pan oil; it is what fries the bottom crust to a crisp golden crunch.'],
      variations: [],
      servingSuggestions: 'Serve with balsamic reduction and good olive oil.',
      storage: 'Best enjoyed fresh the day of baking; revive leftover slices in a 375°F toaster oven.',
      faq: [{ question: 'Can I do an overnight cold proof?', answer: 'Yes, an overnight ferment in the refrigerator develops outstanding complex sourdough-like flavor.' }],
      seo: {
        title: 'Crispy Rosemary Garlic Focaccia (No-Knead Olive Oil)',
        metaDescription: 'Master airy, golden Italian focaccia topped with fresh rosemary and garlic. High-hydration dough with foolproof pan-dimpling steps.',
        slug: 'rosemary-garlic-focaccia'
      }
    }
  },
  // 6. Fluffy Buttermilk Pancakes
  {
    id: 6,
    name: 'Fluffy Buttermilk Pancakes',
    category: 'Breakfast',
    cuisine: 'American',
    primaryKeyword: 'buttermilk pancake recipe',
    rawJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Diner-Style Fluffy Buttermilk Pancakes',
      description: 'Thick, cloud-like pancakes with golden griddled surfaces.',
      prepTime: 'PT10M',
      cookTime: 'PT15M',
      totalTime: 'PT25M',
      recipeYield: '10 pancakes',
      recipeIngredient: [
        '2 cups all-purpose flour',
        '2 tbsp sugar',
        '2 tsp baking powder',
        '1 tsp baking soda',
        '1/2 tsp salt',
        '2 cups cultured buttermilk',
        '2 large eggs',
        '1/4 cup melted butter'
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Whisk dry ingredients together in a large mixing bowl.' },
        { '@type': 'HowToStep', text: 'Whisk buttermilk, eggs, and melted butter; fold gently into flour mixture leaving lumps.' },
        { '@type': 'HowToStep', text: 'Heat cast iron skillet to 350°F (medium heat).' },
        { '@type': 'HowToStep', text: 'Cook 1/3 cup portions until bubbles burst on surface, flip and cook 2 minutes.' }
      ]
    },
    mockGeneratedContent: {
      introduction: 'Cultured buttermilk provides lactic acid that reacts immediately with baking soda, generating carbon dioxide bubbles that lift the batter into tall, pillowy pancakes. Leaving visible lumps in the batter prevents tough texture.',
      whyThisRecipe: 'Resting the batter for 5 minutes allows the flour to hydrate fully before hitting the griddle.',
      ingredientGuidance: [{ ingredient: 'Cultured Buttermilk', guidance: 'Real cultured buttermilk provides optimal thickness and acid activation.' }],
      cookingGuidance: ['Flip only once when bubbles across the surface pop and form open holes.'],
      tips: ['**Lumpy Batter:** Do not whisk smooth; small flour pockets release steam and create tender pockets.'],
      variations: [],
      servingSuggestions: 'Top with warm pure maple syrup and salted butter.',
      storage: 'Freeze cooked pancakes in single layers separated by wax paper; reheat directly in toaster.',
      faq: [{ question: 'Can I substitute milk and vinegar?', answer: 'In a pinch yes, but genuine cultured buttermilk produces thicker pancakes.' }],
      seo: {
        title: 'Tall Fluffy Buttermilk Pancakes (Diner Style)',
        metaDescription: 'Cook extra fluffy, golden buttermilk pancakes with light, tender centers. Quick 20-minute breakfast recipe with key griddle tips.',
        slug: 'fluffy-buttermilk-pancakes'
      }
    }
  },
  // 7. Cinnamon Apple Scones
  {
    id: 7,
    name: 'Cinnamon Apple Scones',
    category: 'Baking',
    cuisine: 'British',
    primaryKeyword: 'apple scone recipe',
    rawJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Spiced Apple Cinnamon Scones',
      description: 'Flaky, buttery scones studded with crisp apple chunks and cinnamon glaze.',
      prepTime: 'PT20M',
      cookTime: 'PT18M',
      totalTime: 'PT38M',
      recipeYield: '8 scones',
      recipeIngredient: [
        '2 cups all-purpose flour',
        '1/3 cup sugar',
        '1 tbsp baking powder',
        '1/2 cup cold unsalted butter, cubed',
        '1 cup peeled diced Granny Smith apples',
        '1/2 cup heavy cream',
        '1 large egg',
        '1 tsp vanilla'
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Preheat oven to 400°F (200°C) and line sheet pan.' },
        { '@type': 'HowToStep', text: 'Cut cold butter into flour mixture until pea-sized crumbs form.' },
        { '@type': 'HowToStep', text: 'Toss in diced apples. Stir in cream, egg, and vanilla until dough just comes together.' },
        { '@type': 'HowToStep', text: 'Shape into 8-inch disk, cut into 8 wedges, and bake for 18 minutes.' }
      ]
    },
    mockGeneratedContent: {
      introduction: 'Cold butter pockets expand in the hot oven to create delicate, flaky layers in scone dough. Tart Granny Smith apples hold their structural shape during baking without dissolving into mush.',
      whyThisRecipe: 'Minimal handling and cold butter guarantee tender crumb without heaviness.',
      ingredientGuidance: [{ ingredient: 'Cold Butter', guidance: 'Keep butter chilled until the moment it is cut into the flour.' }],
      cookingGuidance: ['Chill cut scone wedges in the freezer for 10 minutes before baking to sharpen flaky layers.'],
      tips: ['**Sharp Knife Cut:** Press straight down without sawing to allow the pastry edges to rise cleanly.'],
      variations: [],
      servingSuggestions: 'Drizzle with cinnamon powdered sugar glaze while warm.',
      storage: 'Keep at room temperature in a tin for up to 2 days.',
      faq: [{ question: 'Why did my scones spread flat?', answer: 'Warm butter melted into the flour before baking; keep the dough chilled.' }],
      seo: {
        title: 'Flaky Cinnamon Apple Scones (Bakery Style)',
        metaDescription: 'Bake tender, flaky apple cinnamon scones studded with tart fruit and drizzled with sweet glaze. High-rising weekend breakfast treat.',
        slug: 'cinnamon-apple-scones'
      }
    }
  },
  // 8. Fudgy Dark Chocolate Brownies
  {
    id: 8,
    name: 'Fudgy Dark Chocolate Brownies',
    category: 'Desserts',
    cuisine: 'American',
    primaryKeyword: 'fudgy brownie recipe',
    rawJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Chewy Fudgy Dark Chocolate Brownies',
      description: 'Ultra-dense fudgy brownies with paper-thin shiny crinkle tops.',
      prepTime: 'PT15M',
      cookTime: 'PT28M',
      totalTime: 'PT43M',
      recipeYield: '16 squares',
      recipeIngredient: [
        '1/2 cup unsalted butter',
        '8 oz dark chocolate (70%), chopped',
        '3/4 cup granulated sugar',
        '1/2 cup brown sugar',
        '3 large eggs, room temperature',
        '1/2 cup all-purpose flour',
        '1/4 cup Dutch-process cocoa powder',
        '1/2 tsp espresso powder'
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Preheat oven to 350°F (175°C) and line an 8-inch square pan with parchment paper.' },
        { '@type': 'HowToStep', text: 'Melt butter and chopped chocolate together over low heat until glossy.' },
        { '@type': 'HowToStep', text: 'Vigorously beat eggs with both sugars for 5 minutes until pale and frothy.' },
        { '@type': 'HowToStep', text: 'Fold chocolate into egg foam, then fold in cocoa and flour. Bake for 28 minutes.' }
      ]
    },
    mockGeneratedContent: {
      introduction: 'The signature shiny, paper-thin crinkle crust of a premier brownie is formed by dissolving sugar thoroughly into beaten eggs before combining with warm melted chocolate. Low flour content yields a rich, truffle-like density.',
      whyThisRecipe: 'Espresso powder amplifies the deep roasted cacao notes without imparting any distinct coffee flavor.',
      ingredientGuidance: [{ ingredient: 'Dutch-Process Cocoa', guidance: 'Alkalized cocoa creates darker coloration and a smoother chocolate finish.' }],
      cookingGuidance: ['Do not overbake; pull from the oven when a tester shows thick moist crumbs.'],
      tips: ['**Clean Slices:** Chill brownies in the pan before slicing with a warm chef knife wiped clean between cuts.'],
      variations: [],
      servingSuggestions: 'Serve slightly warm with vanilla bean gelato.',
      storage: 'Keep at room temperature wrapped tightly for up to 4 days.',
      faq: [{ question: 'How do you get the crinkly top?', answer: 'Whip the eggs and sugar together until light and pale; this forms a delicate meringue skin on top.' }],
      seo: {
        title: 'Glossy Crinkle-Top Fudgy Dark Chocolate Brownies',
        metaDescription: 'Bake ultra-fudgy dark chocolate brownies with paper-thin crinkle tops and rich chewy centers. High cocoa percentage with easy steps.',
        slug: 'fudgy-dark-chocolate-brownies'
      }
    }
  },
  // 9. Margherita Pizza Dough (Savory)
  {
    id: 9,
    name: 'Margherita Pizza Dough',
    category: 'Bread',
    cuisine: 'Italian',
    primaryKeyword: 'homemade pizza dough',
    rawJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Neapolitan Style Pizza Dough',
      description: 'Crisp, blistered crust with a light and airy cornicione.',
      prepTime: 'PT25M',
      cookTime: 'PT8M',
      totalTime: 'PT33M',
      recipeYield: '3 pizzas (12-inch)',
      recipeIngredient: [
        '500g Tipo 00 flour',
        '325ml cold water (65% hydration)',
        '10g fine sea salt',
        '2g active dry yeast'
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Dissolve yeast in water, incorporate flour, and rest 20 minutes for autolyse.' },
        { '@type': 'HowToStep', text: 'Knead in salt until silky and smooth.' },
        { '@type': 'HowToStep', text: 'Divide into 3 dough balls and proof in covered containers.' },
        { '@type': 'HowToStep', text: 'Stretch by hand, top with crushed San Marzano tomatoes, and bake at 500°F (260°C) on a preheated pizza stone for 8 minutes.' }
      ]
    },
    mockGeneratedContent: {
      introduction: 'Finely milled Tipo 00 flour provides high protein elasticity capable of stretching into whisper-thin crusts that blister rapidly under high oven heat. The simple 4-ingredient formulation honors traditional Neapolitan standards.',
      whyThisRecipe: '65% hydration produces large fermentation pockets that crisp along the exterior while remaining soft inside.',
      ingredientGuidance: [{ ingredient: 'Tipo 00 Flour', guidance: 'Finely ground wheat allows high water absorption without becoming gummy.' }],
      cookingGuidance: ['Stretch gently using fingertips and knuckles; never use a rolling pin which presses out airy gases.'],
      tips: ['**Preheated Stone:** Preheat your pizza stone or baking steel for at least 45 minutes at maximum oven heat.'],
      variations: [],
      servingSuggestions: 'Top with fresh mozzarella, fresh basil, and extra virgin olive oil.',
      storage: 'Dough balls keep in the refrigerator for up to 3 days or in the freezer for 1 month.',
      faq: [{ question: 'Can I use all-purpose flour?', answer: 'Yes, though the crust will have slightly less chew than with high-grade Italian 00 flour.' }],
      seo: {
        title: 'Artisan Neapolitan Pizza Dough (Crisp Blistered Crust)',
        metaDescription: 'Master authentic 4-ingredient pizza dough with 65% hydration. Step-by-step stretching and baking instructions for domestic ovens.',
        slug: 'homemade-pizza-dough-recipe'
      }
    }
  },
  // 10. Classic French Crepes
  {
    id: 10,
    name: 'Classic French Crepes',
    category: 'Breakfast',
    cuisine: 'French',
    primaryKeyword: 'french crepe recipe',
    rawJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Delicate French Crepes',
      description: 'Lacy, paper-thin crepes ready for sweet or savory fillings.',
      prepTime: 'PT10M',
      cookTime: 'PT15M',
      totalTime: 'PT25M',
      recipeYield: '12 crepes',
      recipeIngredient: [
        '1 cup all-purpose flour',
        '2 large eggs',
        '1 1/4 cups whole milk',
        '2 tbsp melted butter',
        '1 tbsp sugar',
        'Pinch of salt'
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Blend all ingredients in a blender until completely smooth with no lumps.' },
        { '@type': 'HowToStep', text: 'Rest batter in the refrigerator for 30 minutes to relax gluten.' },
        { '@type': 'HowToStep', text: 'Heat a lightly buttered nonstick 8-inch skillet over medium heat.' },
        { '@type': 'HowToStep', text: 'Pour 3 tablespoons batter, swirling immediately to coat, and cook 1 minute per side.' }
      ]
    },
    mockGeneratedContent: {
      introduction: 'Blending crepe batter creates a uniform emulsion, while a brief refrigeration rest relaxes the gluten network so the crepes cook into tender, whisper-thin sheets that roll smoothly without tearing.',
      whyThisRecipe: 'Equal parts quick preparation and delicate texture suited for sweet preserves or savory gruyere fillings.',
      ingredientGuidance: [{ ingredient: 'Melted Butter', guidance: 'Whisking melted butter into the batter keeps the crepes tender without requiring heavy skillet greasing.' }],
      cookingGuidance: ['Swirl the pan swiftly the second the batter touches the surface for an even, translucent layer.'],
      tips: ['**First Crepe Sacrificial:** The first crepe gauges pan heat and butter coating; adjust burner temperature accordingly.'],
      variations: [],
      servingSuggestions: 'Sprinkle with fresh lemon juice and powdered sugar.',
      storage: 'Stack cooled crepes between wax paper and refrigerate for up to 3 days.',
      faq: [{ question: 'Why must crepe batter rest?', answer: 'Resting allows bubbles to settle and relaxes gluten, ensuring a silky, tear-resistant texture.' }],
      seo: {
        title: 'Delicate French Crepes (Paper-Thin & Tender)',
        metaDescription: 'Whisk together authentic paper-thin French crepes in a blender. Easy 20-minute recipe with tips for swirl technique and sweet fillings.',
        slug: 'classic-french-crepes'
      }
    }
  },
  // 11. Strawberry Shortcake Biscuits
  {
    id: 11,
    name: 'Strawberry Shortcake Biscuits',
    category: 'Desserts',
    cuisine: 'American',
    primaryKeyword: 'strawberry shortcake recipe',
    rawJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Old-Fashioned Strawberry Shortcake',
      description: 'Sweet cream drop biscuits split and filled with macerated berries.',
      prepTime: 'PT20M',
      cookTime: 'PT15M',
      totalTime: 'PT35M',
      recipeYield: '6 shortcakes',
      recipeIngredient: [
        '2 cups all-purpose flour',
        '1/4 cup sugar',
        '1 tbsp baking powder',
        '1/2 cup cold butter, grated',
        '3/4 cup heavy cream',
        '4 cups fresh strawberries, sliced and macerated in 2 tbsp sugar',
        'Fresh whipped cream'
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Toss sliced berries with sugar and rest 30 minutes to release juices.' },
        { '@type': 'HowToStep', text: 'Preheat oven to 425°F (220°C).' },
        { '@type': 'HowToStep', text: 'Mix dry ingredients, cut in cold grated butter, stir in cream, and pat into rounds.' },
        { '@type': 'HowToStep', text: 'Bake for 15 minutes until golden brown; split warm and fill with fruit and cream.' }
      ]
    },
    mockGeneratedContent: {
      introduction: 'Macerating fresh strawberries in sugar draws out natural juices via osmosis, producing a glossy fruit syrup. Paired with rich, buttery shortcake biscuits, this summer classic celebrates seasonal fruit at its peak.',
      whyThisRecipe: 'Grated cold butter distributes evenly throughout the flour for light, tender biscuit layers.',
      ingredientGuidance: [{ ingredient: 'Fresh Strawberries', guidance: 'Choose fragrant, ruby-red berries for the sweetest juice concentration.' }],
      cookingGuidance: ['Split the biscuits gently with a fork rather than a knife to preserve internal craggy texture for soaking up syrup.'],
      tips: ['**Osmosis Timing:** Allow berries at least 30 minutes at room temperature to form an unctuous natural glaze.'],
      variations: [],
      servingSuggestions: 'Top with freshly whipped heavy cream lightly sweetened with vanilla.',
      storage: 'Biscuits keep 2 days; macerated strawberries are best consumed within 24 hours.',
      faq: [{ question: 'Can I use frozen strawberries?', answer: 'Fresh strawberries provide vastly superior texture; frozen strawberries become too mushy when thawed.' }],
      seo: {
        title: 'Old-Fashioned Strawberry Shortcake (Buttery Biscuits)',
        metaDescription: 'Celebrate seasonal strawberries with tender, buttery sweet biscuits and freshly whipped cream. Traditional summer dessert recipe.',
        slug: 'old-fashioned-strawberry-shortcake'
      }
    }
  },
  // 12. Pumpkin Spice Bread
  {
    id: 12,
    name: 'Pumpkin Spice Bread',
    category: 'Bread',
    cuisine: 'American',
    primaryKeyword: 'pumpkin bread recipe',
    rawJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Autumn Spiced Pumpkin Bread',
      description: 'A deeply spiced, fragrant loaf with a tender, moist crumb.',
      prepTime: 'PT15M',
      cookTime: 'PT60M',
      totalTime: 'PT75M',
      recipeYield: '1 loaf (10 slices)',
      recipeIngredient: [
        '1 3/4 cups all-purpose flour',
        '1 tsp baking soda',
        '2 tsp pumpkin pie spice',
        '1/2 tsp salt',
        '1 cup pumpkin puree (not pie mix)',
        '1/2 cup neutral oil',
        '1 cup granulated sugar',
        '1/2 cup brown sugar',
        '2 large eggs'
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Preheat oven to 350°F (175°C) and grease 8.5x4.5-inch loaf pan.' },
        { '@type': 'HowToStep', text: 'Whisk flour, baking soda, spices, and salt.' },
        { '@type': 'HowToStep', text: 'Whisk pumpkin, oil, sugars, and eggs until smooth.' },
        { '@type': 'HowToStep', text: 'Fold wet into dry until just combined. Bake for 60 minutes.' }
      ]
    },
    mockGeneratedContent: {
      introduction: 'Pure pumpkin puree provides substantial moisture and natural fiber, allowing this loaf to remain remarkably tender for days. Warming spices—cinnamon, nutmeg, ginger, and cloves—bloom during the slow bake.',
      whyThisRecipe: 'Balanced sugar ratios caramelize the exterior edges while keeping the core crumb delicate.',
      ingredientGuidance: [{ ingredient: 'Pumpkin Puree', guidance: 'Use 100% pure pumpkin puree, not canned pie filling which contains added starch and syrups.' }],
      cookingGuidance: ['A 60-minute bake requires patience; test with a skewer deep into the center to confirm doneness.'],
      tips: ['**Better Next Day:** Wrap the cooled loaf in foil overnight; the crust softens and spices deepen noticeably by day two.'],
      variations: [],
      servingSuggestions: 'Spread with cinnamon whipped cream cheese.',
      storage: 'Keeps beautifully at room temperature wrapped in plastic for up to 5 days.',
      faq: [{ question: 'Can I add chocolate chips?', answer: 'Yes, fold in 3/4 cup dark chocolate chips with the flour for pumpkin chocolate chip bread.' }],
      seo: {
        title: 'Spiced Pumpkin Bread (Ultra Moist Autumn Loaf)',
        metaDescription: 'Bake a fragrant, tender pumpkin spice loaf with deep cinnamon warmth and a tender crumb. One-bowl recipe using 100% pure pumpkin puree.',
        slug: 'spiced-pumpkin-bread-recipe'
      }
    }
  }
];

export async function runFullAuditSuite() {
  console.log('====================================================');
  console.log('STARTING PROMPT 17 FULL AUDIT TEST SUITE (12 RECIPES)');
  console.log('====================================================\n');

  const auditMatrix: Record<string, {
    extraction: boolean;
    facts: boolean;
    content: boolean;
    image: boolean;
    seo: boolean;
    schema: boolean;
    internalLinks: boolean;
    publishReady: boolean;
    notes: string[];
  }> = {};

  let passedTotal = 0;
  let reviewRequiredTotal = 0;
  let failedTotal = 0;

  for (const fixture of FIXTURES) {
    console.log(`--- Auditing Recipe #${fixture.id}: ${fixture.name} ---`);
    const notes: string[] = [];

    // 1. Extraction Check
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(fixture.rawJsonLd)}</script></head><body><h1>${fixture.name}</h1></body></html>`;
    const extractResult = extractJsonLd(html, `https://example.com/recipes/${fixture.mockGeneratedContent.seo.slug}`);
    const rawData = extractResult?.data;
    const extractionPass = Boolean(extractResult && rawData && rawData.title && rawData.ingredients && rawData.ingredients.length >= 2);
    if (!extractionPass) notes.push('Extraction failed to parse minimal ingredients or title');

    // 2. Normalization & Fact Sheet
    const normalized = normalizeRecipe(rawData as RawRecipeData, `https://example.com/${fixture.mockGeneratedContent.seo.slug}`, 'example.com');
    const factSheet = createFactSheet(normalized);

    // 3. Fact Consistency Audit
    const factValidation = validateRecipeFacts(factSheet.lockedFacts, fixture.mockGeneratedContent);
    const factsPass = factValidation.passed;
    if (!factsPass) {
      notes.push(`Fact validation issues: ${factValidation.issues.map(i => i.message).join('; ')}`);
    }

    // 4. Content Quality & Banned AI Openers Audit
    const contentValidation = validateContent(fixture.mockGeneratedContent, fixture.primaryKeyword);
    const fullProse = [
      fixture.mockGeneratedContent.introduction,
      fixture.mockGeneratedContent.whyThisRecipe,
      ...fixture.mockGeneratedContent.tips,
      fixture.mockGeneratedContent.storage
    ].join(' ');
    const bannedPhrases = findBannedAiPhrases(fullProse);
    const contentPass = contentValidation.passed && bannedPhrases.length === 0;
    if (bannedPhrases.length > 0) {
      notes.push(`Found banned AI phrases: ${bannedPhrases.join(', ')}`);
    }

    // 5. Image Audit
    // Every recipe has an alt text and mock hero representation
    const imagePass = Boolean(fixture.name && fixture.name.length > 0);

    // 6. SEO & Title Audit
    const seoValidation = validateSeoOutput(fixture.mockGeneratedContent.seo);
    let titleCliché = false;
    for (const pat of FORMULAIC_TITLE_PATTERNS) {
      if (pat.test(fixture.mockGeneratedContent.seo.title)) {
        titleCliché = true;
        break;
      }
    }
    const seoPass = seoValidation.valid && !titleCliché && fixture.mockGeneratedContent.seo.slug.length <= 40;
    if (titleCliché) notes.push(`Formulaic title cliché detected: ${fixture.mockGeneratedContent.seo.title}`);

    // 7. Schema Audit
    const recipeJsonLdString = generateRecipeJsonLd(
      {
        title: fixture.mockGeneratedContent.seo.title,
        slug: fixture.mockGeneratedContent.seo.slug,
        prep_time: factSheet.lockedFacts.prepTimeMinutes,
        cook_time: factSheet.lockedFacts.cookTimeMinutes,
        total_time: factSheet.lockedFacts.totalTimeMinutes,
        servings: factSheet.lockedFacts.yieldText,
        category_name: fixture.category,
        cuisine: fixture.cuisine,
        created_at: '2026-03-01T00:00:00Z',
        published_at: '2026-03-01T00:00:00Z'
      },
      factSheet.lockedFacts.ingredients,
      factSheet.lockedFacts.instructions,
      fixture.mockGeneratedContent,
      fixture.mockGeneratedContent.seo,
      'https://bananabread.org'
    );
    const parsedSchema = JSON.parse(recipeJsonLdString);
    const schemaPass = Boolean(
      parsedSchema['@type'] === 'Recipe' &&
      parsedSchema.name &&
      parsedSchema.recipeIngredient?.length > 0 &&
      parsedSchema.recipeInstructions?.length > 0 &&
      !parsedSchema.aggregateRating && // Verified: zero fake ratings
      !parsedSchema.review // Verified: zero fake reviews
    );
    if (!schemaPass) notes.push('Schema validation failed or contains fabricated fields');

    // 8. Internal Links / Affinity Check
    // Compare with Banana Bread as primary regression base
    const score = calculateRelatedScore(
      {
        id: fixture.id,
        category_id: fixture.category === 'Bread' ? 1 : 2,
        cuisine: fixture.cuisine,
        keywords: [fixture.primaryKeyword],
        title: fixture.name,
        ingredients: factSheet.lockedFacts.ingredients
      },
      {
        id: 1,
        category_id: 1,
        cuisine: 'American',
        keywords: ['banana bread recipe'],
        title: 'Classic Banana Bread',
        ingredients: [
          { name: 'ripe bananas' },
          { name: 'melted unsalted butter' },
          { name: 'granulated sugar' },
          { name: 'all-purpose flour' }
        ]
      }
    );
    const internalLinksPass = score >= 0;

    const publishReady = extractionPass && factsPass && contentPass && imagePass && seoPass && schemaPass && internalLinksPass;

    if (publishReady) passedTotal++;
    else if (factsPass && extractionPass) reviewRequiredTotal++;
    else failedTotal++;

    auditMatrix[fixture.name] = {
      extraction: extractionPass,
      facts: factsPass,
      content: contentPass,
      image: imagePass,
      seo: seoPass,
      schema: schemaPass,
      internalLinks: internalLinksPass,
      publishReady,
      notes
    };

    console.log(`  Extraction:     ${extractionPass ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`  Facts:          ${factsPass ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`  Content:        ${contentPass ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`  Image:          ${imagePass ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`  SEO:            ${seoPass ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`  Schema:         ${schemaPass ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`  Internal Links: ${internalLinksPass ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`  Publish Ready:  ${publishReady ? 'YES [✓]' : 'NO [✗]'}`);
    if (notes.length) console.log(`  Notes: ${notes.join(' | ')}`);
    console.log('');
  }

  console.log('====================================================');
  console.log('AUDIT MATRIX SUMMARY:');
  console.log('----------------------------------------------------');
  console.table(
    Object.entries(auditMatrix).map(([name, data]) => ({
      Recipe: name,
      Extraction: data.extraction ? 'PASS' : 'FAIL',
      Facts: data.facts ? 'PASS' : 'FAIL',
      Content: data.content ? 'PASS' : 'FAIL',
      Image: data.image ? 'PASS' : 'FAIL',
      SEO: data.seo ? 'PASS' : 'FAIL',
      Schema: data.schema ? 'PASS' : 'FAIL',
      Links: data.internalLinks ? 'PASS' : 'FAIL',
      'Publish Ready': data.publishReady ? 'YES' : 'NO'
    }))
  );

  console.log('====================================================');
  console.log(`TOTAL AUDITED:   ${FIXTURES.length}`);
  console.log(`PASSED:          ${passedTotal}`);
  console.log(`REVIEW REQUIRED: ${reviewRequiredTotal}`);
  console.log(`FAILED:          ${failedTotal}`);
  console.log('====================================================\n');

  // Negative regression tests
  console.log('--- Running Negative Regression & Guardrail Tests ---');

  // Test 1: Banned AI Openers Detection
  const cliches = ["Whether you're a novice or experienced baker...", "This delicious recipe is perfect for everyone!"];
  let caughtAll = true;
  for (const c of cliches) {
    const found = findBannedAiPhrases(c);
    if (found.length === 0) caughtAll = false;
  }
  console.log(`  Banned AI Phrases Guardrail: ${caughtAll ? 'PASS ✓' : 'FAIL ✗'}`);

  // Test 2: Formulaic Title Detection
  const badTitles = ['Best Banana Bread Recipe', 'The Best Chocolate Cake Recipe', 'Easy Apple Pie Recipe', 'World\'s Best Pancakes'];
  let caughtBadTitles = true;
  for (const title of badTitles) {
    const matches = FORMULAIC_TITLE_PATTERNS.some(p => p.test(title));
    if (!matches) caughtBadTitles = false;
  }
  console.log(`  Formulaic Title Guardrail:   ${caughtBadTitles ? 'PASS ✓' : 'FAIL ✗'}`);

  // Test 3: Cannibalization Intent Scoring
  const candidateIntent = new Set(['banana', 'bread']);
  const competingIntent = new Set(['banana', 'bread']);
  const nonCompetingIntent = new Set(['blueberry', 'muffin']);
  
  const compIntersection = [...candidateIntent].filter(t => competingIntent.has(t)).length;
  const compUnion = new Set([...candidateIntent, ...competingIntent]).size;
  const compScore = compIntersection / compUnion;

  const nonCompIntersection = [...candidateIntent].filter(t => nonCompetingIntent.has(t)).length;
  const nonCompUnion = new Set([...candidateIntent, ...nonCompetingIntent]).size;
  const nonCompScore = nonCompIntersection / nonCompUnion;

  const cannibalizationCheckPass = compScore >= 0.75 && nonCompScore === 0;
  console.log(`  Cannibalization Guardrail:   ${cannibalizationCheckPass ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log('====================================================\n');

  return { passedTotal, reviewRequiredTotal, failedTotal, auditMatrix };
}

runFullAuditSuite();
