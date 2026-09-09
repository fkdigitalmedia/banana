import { jwtVerify } from 'jose';
import { defineMiddleware } from 'astro:middleware';
import { logger } from './lib/utils/logger';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // 1. Protect all /admin/* routes except login
  const isAdminRoute = path.startsWith('/admin') && path !== '/admin/login';

  // 2. Protect all internal admin APIs (bulk, pipeline, publish, etc.)
  const isProtectedApi = 
    path.startsWith('/api/bulk/') ||
    path.startsWith('/api/pipeline/') ||
    path.startsWith('/api/recipes/') ||
    path.startsWith('/api/quality/') ||
    path.startsWith('/api/generate/') ||
    path.startsWith('/api/editorial/') ||
    path.startsWith('/api/admin/') ||
    path === '/api/import' ||
    path === '/api/publish' ||
    path === '/api/unpublish' ||
    path === '/api/validate';

  if (isAdminRoute || isProtectedApi) {
    const token = context.cookies.get('admin_token')?.value;

    if (!token) {
      if (isProtectedApi) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized. Admin authentication required.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return context.redirect('/admin/login');
    }

    const jwtSecret = context.locals.runtime?.env?.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('[Security] JWT_SECRET is not configured on server runtime!');
      if (isProtectedApi) {
        return new Response(JSON.stringify({ success: false, error: 'Authentication configuration error.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return context.redirect('/admin/login');
    }

    try {
      const secret = new TextEncoder().encode(jwtSecret);
      await jwtVerify(token, secret);
    } catch (err) {
      if (isProtectedApi) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized. Invalid or expired token.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return context.redirect('/admin/login');
    }
  }

  // Execute request
  const response = await next();

  // Attach standard security headers to outgoing responses
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return response;
});
