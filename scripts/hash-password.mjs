/**
 * Helper script to generate an ADMIN_PASSWORD_HASH for the .env file.
 *
 * Usage:
 *   node scripts/hash-password.mjs yourpassword
 *
 * Copy the output into your .env file or wrangler secret:
 *   wrangler secret put ADMIN_PASSWORD_HASH
 */

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/hash-password.mjs <password>');
  process.exit(1);
}

const ITERATIONS = 100_000;
const KEY_LENGTH = 32;

function bufferToBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8
  );

  return `pbkdf2:sha256:${ITERATIONS}:${bufferToBase64(salt)}:${bufferToBase64(hashBuffer)}`;
}

const hash = await hashPassword(password);
console.log('\nYour ADMIN_PASSWORD_HASH:');
console.log(hash);
console.log('\nAdd this to your .env file or run:');
console.log('  wrangler secret put ADMIN_PASSWORD_HASH');
