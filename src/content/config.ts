import { defineCollection, z } from 'astro:content';

const articles = defineCollection({
  type: 'data',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    publishDate: z.string(),
    updatedDate: z.string().optional(),
    author: z.object({
      name: z.string(),
      role: z.string(),
      avatar: z.string().optional(),
    }),
    readTime: z.number(), // in minutes
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    tags: z.array(z.string()),
    ogImage: z.string().optional(),
    gradient: z.object({
      from: z.string(),
      to: z.string(),
    }),
    // For the command palette and search
    keywords: z.array(z.string()).optional(),
  }),
});

export const collections = { articles };
