import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const env = context.locals.runtime?.env;
  const start = Date.now();

  let dbOk = false;
  let dbLatencyMs = 0;
  let dbError: string | undefined;

  // 1. Check D1 Database
  if (env?.DB) {
    try {
      const t0 = Date.now();
      const res = await env.DB.prepare('SELECT 1 as healthy').first<{ healthy: number }>();
      dbLatencyMs = Date.now() - t0;
      dbOk = res?.healthy === 1;
    } catch (err: any) {
      dbError = 'Database query failed';
    }
  } else {
    dbError = 'D1 binding missing';
  }

  // 2. Check Storage (R2)
  const r2Ok = Boolean(env?.RECIPE_IMAGES);

  // 3. Check AI Service Configuration (Presence only, never values)
  const deepseekConfigured = Boolean(env?.DEEPSEEK_API_KEY && env.DEEPSEEK_API_KEY.length > 5);
  const runwareConfigured = Boolean(env?.RUNWARE_API_KEY && env.RUNWARE_API_KEY.length > 5);
  const authConfigured = Boolean(env?.ADMIN_USERNAME && env?.ADMIN_PASSWORD_HASH && env?.JWT_SECRET);

  // Determine overall health status
  let status: 'ok' | 'degraded' | 'unhealthy' = 'ok';
  if (!dbOk) {
    status = 'unhealthy';
  } else if (!r2Ok || !deepseekConfigured || !authConfigured) {
    status = 'degraded';
  }

  const httpStatus = status === 'unhealthy' ? 503 : 200;

  return new Response(
    JSON.stringify({
      status,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - start,
      services: {
        database: {
          status: dbOk ? 'ok' : 'unhealthy',
          latencyMs: dbLatencyMs,
          error: dbError
        },
        storage: {
          status: r2Ok ? 'ok' : 'degraded',
          provider: 'Cloudflare R2'
        },
        ai_deepseek: {
          status: deepseekConfigured ? 'configured' : 'missing'
        },
        ai_runware: {
          status: runwareConfigured ? 'configured' : 'optional_missing'
        },
        auth: {
          status: authConfigured ? 'configured' : 'degraded'
        }
      }
    }),
    {
      status: httpStatus,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    }
  );
};
