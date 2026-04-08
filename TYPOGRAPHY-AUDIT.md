# Typography Audit: alumi news vs Medium

> Conducted 2026-04-03. Reference for future headline font exploration.

## Current Stack

| Role | Typeface | Source |
|------|----------|--------|
| Headlines | Playfair Display | Google Fonts |
| Body text | Crimson Pro | Google Fonts |
| UI/nav/meta | Inter | Google Fonts |

## Medium's Stack

| Role | Typeface | Source |
|------|----------|--------|
| Headlines/display | Noe Display | Commercial (~$200+) |
| Body text | Charter | Bitstream (free) |
| UI/nav/meta | Söhne | Commercial (~$400+, Klim) |

## Assessment

### Body text (Crimson Pro) — No change needed
- Good x-height, optical sizes, variable weight
- 1.8 line-height + 680px max-width is well-tuned
- Competitive with Charter

### UI sans (Inter) — No change needed
- Right call for free sans-serif
- Difference vs Söhne is imperceptible at nav/metadata scale

### Headlines (Playfair Display) — Room for improvement
- Most overused free display serif on the web
- Signals "free template" to typographically literate readers
- High contrast + ball terminals are beautiful but generic

## Headline Candidates

### Free (Google Fonts)
1. **Newsreader** — Production Type. Closest to Medium's editorial feel. Clean, professional, under-used
2. **Fraunces** — Variable with quirky "wonky" optical axis. Very distinctive, would differentiate the brand
3. **Lora** — Less overused than Playfair, good x-height, slightly more contemporary

### Commercial
- **Noe Display** — Scotch Modern with ink traps. Medium's choice. ~$200+

## Next Steps
- [ ] Prototype Newsreader and/or Fraunces as headline swap
- [ ] Compare visually on article pages, homepage hero, card titles
- [ ] Decision: stay with Playfair or swap
