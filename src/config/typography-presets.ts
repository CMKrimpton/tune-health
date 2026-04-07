/**
 * Typography presets for site-wide font experimentation.
 *
 * Each preset defines a complete editorial type system: display headline font,
 * body text font, and UI sans font. The active preset is read from a cookie in
 * BaseLayout and applied via injected CSS overrides.
 *
 * To add a preset: add an entry below. The Google Fonts query string must
 * include every weight + style actually used by the override CSS.
 */

export type TypographyPreset = {
  id: string;
  name: string;
  vibe: string;
  /** CSS font-family stack for headlines (h1-h6, .font-serif, .prose headings) */
  display: string;
  /** CSS font-family stack for body prose (.prose p, .font-body, body) */
  body: string;
  /** CSS font-family stack for UI / nav / meta (.font-sans) */
  sans: string;
  /** Google Fonts CSS2 query (without https://fonts.googleapis.com/css2? prefix) */
  googleFontsQuery: string;
  /** Optional letter-spacing tweak for display headlines */
  displayLetterSpacing?: string;
  /** Optional font-weight override for display headlines */
  displayWeight?: string;
  /**
   * Optional x-height target for body text. Used by font-size-adjust to
   * normalize apparent size across typefaces. Default 0.514 (Inter's natural
   * ratio). Raise for fonts with very small x-heights (Cormorant ~0.41,
   * EB Garamond ~0.41) so they read at a comparable visual size.
   */
  bodySizeAdjust?: number;
  /**
   * Optional x-height target for display headlines. Default 0.49 — slightly
   * smaller than body so didone display fonts (Bodoni, Playfair) keep their
   * elegant proportions instead of looking bloated.
   */
  displaySizeAdjust?: number;
};

export const TYPOGRAPHY_PRESETS: TypographyPreset[] = [
  {
    id: 'classic',
    name: 'Playfair Classic',
    vibe: 'The current stack. High-contrast didone display with literary body. Refined, traditional editorial.',
    display: "'Playfair Display', Georgia, 'Times New Roman', serif",
    body: "'Crimson Pro', Georgia, serif",
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    googleFontsQuery:
      'family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Crimson+Pro:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700',
    // Crimson Pro x-height ~0.448 — scale up to match Inter reference
    bodySizeAdjust: 0.514,
    // Playfair Display x-height ~0.46 — keep didone elegance, slight bump
    displaySizeAdjust: 0.49,
  },
  {
    id: 'editorial-modern',
    name: 'Editorial Modern',
    vibe: 'Fraunces with its quirky "soft" optical axis. Variable, distinctive, used by The Markup. Pairs with Adobe\'s quietly excellent Source Serif body.',
    display: "'Fraunces', Georgia, serif",
    body: "'Source Serif 4', Georgia, serif",
    sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    googleFontsQuery:
      'family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Inter:wght@400;500;600;700',
    displayLetterSpacing: '-0.02em',
    // Source Serif 4 x-height ~0.484, Fraunces ~0.50 — both close to ideal
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'medium',
    name: 'Medium',
    vibe: 'Newsreader is Production Type\'s editorial workhorse — the closest free match to Medium\'s Charter+Noe pairing. Single-family system for cohesion.',
    display: "'Newsreader', Georgia, serif",
    body: "'Newsreader', Georgia, serif",
    sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    googleFontsQuery:
      'family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400&family=Inter:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Newsreader x-height ~0.51 — naturally well-balanced, light tuning
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.51,
  },
  {
    id: 'vogue',
    name: 'Vogue Couture',
    vibe: 'Bodoni Moda — fashion magazine didone with hairline serifs and dramatic contrast. Lora softens the body. Pure Vogue/Bazaar energy.',
    display: "'Bodoni Moda', 'Didot', Georgia, serif",
    body: "'Lora', Georgia, serif",
    sans: "'Work Sans', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,600;0,6..96,700;1,6..96,400&family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Work+Sans:wght@400;500;600;700',
    displayLetterSpacing: '-0.02em',
    // Lora x-height ~0.51 — already comfortable. Bodoni Moda ~0.46, kept
    // small to preserve fashion-magazine elegance.
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.485,
  },
  {
    id: 'bloomberg',
    name: 'Bloomberg',
    vibe: 'DM Serif Display is a bold high-contrast didone. IBM Plex Serif body + Plex Sans UI. Data-dense, authoritative, finance-grade.',
    display: "'DM Serif Display', Georgia, serif",
    body: "'IBM Plex Serif', Georgia, serif",
    sans: "'IBM Plex Sans', -apple-system, sans-serif",
    googleFontsQuery:
      'family=DM+Serif+Display:ital@0;1&family=IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Sans:wght@400;500;600;700',
    displayLetterSpacing: '-0.01em',
    // IBM Plex Serif x-height ~0.516 — naturally well-calibrated.
    // DM Serif Display ~0.49 — modern didone, slight bump.
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.495,
  },
  {
    id: 'cormorant',
    name: 'Cormorant Refined',
    vibe: 'Cormorant Garamond — Renaissance old-style elegance. EB Garamond body. Scholarly, refined, restrained.',
    display: "'Cormorant Garamond', Georgia, serif",
    body: "'EB Garamond', Georgia, serif",
    sans: "'Inter', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700',
    displayWeight: '600',
    // EB Garamond x-height ~0.41, Cormorant ~0.41 — both VERY small.
    // These need aggressive scale-up or they'll look like 12pt at 18pt size.
    bodySizeAdjust: 0.52,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'plex',
    name: 'Plex System',
    vibe: 'Single-family system. IBM Plex Serif throughout, Plex Sans for UI. Coherent, technical, contemporary. Built for screens.',
    display: "'IBM Plex Serif', Georgia, serif",
    body: "'IBM Plex Serif', Georgia, serif",
    sans: "'IBM Plex Sans', -apple-system, sans-serif",
    googleFontsQuery:
      'family=IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=IBM+Plex+Sans:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    displayWeight: '600',
    // IBM Plex Serif x-height ~0.516 — naturally well-calibrated, no change
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.514,
  },
  {
    id: 'spectral',
    name: 'Spectral Atlantic',
    vibe: 'Spectral by Production Type — screen-optimized serif with warm literary feel. Pairs with itself. The Atlantic\'s vibe.',
    display: "'Spectral', Georgia, serif",
    body: "'Spectral', Georgia, serif",
    sans: "'Inter', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Inter:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Spectral x-height ~0.50 — close to ideal
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'wired',
    name: 'Wired Modern',
    vibe: 'Space Grotesk sans display — Wired/Rest of World energy. Source Serif body grounds it. Geometric, contemporary, confident.',
    display: "'Space Grotesk', -apple-system, sans-serif",
    body: "'Source Serif 4', Georgia, serif",
    sans: "'Space Grotesk', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Space+Grotesk:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400',
    displayLetterSpacing: '-0.03em',
    displayWeight: '600',
    // Source Serif 4 x-height ~0.484, Space Grotesk ~0.52
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.514,
  },
  {
    id: 'substack',
    name: 'Substack Studio',
    vibe: 'Newsreader display + Lora body + Manrope UI. Modern editorial DNA — what Substack would pick if it had taste.',
    display: "'Newsreader', Georgia, serif",
    body: "'Lora', Georgia, serif",
    sans: "'Manrope', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400&family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Manrope:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Lora x-height ~0.51, Newsreader ~0.51 — both well-calibrated
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.51,
  },
];

export const DEFAULT_PRESET_ID = 'classic';

export function getPresetById(id: string | undefined | null): TypographyPreset {
  if (!id) return TYPOGRAPHY_PRESETS[0];
  return TYPOGRAPHY_PRESETS.find((p) => p.id === id) || TYPOGRAPHY_PRESETS[0];
}
