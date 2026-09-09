import type { APIRoute } from 'astro';
import { SignJWT } from 'jose';
import { verifyPassword } from '../../../lib/auth/password';
import { checkRateLimit, getClientIp } from '../../../lib/utils/rate-limiter';
import { logger } from '../../../lib/utils/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const ip = getClientIp(context.request);
  const rateLimit = checkRateLimit(`login:${ip}`, 5, 60 * 1000); // 5 attempts per minute

  if (!rateLimit.allowed) {
    logger.warn(`Login rate limit exceeded for IP: ${ip}`);
    return new Response(JSON.stringify({ 
      error: `Too many login attempts. Please try again in ${rateLimit.resetSeconds} seconds.` 
    }), { 
      status: 429, 
      headers: { 
        'Content-Type': 'application/json',
        'Retry-After': String(rateLimit.resetSeconds)
      } 
    });
  }

  try {
    const body = await context.request.json().catch(() => null);
    const { username, password } = body || {};

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Missing credentials' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;

    // Check username first
    if (username !== env.ADMIN_USERNAME) {
      logger.warn(`Failed login attempt for username: ${username} from ${ip}`);
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const isValid = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
    if (!isValid) {
      logger.warn(`Failed login attempt (bad password) for username: ${username} from ${ip}`);
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const token = await new SignJWT({ user: username })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    context.cookies.set('admin_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/'
    });

    logger.info(`Successful login for user: ${username} from ${ip}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    logger.error('[Login] Error during authentication:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
