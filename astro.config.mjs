import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  image: {
    // Sharp is not compatible with Cloudflare Workers; use passthrough
    service: { entrypoint: 'astro/assets/services/noop' },
  },
  vite: {
    ssr: {
      // These packages need to be bundled (not treated as external) for Cloudflare Workers
      noExternal: ['cheerio', 'zod'],
    },
  },
});
