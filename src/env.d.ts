/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  RECIPE_IMAGES: R2Bucket;
  DEEPSEEK_API_KEY: string;
  RUNWARE_API_KEY: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD_HASH: string;
  JWT_SECRET: string;
  R2_PUBLIC_URL: string;
  SITE_URL: string;
}

declare namespace App {
  interface Locals {
    runtime: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}
