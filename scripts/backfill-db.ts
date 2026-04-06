/**
 * Backfill script: reads JSON metadata files from src/content/articles/
 * and updates the Supabase articles table with author, series, and article_html data.
 *
 * Run: npx tsx scripts/backfill-db.ts
 *
 * Prerequisites:
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 * - Migration 20260409_ssr_article_columns.sql applied
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { readFileSync as readEnvFile } from 'fs';

// Load .env manually (no dotenv dependency needed)
try {
  const envContent = readEnvFile('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const supabaseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL/PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const CONTENT_DIR = join(process.cwd(), 'src/content/articles');
const PAGES_DIR = join(process.cwd(), 'src/pages/articles');

async function main() {
  const jsonFiles = readdirSync(CONTENT_DIR).filter(f => f.endsWith('.json'));
  console.log(`Found ${jsonFiles.length} JSON metadata files`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of jsonFiles) {
    const slug = file.replace('.json', '');
    try {
      const json = JSON.parse(readFileSync(join(CONTENT_DIR, file), 'utf-8'));

      const updates: Record<string, unknown> = {};

      // Author
      if (json.author?.name) updates.author_name = json.author.name;
      if (json.author?.role) updates.author_role = json.author.role;

      // Series
      if (json.series) updates.series = json.series;
      if (json.seriesOrder != null) updates.series_order = json.seriesOrder;

      // Also backfill article_html from .astro files if the DB column is empty
      const astroPath = join(PAGES_DIR, `${slug}.astro`);
      if (existsSync(astroPath)) {
        const astroContent = readFileSync(astroPath, 'utf-8');
        // Extract article HTML from between <div class="article-content"> and its closing tag
        const contentMatch = astroContent.match(/<div class="article-content">([\s\S]*?)<\/div>\s*\n\s*(?:<!-- Tags|<Fragment)/);
        if (contentMatch) {
          updates.article_html_backfill = contentMatch[1].trim();
        }
      }

      // Also ensure metadata fields are in sync
      if (json.gradient) {
        updates.gradient_from = json.gradient.from;
        updates.gradient_to = json.gradient.to;
      }
      if (json.heroImage) updates.hero_image = json.heroImage;
      if (json.heroImageLight) updates.hero_image_light = json.heroImageLight;
      if (json.heroImageAlt) updates.hero_image_alt = json.heroImageAlt;
      if (json.narrationUrl) updates.narration_url = json.narrationUrl;
      if (json.sortOrder) updates.sort_order = json.sortOrder;
      if (json.keywords) updates.keywords = json.keywords;

      // Separate article_html update — only if DB is empty
      const htmlBackfill = updates.article_html_backfill as string | undefined;
      delete updates.article_html_backfill;

      if (Object.keys(updates).length === 0 && !htmlBackfill) {
        skipped++;
        continue;
      }

      // Check if article exists in DB
      const { data: existing } = await supabase
        .from('articles')
        .select('slug, article_html')
        .eq('slug', slug)
        .maybeSingle();

      if (!existing) {
        console.log(`  SKIP ${slug} — not in DB`);
        skipped++;
        continue;
      }

      // Only backfill article_html if currently empty
      if (htmlBackfill && (!existing.article_html || existing.article_html.trim() === '')) {
        updates.article_html = htmlBackfill;
      }

      const { error } = await supabase
        .from('articles')
        .update(updates)
        .eq('slug', slug);

      if (error) {
        console.error(`  ERROR ${slug}: ${error.message}`);
        errors++;
      } else {
        updated++;
        if (updated % 20 === 0) console.log(`  ... ${updated} updated`);
      }
    } catch (err) {
      console.error(`  ERROR ${slug}: ${err instanceof Error ? err.message : err}`);
      errors++;
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${errors} errors`);
}

main();
