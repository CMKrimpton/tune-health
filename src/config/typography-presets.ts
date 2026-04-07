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
  {
    id: 'caslon',
    name: 'Caslon Letterpress',
    vibe: 'Libre Caslon — the original "if in doubt, use Caslon" face. American letterpress tradition. Pairs with Libre Franklin for a 1900s newspaper feel.',
    display: "'Libre Caslon Display', Georgia, serif",
    body: "'Libre Caslon Text', Georgia, serif",
    sans: "'Libre Franklin', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Libre+Caslon+Display&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=Libre+Franklin:wght@400;500;600;700',
    displayLetterSpacing: '-0.01em',
    // Caslon x-heights ~0.43 — needs scale-up
    bodySizeAdjust: 0.52,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'baskerville',
    name: 'Baskerville Penguin',
    vibe: 'Libre Baskerville — the canonical Penguin Books transitional serif. Bookish, refined, warm. The face you grew up reading.',
    display: "'Libre Baskerville', Georgia, serif",
    body: "'Libre Baskerville', Georgia, serif",
    sans: "'Libre Franklin', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Libre+Franklin:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Libre Baskerville has a tall x-height (~0.53) for a Baskerville
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.514,
  },
  {
    id: 'roboto-editorial',
    name: 'Roboto Editorial',
    vibe: 'Google\'s full Roboto family — Roboto Serif (variable, screen-tuned) paired with Roboto Sans. Engineering aesthetic. Single coherent voice.',
    display: "'Roboto Serif', Georgia, serif",
    body: "'Roboto Serif', Georgia, serif",
    sans: "'Roboto', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Roboto+Serif:ital,opsz,wght@0,8..144,400;0,8..144,500;0,8..144,600;0,8..144,700;1,8..144,400&family=Roboto:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Roboto Serif x-height ~0.51 — well-calibrated for screens
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.51,
  },
  {
    id: 'merriweather',
    name: 'Merriweather Journal',
    vibe: 'Eben Sopwith\'s screen-optimized serif. Warm, broad, very readable. The chosen face of ProPublica and The Conversation.',
    display: "'Merriweather', Georgia, serif",
    body: "'Merriweather', Georgia, serif",
    sans: "'Source Sans 3', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Merriweather:ital,wght@0,400;0,700;0,900;1,400&family=Source+Sans+3:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Merriweather is famously high x-height (~0.52) — designed for screens
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.514,
  },
  {
    id: 'literata',
    name: 'Literata Library',
    vibe: 'Google Books\' purpose-built literary serif. Variable, designed for long-form reading on screens. Bookish without being precious.',
    display: "'Literata', Georgia, serif",
    body: "'Literata', Georgia, serif",
    sans: "'Inter', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;0,7..72,600;0,7..72,700;1,7..72,400&family=Inter:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Literata x-height ~0.50
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'alegreya',
    name: 'Alegreya Argentina',
    vibe: 'Juan Pablo del Peral\'s award-winning calligraphic serif. Distinctive, characterful, plays beautifully with its own sans companion.',
    display: "'Alegreya', Georgia, serif",
    body: "'Alegreya', Georgia, serif",
    sans: "'Alegreya Sans', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Alegreya:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Alegreya+Sans:wght@400;500;700',
    displayLetterSpacing: '-0.015em',
    // Alegreya x-height ~0.49
    bodySizeAdjust: 0.518,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'pt',
    name: 'PT Editorial',
    vibe: 'ParaType\'s ground-up Cyrillic+Latin family. Contemporary Russian editorial workhorse. Used across European magazines.',
    display: "'PT Serif', Georgia, serif",
    body: "'PT Serif', Georgia, serif",
    sans: "'PT Sans', -apple-system, sans-serif",
    googleFontsQuery:
      'family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700&family=PT+Sans:ital,wght@0,400;0,700;1,400',
    displayLetterSpacing: '-0.015em',
    // PT Serif x-height ~0.49
    bodySizeAdjust: 0.518,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'vollkorn',
    name: 'Vollkorn Bookish',
    vibe: 'Friedrich Althausen\'s "whole grain" — a free book face designed from the ground up for long reading. Generous, calm, no bullshit.',
    display: "'Vollkorn', Georgia, serif",
    body: "'Vollkorn', Georgia, serif",
    sans: "'Inter', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Vollkorn:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Inter:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Vollkorn x-height ~0.50
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'big-shoulders',
    name: 'Big Shoulders',
    vibe: 'Patric King\'s condensed brutalist display. Variable, wide-range. Pair with Source Serif body for tension between editorial classicism and contemporary punk.',
    display: "'Big Shoulders Display', -apple-system, sans-serif",
    body: "'Source Serif 4', Georgia, serif",
    sans: "'Source Sans 3', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Big+Shoulders+Display:wght@400;600;700;800;900&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Source+Sans+3:wght@400;500;600;700',
    displayLetterSpacing: '-0.025em',
    displayWeight: '700',
    // Source Serif 4 ~0.484, Big Shoulders is condensed display (cap-driven)
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.52,
  },
  {
    id: 'faustina',
    name: 'Faustina Magazine',
    vibe: 'Omnibus-Type\'s narrow editorial body, designed for newspaper columns. Tight, efficient, modern. Used by El País.',
    display: "'Faustina', Georgia, serif",
    body: "'Faustina', Georgia, serif",
    sans: "'Inter', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Faustina:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Inter:wght@400;500;600;700',
    displayLetterSpacing: '-0.018em',
    // Faustina x-height ~0.51 — designed for screens
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.51,
  },
  {
    id: 'roboto-slab',
    name: 'Roboto Slab',
    vibe: 'Google\'s slab variant of Roboto. Screen-tuned, geometric, mechanical without being cold. The slab category, done right.',
    display: "'Roboto Slab', Georgia, serif",
    body: "'Roboto Slab', Georgia, serif",
    sans: "'Roboto', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Roboto+Slab:wght@400;500;600;700;800&family=Roboto:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Roboto Slab x-height ~0.52 — designed for screens
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.514,
  },
  {
    id: 'arvo',
    name: 'Arvo Geometric',
    vibe: 'Anton Koovit\'s geometric slab. Clean, contemporary, no decoration. Pairs with Inter for a modern editorial-engineering tone.',
    display: "'Arvo', Georgia, serif",
    body: "'Arvo', Georgia, serif",
    sans: "'Inter', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Arvo:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Arvo x-height ~0.50
    bodySizeAdjust: 0.518,
    displaySizeAdjust: 0.51,
  },
  {
    id: 'zilla',
    name: 'Zilla Slab',
    vibe: 'Mozilla\'s house slab. Designed by Typotheque for the Firefox brand. Confident, contemporary, slightly angular.',
    display: "'Zilla Slab', Georgia, serif",
    body: "'Zilla Slab', Georgia, serif",
    sans: "'Inter', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Zilla+Slab:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Inter:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Zilla Slab x-height ~0.51
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.51,
  },
  {
    id: 'source',
    name: 'Source Pro System',
    vibe: 'Adobe\'s open Source family — Source Serif 4 paired with Source Sans 3. Single coherent design language across serif and sans. Quietly excellent.',
    display: "'Source Serif 4', Georgia, serif",
    body: "'Source Serif 4', Georgia, serif",
    sans: "'Source Sans 3', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;0,8..60,700;1,8..60,400&family=Source+Sans+3:ital,wght@0,400;0,500;0,600;0,700;1,400',
    displayLetterSpacing: '-0.015em',
    // Source Serif 4 x-height ~0.484
    bodySizeAdjust: 0.518,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'noto',
    name: 'Noto System',
    vibe: 'Google\'s pan-script Noto family — Noto Serif + Noto Sans. Hyper-rigorous, every script supported, the universal-coverage option. Quiet authority.',
    display: "'Noto Serif', Georgia, serif",
    body: "'Noto Serif', Georgia, serif",
    sans: "'Noto Sans', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Noto+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Noto+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400',
    displayLetterSpacing: '-0.015em',
    // Noto Serif x-height ~0.49
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'dm-complete',
    name: 'DM Complete',
    vibe: 'The full DM family — DM Serif Display headlines, DM Serif Text body, DM Sans UI. Colophon Foundry\'s open family. Coherent across all three roles.',
    display: "'DM Serif Display', Georgia, serif",
    body: "'DM Serif Text', Georgia, serif",
    sans: "'DM Sans', -apple-system, sans-serif",
    googleFontsQuery:
      'family=DM+Serif+Display:ital@0;1&family=DM+Serif+Text:ital@0;1&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400',
    displayLetterSpacing: '-0.01em',
    // DM Serif Text x-height ~0.50, Display ~0.49
    bodySizeAdjust: 0.518,
    displaySizeAdjust: 0.495,
  },
  {
    id: 'frank-ruhl',
    name: 'Frank Ruhl Libre',
    vibe: 'Israeli-designed contemporary editorial serif. Tall, refined, slightly modular. The free analog to Recoleta — modern editorial without nostalgia.',
    display: "'Frank Ruhl Libre', Georgia, serif",
    body: "'Frank Ruhl Libre', Georgia, serif",
    sans: "'Inter', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Frank+Ruhl+Libre:wght@400;500;600;700;900&family=Inter:wght@400;500;600;700',
    displayLetterSpacing: '-0.02em',
    // Frank Ruhl Libre x-height ~0.50
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'domine',
    name: 'Domine',
    vibe: 'Pablo Impallari\'s screen-optimized serif. Designed specifically for body text on the web. Penguin-bookish quality with Merriweather-grade legibility.',
    display: "'Domine', Georgia, serif",
    body: "'Domine', Georgia, serif",
    sans: "'Inter', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Domine:wght@400;500;600;700&family=Inter:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Domine x-height ~0.51 — designed for screens
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.514,
  },
  {
    id: 'crimson-text',
    name: 'Crimson Text',
    vibe: 'Sebastian Kosch\'s Italian Renaissance revival. Classical proportions, scholarly authority. The body text version of Crimson Pro, with tighter metrics.',
    display: "'Crimson Text', Georgia, serif",
    body: "'Crimson Text', Georgia, serif",
    sans: "'Inter', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Inter:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Crimson Text x-height ~0.45 — small, needs scale-up
    bodySizeAdjust: 0.52,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'outfit',
    name: 'Outfit + Source Serif',
    vibe: 'Outfit — Indian Type Foundry\'s geometric humanist sans, variable. Display headlines pair with Source Serif body for modern editorial-tech tension.',
    display: "'Outfit', -apple-system, sans-serif",
    body: "'Source Serif 4', Georgia, serif",
    sans: "'Outfit', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Outfit:wght@400;500;600;700;800&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400',
    displayLetterSpacing: '-0.025em',
    displayWeight: '700',
    // Source Serif 4 ~0.484, Outfit ~0.52
    bodySizeAdjust: 0.518,
    displaySizeAdjust: 0.514,
  },
  {
    id: 'archivo',
    name: 'Archivo + Lora',
    vibe: 'Omnibus-Type\'s contemporary grotesk, slightly condensed. Strong horizontal rhythm. Lora body grounds it in editorial tradition.',
    display: "'Archivo', -apple-system, sans-serif",
    body: "'Lora', Georgia, serif",
    sans: "'Archivo', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Archivo:wght@400;500;600;700;800&family=Lora:ital,wght@0,400;0,500;0,600;1,400',
    displayLetterSpacing: '-0.025em',
    displayWeight: '700',
    // Lora ~0.51, Archivo ~0.52
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.514,
  },
  {
    id: 'bricolage',
    name: 'Bricolage Grotesque',
    vibe: 'Mathieu Triay\'s variable contemporary grotesk. Subtle ink traps, modern proportions. Pair with Spectral for a contemporary literary feel.',
    display: "'Bricolage Grotesque', -apple-system, sans-serif",
    body: "'Spectral', Georgia, serif",
    sans: "'Bricolage Grotesque', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Spectral:ital,wght@0,400;0,500;0,600;1,400',
    displayLetterSpacing: '-0.025em',
    displayWeight: '700',
    // Spectral ~0.50, Bricolage ~0.51
    bodySizeAdjust: 0.514,
    displaySizeAdjust: 0.51,
  },
  {
    id: 'cardo',
    name: 'Cardo Scholarly',
    vibe: 'David Perry\'s Renaissance Italian humanist, designed for classics scholarship. Generous proportions, scholarly authority, deep glyph coverage.',
    display: "'Cardo', Georgia, serif",
    body: "'Cardo', Georgia, serif",
    sans: "'Inter', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Cardo:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Cardo x-height ~0.45 — small Renaissance proportions
    bodySizeAdjust: 0.52,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'gentium',
    name: 'Gentium Book Plus',
    vibe: 'SIL\'s award-winning literary face. Designed for the world\'s minority languages. Quiet, generous, deeply considered — the typographer\'s conscience pick.',
    display: "'Gentium Book Plus', Georgia, serif",
    body: "'Gentium Book Plus', Georgia, serif",
    sans: "'Inter', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Gentium+Book+Plus:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@400;500;600;700',
    displayLetterSpacing: '-0.015em',
    // Gentium x-height ~0.47
    bodySizeAdjust: 0.518,
    displaySizeAdjust: 0.50,
  },
  {
    id: 'tinos',
    name: 'Tinos Broadsheet',
    vibe: 'Steve Matteson\'s metric-compatible Times analog (the Liberation/Croscore family). Neutral broadsheet authority. Pairs with Arimo for a complete free Helvetica/Arial replacement.',
    display: "'Tinos', Georgia, serif",
    body: "'Tinos', Georgia, serif",
    sans: "'Arimo', -apple-system, sans-serif",
    googleFontsQuery:
      'family=Tinos:ital,wght@0,400;0,700;1,400;1,700&family=Arimo:ital,wght@0,400;0,500;0,600;0,700;1,400',
    displayLetterSpacing: '-0.015em',
    // Tinos matches Times metrics — x-height ~0.45
    bodySizeAdjust: 0.518,
    displaySizeAdjust: 0.50,
  },
];

export const DEFAULT_PRESET_ID = 'classic';

export function getPresetById(id: string | undefined | null): TypographyPreset {
  if (!id) return TYPOGRAPHY_PRESETS[0];
  return TYPOGRAPHY_PRESETS.find((p) => p.id === id) || TYPOGRAPHY_PRESETS[0];
}
