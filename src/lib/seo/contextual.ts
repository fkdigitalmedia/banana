/**
 * Contextual Internal Linking Engine
 * 
 * Automatically detects natural editorial references to other published recipes
 * and inserts clean, accessible internal links with strict limits and anti-spam guardrails.
 */

export interface ContextualCandidate {
  id: number;
  title: string;
  slug: string;
}

export interface ContextualLinkResult {
  content: string;
  linkedCount: number;
  links: { targetId: number; title: string; slug: string; anchorText: string }[];
}

// Single generic words or generic food terms that must NEVER be linked alone
export const DISALLOWED_ANCHOR_WORDS = new Set([
  'banana', 'bread', 'muffin', 'muffins', 'cake', 'cakes', 'cookie', 'cookies',
  'recipe', 'recipes', 'flour', 'sugar', 'butter', 'chocolate', 'bake', 'baking',
  'dough', 'oven', 'pan', 'loaf', 'treat', 'dessert', 'snack', 'breakfast'
]);

/**
 * Derives safe, distinctive anchor phrases from a recipe title.
 * Rejects single-word titles or phrases in the disallowed set.
 */
export function getSafeAnchorPhrases(title: string): string[] {
  if (!title) return [];
  const cleaned = title
    .replace(/[^\w\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter(Boolean);
  // Strictly require at least 2 words
  if (words.length < 2) return [];

  const phrases: string[] = [];

  // Full cleaned title
  phrases.push(cleaned);

  // If title has prefix like "Easy Chocolate Banana Bread", also extract "Chocolate Banana Bread"
  const leadingAdjectives = new Set(['easy', 'best', 'classic', 'simple', 'homemade', 'quick', 'ultimate', 'healthy', 'moist']);
  if (words.length >= 3 && leadingAdjectives.has(words[0].toLowerCase())) {
    phrases.push(words.slice(1).join(' '));
  }

  // Filter out any phrases that are too short or in disallowed set
  return phrases.filter(p => {
    const pWords = p.split(' ');
    if (pWords.length < 2) return false;
    if (p.length < 8) return false;
    if (DISALLOWED_ANCHOR_WORDS.has(p.toLowerCase())) return false;
    return true;
  });
}

/**
 * Injects contextual internal links into text/HTML.
 * Strictly limited to 2-3 links per article and excludes self-links.
 */
export function injectContextualLinks(
  content: string,
  currentRecipeId: number,
  candidates: ContextualCandidate[],
  maxLinks: number = 2
): ContextualLinkResult {
  if (!content || !candidates || candidates.length === 0 || maxLinks <= 0) {
    return { content, linkedCount: 0, links: [] };
  }

  const boundedMax = Math.min(3, Math.max(1, maxLinks));
  const activeCandidates = candidates.filter(c => c.id !== currentRecipeId);

  // Build list of all candidate phrases mapped to the candidate
  interface PhraseTarget {
    candidate: ContextualCandidate;
    phrase: string;
  }
  const phraseTargets: PhraseTarget[] = [];
  for (const cand of activeCandidates) {
    const phrases = getSafeAnchorPhrases(cand.title);
    for (const phrase of phrases) {
      phraseTargets.push({ candidate: cand, phrase });
    }
  }

  // Sort phrases by length DESC so more specific multi-word phrases match first
  phraseTargets.sort((a, b) => b.phrase.length - a.phrase.length);

  let updatedContent = content;
  let linkedCount = 0;
  const linkedTargetIds = new Set<number>();
  const injectedLinks: { targetId: number; title: string; slug: string; anchorText: string }[] = [];

  // Match only outside existing tags (especially outside <a>, <h1-6>, <script>, <style>)
  for (const { candidate, phrase } of phraseTargets) {
    if (linkedCount >= boundedMax) break;
    if (linkedTargetIds.has(candidate.id)) continue;

    // Word-boundary case-insensitive regex
    // Escaping regex characters
    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b(${escapedPhrase})\\b`, 'i');

    // Split content by HTML tags to inspect only text nodes
    // e.g. <a ...> ... </a> or general tags
    const tagRegex = /(<\/?[a-zA-Z][^>]*>)/g;
    const tokens = updatedContent.split(tagRegex);

    let inAnchor = false;
    let inHeading = false;
    let replaced = false;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;

      if (token.startsWith('<')) {
        // Tag token
        const lower = token.toLowerCase();
        if (lower.startsWith('<a ') || lower === '<a>') inAnchor = true;
        else if (lower === '</a>') inAnchor = false;
        else if (/^<h[1-6]/i.test(lower)) inHeading = true;
        else if (/^<\/h[1-6]>/i.test(lower)) inHeading = false;
        continue;
      }

      // Text token
      if (!inAnchor && !inHeading && regex.test(token)) {
        const match = token.match(regex);
        if (match) {
          const matchedText = match[1];
          const targetUrl = `/${candidate.slug}/`;
          const anchorTag = `<a href="${targetUrl}" class="editorial-internal-link" title="Recipe: ${escapeHtml(candidate.title)}">${matchedText}</a>`;
          
          tokens[i] = token.replace(regex, anchorTag);
          replaced = true;
          linkedCount++;
          linkedTargetIds.add(candidate.id);
          injectedLinks.push({
            targetId: candidate.id,
            title: candidate.title,
            slug: candidate.slug,
            anchorText: matchedText
          });
          break;
        }
      }
    }

    if (replaced) {
      updatedContent = tokens.join('');
    }
  }

  return {
    content: updatedContent,
    linkedCount,
    links: injectedLinks
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
