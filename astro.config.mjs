// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';
// DOMAIN MIGRATION: set SITE_URL=https://aluminews.com in Vercel env vars.
// Everything downstream reads Astro.site — no other changes needed.
const SITE_URL = process.env.SITE_URL || 'https://tune-health.vercel.app';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  output: 'server',
  adapter: vercel(),
  devToolbar: {
    enabled: false,
  },
  integrations: [
    react(),
    tailwind({
      configFile: './tailwind.config.js',
    }),
    // Sitemap is now a custom SSR endpoint at /sitemap.xml
    // (the @astrojs/sitemap integration can't discover dynamic SSR routes)
  ],
});
