/**
 * Source URL Canonicalization
 * 
 * Normalizes recipe URLs for deterministic duplicate detection and tracking parameter stripping.
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'ref',
  'source',
  '_ga',
  'ncid',
  'sr_share'
]);

export function canonicalizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';

  try {
    const parsed = new URL(rawUrl.trim());

    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();

    // Strip hash fragment (#recipe)
    parsed.hash = '';

    // Strip tracking parameters
    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((_val, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }

    // Sort remaining query parameters alphabetically for canonical consistency
    parsed.searchParams.sort();

    let clean = parsed.toString();

    // Standardize trailing slash: strip trailing slash from path (unless root path "/")
    if (parsed.pathname.length > 1 && clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }

    return clean;
  } catch {
    // If URL parsing fails, return trimmed raw string without fragment
    return rawUrl.trim().split('#')[0].replace(/\?utm_.*$/, '');
  }
}
