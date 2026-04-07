/**
 * Typography preset helpers — read active preset from cookie, build the
 * Google Fonts URL, and emit the :root CSS variable block.
 *
 * The Tailwind config (tailwind.config.js) and the prose plugin both reference
 * `var(--font-display) / var(--font-body) / var(--font-sans)`. To swap the
 * site's typography we only need to set those variables on :root — Tailwind
 * utilities and prose styles resolve them automatically. No !important needed.
 */

import type { AstroCookies } from 'astro';
import { DEFAULT_PRESET_ID, getPresetById, type TypographyPreset } from '../config/typography-presets';

export const TYPOGRAPHY_COOKIE = 'typography_preset';

export function getActivePreset(cookies: AstroCookies): TypographyPreset {
  const id = cookies.get(TYPOGRAPHY_COOKIE)?.value;
  return getPresetById(id);
}

export function buildGoogleFontsHref(preset: TypographyPreset): string | null {
  // System-font presets (e.g. Apple News using ui-serif / -apple-system) have
  // no Google Fonts dependency. BaseLayout skips the <link> entirely in that case.
  if (!preset.googleFontsQuery) return null;
  return `https://fonts.googleapis.com/css2?${preset.googleFontsQuery}&display=swap`;
}

/**
 * Emit a :root CSS variable block. Tailwind utilities (.font-serif, .font-body,
 * .font-sans) and the @tailwindcss/typography plugin resolve these variables
 * at render time, so changing them swaps fonts everywhere.
 *
 * displayLetterSpacing and displayWeight are exposed as additional variables
 * so headline elements can opt-in via CSS.
 */
export function buildRootCss(preset: TypographyPreset): string {
  const lines = [
    `--font-display: ${preset.display};`,
    `--font-body: ${preset.body};`,
    `--font-sans: ${preset.sans};`,
  ];
  if (preset.bodySizeAdjust !== undefined) lines.push(`--font-body-adjust: ${preset.bodySizeAdjust};`);
  if (preset.displaySizeAdjust !== undefined) lines.push(`--font-display-adjust: ${preset.displaySizeAdjust};`);
  if (preset.displayLetterSpacing) lines.push(`--font-display-tracking: ${preset.displayLetterSpacing};`);
  if (preset.displayWeight) lines.push(`--font-display-weight: ${preset.displayWeight};`);
  return `:root { ${lines.join(' ')} }`;
}

export { DEFAULT_PRESET_ID };
