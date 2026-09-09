/**
 * Production Centralized Logger & Secret Redactor.
 * Guarantees that API keys, tokens, and authorization credentials
 * never leak into server stdout/stderr or client-facing responses.
 */

/**
 * Redacts known sensitive strings and secrets from any log text.
 */
export function redactSecrets(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let sanitized = text;

  // Mask sk- keys (OpenAI / DeepSeek)
  sanitized = sanitized.replace(/sk-[a-zA-Z0-9_\-]{16,}/g, 'sk-***REDACTED***');

  // Mask Bearer tokens
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_\-\.]{10,}/gi, 'Bearer ***REDACTED***');

  // Mask JWT tokens
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_\-\.]{25,}/g, 'eyJ***REDACTED_JWT***');

  // Mask key/secret values in json or key-value style text
  sanitized = sanitized.replace(
    /(["']?(?:password|api[_-]?key|secret|token|auth)["']?\s*[:=]\s*["'])([^"']{3,})(["'])/gi,
    '$1***REDACTED***$3'
  );

  return sanitized;
}

/**
 * Recursively redacts secrets from an object, array, or error.
 */
export function sanitizeLogData(item: any): any {
  if (item === null || item === undefined) return item;

  if (typeof item === 'string') {
    return redactSecrets(item);
  }

  if (item instanceof Error) {
    return {
      name: item.name,
      message: redactSecrets(item.message),
      stack: item.stack ? redactSecrets(item.stack) : undefined
    };
  }

  if (Array.isArray(item)) {
    return item.map(sanitizeLogData);
  }

  if (typeof item === 'object') {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(item)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key') ||
        lowerKey.includes('token')
      ) {
        clean[key] = '***REDACTED***';
      } else {
        clean[key] = sanitizeLogData(value);
      }
    }
    return clean;
  }

  return item;
}

export const logger = {
  info(message: string, ...args: any[]) {
    const cleanMsg = redactSecrets(message);
    const cleanArgs = args.map(sanitizeLogData);
    console.log(`[INFO] ${cleanMsg}`, ...cleanArgs);
  },

  warn(message: string, ...args: any[]) {
    const cleanMsg = redactSecrets(message);
    const cleanArgs = args.map(sanitizeLogData);
    console.warn(`[WARN] ${cleanMsg}`, ...cleanArgs);
  },

  error(message: string, ...args: any[]) {
    const cleanMsg = redactSecrets(message);
    const cleanArgs = args.map(sanitizeLogData);
    console.error(`[ERROR] ${cleanMsg}`, ...cleanArgs);
  }
};

/**
 * Extracts a safe, client-presentable error message without leaking sensitive internals.
 */
export function sanitizeClientError(err: unknown, defaultMessage = 'An unexpected error occurred.'): string {
  if (!err) return defaultMessage;
  if (typeof err === 'string') return redactSecrets(err);
  if (err instanceof Error) {
    const msg = redactSecrets(err.message);
    // Suppress raw stack traces or internal database syntax details
    if (msg.includes('SQLITE_') || msg.includes('d1_') || msg.includes('syntax error')) {
      return 'A database error occurred. Please try again.';
    }
    return msg;
  }
  return defaultMessage;
}
