// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  devToolbar: {
    enabled: false,
  },
  integrations: [
    react(),
    tailwind({
      configFile: './tailwind.config.js',
    }),
  ],
  vite: {
    ssr: {
      noExternal: ['gsap'],
    },
  },
});
