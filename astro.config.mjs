// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// DOMAIN MIGRATION: set SITE_URL=https://aluminews.com in Vercel env vars.
// Everything downstream reads Astro.site — no other changes needed.
const SITE_URL = process.env.SITE_URL || 'https://tune-health.vercel.app';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  adapter: vercel(),
  devToolbar: {
    enabled: false,
  },
  integrations: [
    react(),
    tailwind({
      configFile: './tailwind.config.js',
    }),
    sitemap({
      // Exclude admin routes and non-content pages from sitemap
      filter: (page) => !page.includes('/admin'),
      // Per-page priority and changefreq overrides
      serialize(item) {
        // Homepage
        if (item.url === SITE_URL + '/') {
          return { ...item, changefreq: 'daily', priority: 1.0 };
        }
        // Individual articles
        if (item.url.includes('/articles/')) {
          return { ...item, changefreq: 'monthly', priority: 0.9 };
        }
        // Category / topic pages
        if (item.url.includes('/topics/')) {
          return { ...item, changefreq: 'weekly', priority: 0.8 };
        }
        // Collections
        if (item.url.includes('/collections/')) {
          return { ...item, changefreq: 'weekly', priority: 0.8 };
        }
        // Articles index, deep dives, etc.
        if (item.url.includes('/articles') || item.url.includes('/deep-dives')) {
          return { ...item, changefreq: 'daily', priority: 0.8 };
        }
        // All other pages
        return { ...item, changefreq: 'monthly', priority: 0.7 };
      },
    }),
  ],
});
