import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const faqItem = z.object({
  question: z.string(),
  answer: z.string(),
});

const howToStep = z.object({
  name: z.string(),
  text: z.string(),
});

const articleSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string().optional(),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  author: z.string().default("Banded"),
  keywords: z.array(z.string()).default([]),
  ogImage: z.string().optional(),
  ogTitle: z.string().optional(),
  ogSubtitle: z.string().optional(),
  faqs: z.array(faqItem).optional(),
  howTo: z.boolean().default(false),
  howToSteps: z.array(howToStep).optional(),
  readMinutes: z.number().optional(),
  draft: z.boolean().default(false),
});

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: articleSchema,
});

const help = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/help" }),
  schema: articleSchema,
});

export const collections = { blog, help };
