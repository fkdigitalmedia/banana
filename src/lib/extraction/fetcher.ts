export type FetchResult = {
  html: string;
  finalUrl: string;
  domain: string;
  contentType: string;
  byteSize: number;
};

export type UrlValidationResult = { valid: true } | { valid: false; reason: string };

export class ExtractionError extends Error {
  constructor(
    public readonly code: 'INVALID_URL' | 'SSRF_BLOCKED' | 'FETCH_FAILED' | 'TIMEOUT' | 'TOO_LARGE' | 'NOT_HTML' | 'HTTP_ERROR' | 'NO_RECIPE',
    message: string
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/**
 * Checks whether an IPv4 address string falls into private, loopback, link-local, or cloud metadata ranges.
 */
function isRestrictedIpv4(ip: string): { restricted: boolean; reason?: string } {
  const parts = ip.split('.');
  if (parts.length !== 4) return { restricted: false };

  const [o1, o2] = parts.map(p => parseInt(p, 10));
  if (isNaN(o1) || isNaN(o2)) return { restricted: false };

  // Loopback (127.0.0.0/8)
  if (o1 === 127) {
    return { restricted: true, reason: 'Loopback IP addresses (127.0.0.0/8) are not allowed.' };
  }

  // Current network / Zero (0.0.0.0/8)
  if (o1 === 0) {
    return { restricted: true, reason: 'Current network IP addresses (0.0.0.0/8) are not allowed.' };
  }

  // Private RFC 1918 Class A (10.0.0.0/8)
  if (o1 === 10) {
    return { restricted: true, reason: 'Private IP addresses (10.0.0.0/8) are not allowed.' };
  }

  // Private RFC 1918 Class B (172.16.0.0/12)
  if (o1 === 172 && o2 >= 16 && o2 <= 31) {
    return { restricted: true, reason: 'Private IP addresses (172.16.0.0/12) are not allowed.' };
  }

  // Private RFC 1918 Class C (192.168.0.0/16)
  if (o1 === 192 && o2 === 168) {
    return { restricted: true, reason: 'Private IP addresses (192.168.0.0/16) are not allowed.' };
  }

  // Link-Local & Cloud Metadata (169.254.0.0/16, e.g. AWS/GCP 169.254.169.254)
  if (o1 === 169 && o2 === 254) {
    return { restricted: true, reason: 'Link-local and cloud metadata addresses (169.254.0.0/16) are strictly blocked.' };
  }

  // Carrier Grade NAT (100.64.0.0/10)
  if (o1 === 100 && o2 >= 64 && o2 <= 127) {
    return { restricted: true, reason: 'Shared address space (100.64.0.0/10) is not allowed.' };
  }

  // Multicast (224.0.0.0/4) & Reserved (240.0.0.0/4)
  if (o1 >= 224) {
    return { restricted: true, reason: 'Multicast and reserved addresses are not allowed.' };
  }

  return { restricted: false };
}

export function validateUrl(url: string): UrlValidationResult {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Only HTTP and HTTPS URLs are allowed.' };
    }
    
    // Extract hostname and strip IPv6 bracket notation if present
    const hostname = parsed.hostname.toLowerCase();
    const cleanHost = hostname.replace(/^\[|\]$/g, '');
    
    // Check forbidden hostnames
    if (cleanHost === 'localhost' || cleanHost === '0.0.0.0' || cleanHost === '::1' || cleanHost === '::') {
      return { valid: false, reason: 'Localhost and loopback URLs are not allowed.' };
    }

    // Cloud metadata hostname shortcuts
    if (cleanHost === 'metadata.google.internal' || cleanHost === 'metadata') {
      return { valid: false, reason: 'Cloud metadata hostnames are strictly blocked.' };
    }
    
    // Check direct IPv4 addresses
    const ipv4Check = isRestrictedIpv4(cleanHost);
    if (ipv4Check.restricted) {
      return { valid: false, reason: ipv4Check.reason! };
    }

    // Check IPv6 addresses
    if (cleanHost.includes(':')) {
      // IPv6 Loopback
      if (cleanHost === '::1' || cleanHost.replace(/^0+|:+/g, '') === '1') {
        return { valid: false, reason: 'IPv6 loopback is not allowed.' };
      }
      // IPv6 Link-Local (fe80::/10)
      if (cleanHost.startsWith('fe80:')) {
        return { valid: false, reason: 'IPv6 link-local addresses are not allowed.' };
      }
      // IPv6 Unique Local Address (fc00::/7, fc00: or fd00:)
      if (cleanHost.startsWith('fc') || cleanHost.startsWith('fd')) {
        return { valid: false, reason: 'IPv6 unique local addresses (fc00::/7) are not allowed.' };
      }
      // IPv4-mapped IPv6 (::ffff:...)
      if (cleanHost.startsWith('::ffff:') || cleanHost.includes(':ffff:')) {
        return { valid: false, reason: 'IPv4-mapped IPv6 addresses are strictly blocked.' };
      }
    }
    
    // Single-label hostnames without dot (e.g. 'http://internal', 'http://metadata')
    if (!cleanHost.includes('.') && !cleanHost.includes(':')) {
      return { valid: false, reason: 'Single-label hostnames are not allowed.' };
    }
    
    // Forbidden private / internal TLDs
    const tlds = ['.local', '.internal', '.lan', '.corp', '.home', '.test', '.example', '.invalid', '.onion'];
    if (tlds.some(tld => cleanHost.endsWith(tld))) {
      return { valid: false, reason: 'Local and internal domains are not allowed.' };
    }
    
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }
}

export async function fetchSource(url: string): Promise<FetchResult> {
  const validation = validateUrl(url);
  if (!validation.valid) {
    if (validation.reason.includes('allowed') || validation.reason.includes('blocked')) {
      throw new ExtractionError('SSRF_BLOCKED', validation.reason);
    }
    throw new ExtractionError('INVALID_URL', validation.reason);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new ExtractionError('HTTP_ERROR', `The page returned an error status: ${response.status}`);
    }

    // SSRF post-redirect safety: ensure final destination was not redirected to a restricted host
    if (response.url && response.url !== url) {
      const redirectCheck = validateUrl(response.url);
      if (!redirectCheck.valid) {
        throw new ExtractionError('SSRF_BLOCKED', `Redirect destination blocked: ${redirectCheck.reason}`);
      }
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('text/html')) {
      throw new ExtractionError('NOT_HTML', 'The URL does not point to a web page.');
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ExtractionError('FETCH_FAILED', 'Could not read response body.');
    }

    const MAX_BYTES = 2 * 1024 * 1024; // 2MB
    let byteSize = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        byteSize += value.length;
        if (byteSize > MAX_BYTES) {
          throw new ExtractionError('TOO_LARGE', 'The page is too large to process.');
        }
        chunks.push(value);
      }
    }

    const totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const html = new TextDecoder().decode(combined);
    const parsed = new URL(response.url);

    return {
      html,
      finalUrl: response.url,
      domain: parsed.hostname,
      contentType,
      byteSize
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new ExtractionError('TIMEOUT', 'The page took too long to load. Please try again.');
    }
    if (error instanceof ExtractionError) {
      throw error;
    }
    throw new ExtractionError('FETCH_FAILED', 'Could not reach the recipe page. Please check the URL and try again.');
  } finally {
    clearTimeout(timeoutId);
  }
}
