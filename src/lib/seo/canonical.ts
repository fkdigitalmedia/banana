/**
 * Canonical URL Generator and Normalization System.
 * Enforces consistent trailing-slash convention across all canonicals, sitemaps, and breadcrumbs.
 */

export function normalizePath(path: string): string {
  if (!path || path === '/' || path === '') return '/';
  
  // Remove leading slashes and trailing slashes, strip query params & hashes
  const clean = path.split('?')[0].split('#')[0].replace(/^\/+|\/+$/g, '');
  if (!clean) return '/';
  
  // Return normalized lowercase path with trailing slash
  return `/${clean.toLowerCase()}/`;
}

export function getCanonicalUrl(path: string, siteUrl: string): string {
  const cleanBase = siteUrl.replace(/\/+$/, '');
  const cleanPath = normalizePath(path);
  if (cleanPath === '/') return `${cleanBase}/`;
  return `${cleanBase}${cleanPath}`;
}

export function isValidCanonical(url: string, siteUrl: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    const parsedSite = new URL(siteUrl);
    
    // Check hostname match
    if (parsed.hostname !== parsedSite.hostname) return false;
    
    // Check trailing slash
    if (!parsed.pathname.endsWith('/')) return false;
    
    // Check no query params or hash in canonical
    if (parsed.search || parsed.hash) return false;
    
    return true;
  } catch {
    return false;
  }
}
