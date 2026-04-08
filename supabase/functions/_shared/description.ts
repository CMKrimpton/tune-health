// Shared description extraction + validation used by every publish path.
// Single source of truth so publish-direct, submit-new-article, and
// stage-publish all agree on what a "good" description looks like.
//
// The bug this replaces: a dumb "first <p> inside #introduction" regex
// was grabbing breadcrumb strips ("Mental Health · 30 Series · Part 1 · 10 min read")
// and standfirst deks wrapped in <strong>, then stage-publish's truncation
// gate saw no terminal period and synthesized garbage by concatenating the
// standfirst with the first body paragraph.

export type ExtractionSource =
  | "standfirst"
  | "first-paragraph"
  | "provided"
  | "none";

export interface ExtractedDescription {
  description: string;
  source: ExtractionSource;
  // true when the description is a dek/standfirst that legitimately may not
  // end in terminal punctuation. The truncation gate must NOT treat these as
  // broken.
  isStandfirst: boolean;
}

// A paragraph is "metadata noise" (breadcrumb / byline strip / read-time line)
// if it looks like structured nav text rather than prose. We skip these when
// picking the first real prose paragraph.
function looksLikeMetadataStrip(plainText: string): boolean {
  const t = plainText.trim();
  if (!t) return true;
  // Contains ·, •, | or — as a separator AND is short-ish — classic breadcrumb
  if (/[·•|]/.test(t) && t.length < 160) return true;
  // "10 min read" / "5 minute read" anywhere in a short line
  if (/\b\d+\s*min(?:ute)?s?\s+read\b/i.test(t) && t.length < 160) return true;
  // "Part N of M" / "Part N" standalone short line
  if (/^part\s+\d+(\s+of\s+\d+)?$/i.test(t)) return true;
  // "By {author}" short byline
  if (/^by\s+[A-Z]/.test(t) && t.length < 80) return true;
  // Entirely uppercase short line (section label)
  if (t.length < 60 && t === t.toUpperCase() && /[A-Z]/.test(t)) return true;
  return false;
}

// A paragraph is a standfirst/dek when the ENTIRE visible content is wrapped
// in a single <strong> / <em> — that's the editorial convention for a dek
// sitting between the title and the first body paragraph.
function isStandfirstHtml(pHtmlInner: string): boolean {
  const trimmed = pHtmlInner.trim();
  if (!trimmed) return false;
  // Single <strong>...</strong> wrapper (or <b>)
  const m = trimmed.match(/^<(strong|b|em|i)[^>]*>([\s\S]*?)<\/\1>$/i);
  if (!m) return false;
  // Make sure there's no extra text outside the wrapper
  const inner = m[2];
  // The inner shouldn't itself contain another block element
  if (/<p[\s>]/i.test(inner)) return false;
  return true;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Slice HTML at a visible-character offset while preserving tag balance.
// Walks the HTML token by token: tags pass through (don't count toward
// visible chars), text contributes to the visible character count, and
// once we reach `targetChars`, return the remainder.
//
// Used by stripDuplicateStandfirst to surgically excise the prefix of a
// body paragraph that duplicates the description, while preserving the
// rest of the paragraph (which may contain additional sentences and
// inline tags like <em>, <strong>, <a>).
//
// IMPORTANT: this works on a SINGLE paragraph's inner HTML. It assumes no
// nested block-level elements. Inline tags are fine.
function sliceHtmlAtVisibleChars(
  html: string,
  targetChars: number,
): { prefix: string; remainder: string } | null {
  if (!html || targetChars <= 0) return null;

  let i = 0;
  let visibleCount = 0;
  const prefixParts: string[] = [];
  // Stack tracks any inline tags that were opened in the prefix but not
  // yet closed. We need to leave the remainder properly nested.
  const openTagStack: string[] = [];

  while (i < html.length) {
    if (visibleCount >= targetChars) break;
    const ch = html[i];

    if (ch === "<") {
      // It's a tag — find its end
      const tagEnd = html.indexOf(">", i);
      if (tagEnd === -1) {
        // Malformed HTML — just consume rest as text
        break;
      }
      const fullTag = html.slice(i, tagEnd + 1);
      prefixParts.push(fullTag);

      // Track open/close tags so we can close any still-open ones at the cut
      const tagInner = fullTag.slice(1, -1).trim();
      const isClosing = tagInner.startsWith("/");
      const isSelfClosing = tagInner.endsWith("/") || /^(br|hr|img|input)\b/i.test(tagInner);
      if (!isClosing && !isSelfClosing) {
        const tagName = tagInner.split(/[\s/>]/)[0];
        if (tagName) openTagStack.push(tagName);
      } else if (isClosing) {
        const tagName = tagInner.slice(1).split(/[\s/>]/)[0];
        // Pop the matching opener
        for (let j = openTagStack.length - 1; j >= 0; j--) {
          if (openTagStack[j] === tagName) {
            openTagStack.splice(j, 1);
            break;
          }
        }
      }
      i = tagEnd + 1;
      continue;
    }

    if (ch === "&") {
      // HTML entity — counts as ONE visible char
      const semi = html.indexOf(";", i);
      if (semi !== -1 && semi - i < 10) {
        prefixParts.push(html.slice(i, semi + 1));
        visibleCount++;
        i = semi + 1;
        continue;
      }
    }

    // Plain character
    prefixParts.push(ch);
    // Whitespace runs collapse to one for counting purposes (matches stripTags)
    if (/\s/.test(ch)) {
      // Only count if previous wasn't whitespace
      if (visibleCount > 0 && prefixParts[prefixParts.length - 2] && !/\s/.test(prefixParts[prefixParts.length - 2])) {
        visibleCount++;
      }
    } else {
      visibleCount++;
    }
    i++;
  }

  // Walk forward to a word boundary so we don't cut mid-word
  while (i < html.length && /\S/.test(html[i]) && html[i] !== "<") {
    prefixParts.push(html[i]);
    i++;
  }

  // Close any still-open tags in the prefix (so it's well-formed)
  for (let j = openTagStack.length - 1; j >= 0; j--) {
    prefixParts.push(`</${openTagStack[j]}>`);
  }

  // Re-open them at the start of the remainder (so it's also well-formed)
  const remainderOpens = openTagStack.map(t => `<${t}>`).join("");
  const remainder = remainderOpens + html.slice(i);

  return {
    prefix: prefixParts.join(""),
    remainder,
  };
}

// Extract all <p>…</p> blocks inside the first <section> of the article.
// Prefers <section id="introduction"> when present, but falls back to the
// FIRST <section> regardless of id (some articles use #executive-summary,
// #the-accidental-cardiac-drug, or other custom first-section IDs).
function getIntroParagraphs(articleHtml: string): Array<{ raw: string; inner: string; text: string }> {
  // 1. Try the canonical #introduction section
  let sectionMatch = articleHtml.match(
    /<section[^>]*id=["']introduction["'][^>]*>([\s\S]*?)<\/section>/i
  );
  // 2. Fall back to the FIRST <section> in the document
  if (!sectionMatch) {
    sectionMatch = articleHtml.match(/<section[^>]*>([\s\S]*?)<\/section>/i);
  }
  if (!sectionMatch) return [];
  const sectionBody = sectionMatch[1];
  const paragraphs: Array<{ raw: string; inner: string; text: string }> = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRegex.exec(sectionBody)) !== null) {
    const inner = m[1];
    const text = stripTags(inner);
    if (text) paragraphs.push({ raw: m[0], inner, text });
  }
  return paragraphs;
}

// Main entry: pick the best description from an HTML article body.
// Priority:
//   1. If the first intro paragraph is a standfirst/dek (wrapped in <strong>),
//      use it and mark isStandfirst=true.
//   2. Otherwise skip metadata strips (breadcrumbs / "10 min read" / etc.) and
//      return the first real prose paragraph, truncated to 280 chars at a
//      sentence boundary.
//   3. If nothing usable is found, fall back to empty.
export function extractDescriptionFromHtml(articleHtml: string): ExtractedDescription {
  const paras = getIntroParagraphs(articleHtml);
  if (paras.length === 0) return { description: "", source: "none", isStandfirst: false };

  // Walk paragraphs in order, skipping metadata strips
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];

    // Standfirst check on the first non-metadata paragraph
    if (!looksLikeMetadataStrip(p.text)) {
      if (isStandfirstHtml(p.inner)) {
        return {
          description: p.text,
          source: "standfirst",
          isStandfirst: true,
        };
      }
      // First real prose paragraph — truncate cleanly
      return {
        description: truncateAtSentence(p.text, 280),
        source: "first-paragraph",
        isStandfirst: false,
      };
    }
    // else: metadata strip, keep walking
  }

  return { description: "", source: "none", isStandfirst: false };
}

// Extract description from markdown input BEFORE conversion to HTML.
// Handles the common shapes Opus emits:
//
//   # Title
//   ## Standfirst text              ← use this
//   First body paragraph…
//
//   # Title
//
//   **Standfirst text**             ← use this
//
//   First body paragraph…
//
//   # Title
//
//   First body paragraph…           ← use the opening sentences
export function extractDescriptionFromMarkdown(markdown: string): ExtractedDescription {
  const lines = markdown.split("\n");
  let i = 0;

  // Skip anything before the first H1
  while (i < lines.length && !/^# [^#]/.test(lines[i].trim())) i++;
  if (i >= lines.length) return { description: "", source: "none", isStandfirst: false };
  i++; // skip past the H1

  // Skip blank lines
  while (i < lines.length && lines[i].trim() === "") i++;

  if (i >= lines.length) return { description: "", source: "none", isStandfirst: false };

  const firstLine = lines[i].trim();

  // Case 1: ## Subhead as standfirst
  if (/^## [^#]/.test(firstLine)) {
    const text = cleanMdInlines(firstLine.replace(/^## /, ""));
    return { description: text, source: "standfirst", isStandfirst: true };
  }

  // Case 2: **bold line** as standfirst (entire line wrapped in **)
  const boldOnly = firstLine.match(/^\*\*([^*]+)\*\*$/);
  if (boldOnly) {
    return {
      description: cleanMdInlines(boldOnly[1]),
      source: "standfirst",
      isStandfirst: true,
    };
  }

  // Case 3: collect paragraph until blank line — first real prose paragraph
  const buf: string[] = [];
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === "") break;
    if (/^#{1,6} /.test(t)) break; // hit another heading — stop
    buf.push(t);
    i++;
  }
  if (buf.length === 0) return { description: "", source: "none", isStandfirst: false };

  const joined = cleanMdInlines(buf.join(" "));
  if (looksLikeMetadataStrip(joined)) {
    // Rare, but be safe
    return { description: "", source: "none", isStandfirst: false };
  }
  return {
    description: truncateAtSentence(joined, 280),
    source: "first-paragraph",
    isStandfirst: false,
  };
}

function cleanMdInlines(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

// Truncate to <= maxLen, preferring a sentence boundary. Never mid-word.
function truncateAtSentence(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  // Find the last sentence-ending punctuation before maxLen
  const slice = t.slice(0, maxLen);
  const sentenceEnd = slice.search(/[.!?]["')\u2019]?(?=\s|$)(?!.*[.!?])/);
  // Simpler: find the last occurrence of .!? in the slice
  const lastPunct = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (lastPunct > 80) {
    return slice.slice(0, lastPunct + 1).trim();
  }
  // No sentence boundary — cut at last word boundary
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > 80) {
    return slice.slice(0, lastSpace).trim() + "…";
  }
  // Pathological: just hard-truncate
  void sentenceEnd;
  return slice.trim() + "…";
}

// Strip the first <p> from <section id="introduction"> when its plain text
// is essentially the same as the description. ArticleLayout already renders
// the description as a standfirst above the body, so leaving the matching
// paragraph in produces a duplicated intro.
//
// Heuristic: the body paragraph and the description must overlap by at least
// 80% on either side (description is a leading slice of paragraph, OR
// paragraph is a leading slice of description). This catches:
//   - the standfirst dek (paragraph IS the description, 100% match)
//   - the truncated-at-280-chars first paragraph (description is the first
//     ~280 chars of a longer paragraph)
//
// It does NOT strip:
//   - paragraphs that merely share a few opening words
//   - cases where the body opens with a completely different sentence
export function stripDuplicateStandfirst(
  articleHtml: string,
  description: string | undefined | null
): string {
  const desc = (description || "").replace(/\s+/g, " ").trim();
  if (desc.length < 30) return articleHtml;

  // Try the canonical #introduction section first, then fall back to the
  // FIRST <section> regardless of id (some articles use custom first-section
  // IDs like #executive-summary).
  let introMatch = articleHtml.match(
    /(<section[^>]*id=["']introduction["'][^>]*>\s*)(<p[^>]*>([\s\S]*?)<\/p>\s*)/i
  );
  if (!introMatch) {
    introMatch = articleHtml.match(
      /(<section[^>]*>\s*)(<p[^>]*>([\s\S]*?)<\/p>\s*)/i
    );
  }
  if (!introMatch) return articleHtml;

  const fullPBlock = introMatch[2];
  const innerHtml = introMatch[3];
  const paraText = stripTags(innerHtml);
  if (!paraText) return articleHtml;

  // Strict match: identical (after whitespace collapse) — covers standfirsts
  if (paraText === desc) {
    return articleHtml.replace(introMatch[0], introMatch[1]);
  }

  // Loose match: one is a leading slice of the other AND length ratio > 0.8
  const minLen = Math.min(paraText.length, desc.length);
  const maxLen = Math.max(paraText.length, desc.length);
  const ratio = minLen / maxLen;

  // Compare normalised slices (lowercase, strip smart quotes / curly apostrophes)
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').trim();
  const np = normalize(paraText);
  const nd = normalize(desc);
  const sliceLen = Math.min(80, minLen);
  const leadingMatch =
    np.startsWith(nd.slice(0, sliceLen)) || nd.startsWith(np.slice(0, sliceLen));

  if (ratio > 0.8 && leadingMatch) {
    return articleHtml.replace(introMatch[0], introMatch[1]);
  }

  // ── Tier A: literal prefix slice ────────────────────────────────────
  // Description is the opening sentences of a much longer paragraph.
  // Surgically slice the duplicated prefix off, leaving the rest of the
  // paragraph intact.
  if (paraText.length > desc.length + 20 && np.startsWith(nd)) {
    const trimmedInner = innerHtml.trim();
    const sliced = sliceHtmlAtVisibleChars(trimmedInner, desc.length);
    if (sliced && sliced.remainder.trim().length > 30) {
      const cleanedRemainder = sliced.remainder
        .replace(/^[\s.!?,;:—–\-]+/, "")
        .trim();
      if (cleanedRemainder.length > 30) {
        const pTagMatch = introMatch[2].match(/^<p[^>]*>/);
        const pOpenTag = pTagMatch ? pTagMatch[0] : "<p>";
        const newPBlock = `${pOpenTag}${cleanedRemainder}</p>`;
        return articleHtml.replace(introMatch[0], introMatch[1] + newPBlock);
      }
    }
  }

  // ── Tier B: fuzzy paraphrase strip ──────────────────────────────────
  // Body paragraph paraphrases the description with mid-sentence inserts
  // (em-dash asides, parentheticals). If after normalizing both texts the
  // body's word set has ≥80% overlap with the description's word set AND
  // the lengths are within 60% of each other, the body p1 IS the
  // description in different words. Strip the whole paragraph.
  const tokenize = (s: string): string[] =>
    s.toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 3); // skip short stop words

  const descWords = new Set(tokenize(desc));
  const paraWords = new Set(tokenize(paraText));
  if (descWords.size >= 8) {
    let intersection = 0;
    for (const w of descWords) if (paraWords.has(w)) intersection++;
    const overlap = intersection / descWords.size;
    const lengthRatio = Math.min(paraText.length, desc.length) / Math.max(paraText.length, desc.length);
    if (overlap >= 0.8 && lengthRatio >= 0.6) {
      // Strip the whole first <p> — it's a paraphrase of the standfirst
      return articleHtml.replace(introMatch[0], introMatch[1]);
    }
  }

  // ── Tier C: first-sentence-only dedup ───────────────────────────────
  // Description and body p1 share only the first sentence, then diverge
  // into different content. Slice that first sentence off the body so
  // the reader doesn't see it twice.
  const descFirstSentMatch = desc.match(/^[^.!?]+[.!?]/);
  const paraFirstSentMatch = paraText.match(/^[^.!?]+[.!?]/);
  if (descFirstSentMatch && paraFirstSentMatch) {
    const descFirst = descFirstSentMatch[0].trim();
    const paraFirst = paraFirstSentMatch[0].trim();
    // First sentences must be substantial AND essentially identical
    if (descFirst.length >= 20 && paraFirst.length >= 20) {
      const normalize2 = (s: string) =>
        s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
      if (normalize2(descFirst) === normalize2(paraFirst)) {
        // Body has more content after the first sentence — slice it off
        if (paraText.length > paraFirst.length + 30) {
          const trimmedInner = innerHtml.trim();
          const sliced = sliceHtmlAtVisibleChars(trimmedInner, paraFirst.length);
          if (sliced && sliced.remainder.trim().length > 30) {
            const cleanedRemainder = sliced.remainder
              .replace(/^[\s.!?,;:—–\-]+/, "")
              .trim();
            if (cleanedRemainder.length > 30) {
              const pTagMatch = introMatch[2].match(/^<p[^>]*>/);
              const pOpenTag = pTagMatch ? pTagMatch[0] : "<p>";
              const newPBlock = `${pOpenTag}${cleanedRemainder}</p>`;
              return articleHtml.replace(introMatch[0], introMatch[1] + newPBlock);
            }
          }
        }
      }
    }
  }

  // Last-ditch: paragraph is wrapped in <strong>/<b>/<em> AND has any
  // meaningful overlap with description. A standfirst dek is by definition
  // editorially intended as the description.
  if (isStandfirstHtml(innerHtml)) {
    // If the dek text and description share at least their first 40 chars,
    // strip the dek.
    const sharedHead = Math.min(40, minLen);
    if (sharedHead > 20 && np.slice(0, sharedHead) === nd.slice(0, sharedHead)) {
      return articleHtml.replace(introMatch[0], introMatch[1]);
    }
  }

  void fullPBlock;
  return articleHtml;
}

// Decide whether a description is genuinely broken/truncated and should be
// replaced. A standfirst (dek) that doesn't end in a period is NOT broken —
// that's editorial convention.
//
// Returns true if the description looks legitimately broken:
//   - empty or near-empty
//   - ends mid-word (no trailing space/punct on cut)
//   - ends with a dangling connector (comma, dash, preposition, article)
//   - is a metadata strip
export function descriptionLooksBroken(
  description: string | undefined | null,
  opts: { isStandfirst?: boolean } = {}
): boolean {
  const t = (description || "").trim();
  if (!t) return true;
  if (t.length < 20) return true;
  if (looksLikeMetadataStrip(t)) return true;

  // Ends with a dangling connector — always broken, even for standfirsts
  if (/[,\-—–]\s*$/.test(t)) return true;
  if (/\b(the|a|an|of|for|to|with|and|or|but|in|on|at|by|from|as|is|are|was|were|be|been|being|that|which|who|whose)\s*$/i.test(t)) return true;

  // Ends mid-word (cut off without any trailing punctuation or space handling)
  // This catches parseClaudeJSON truncation: "…interpreting their"
  // A well-formed description ends in . ! ? … " ' ) or proper punctuation.
  const endsProperly = /[.!?…"')\u2019\u201d]\s*$/.test(t);
  if (endsProperly) return false;

  // No terminal punctuation — only allowed for legitimate standfirsts of
  // reasonable length that don't have a dangling connector.
  if (opts.isStandfirst && t.length >= 40 && t.length <= 220) return false;

  // Everything else with no terminal punctuation IS broken.
  return true;
}
