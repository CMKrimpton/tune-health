// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://tune-health.vercel.app',
  adapter: vercel(),
  devToolbar: {
    enabled: false,
  },
  integrations: [
    react(),
    tailwind({
      configFile: './tailwind.config.js',
    }),
    sitemap(),
  ],
});
