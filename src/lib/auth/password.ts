/**
 * Workers-compatible password hashing using Web Crypto API (PBKDF2).
 * Replaces bcryptjs which requires Node.js crypto module.
 *
 * Format: pbkdf2:sha256:<iterations>:<base64-salt>:<base64-hash>
 *
 * To generate a password hash for ADMIN_PASSWORD_HASH env var, run:
 *   node -e "const {hash} = await import('./src/lib/auth/password.ts'); console.log(await hash('yourpassword'))"
 * OR use the /admin/login page with the hash utility endpoint.
 */

const ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const ALGORITHM = 'SHA-256';

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: ALGORITHM,
    },
    keyMaterial,
    KEY_LENGTH * 8
  );
}

/**
 * Hash a plaintext password. Returns a storable string.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveKey(password, salt);
  return `pbkdf2:sha256:${ITERATIONS}:${bufferToBase64(salt)}:${bufferToBase64(hash)}`;
}

/**
 * Verify a plaintext password against a stored hash string.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split(':');
    if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false;
    const iterations = parseInt(parts[2], 10);
    const salt = base64ToBuffer(parts[3]);
    const expectedHash = base64ToBuffer(parts[4]);

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: ALGORITHM,
      },
      keyMaterial,
      KEY_LENGTH * 8
    );
    const derived = new Uint8Array(derivedBits);

    // Constant-time comparison
    if (derived.length !== expectedHash.length) return false;
    let diff = 0;
    for (let i = 0; i < derived.length; i++) {
      diff |= derived[i] ^ expectedHash[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}
