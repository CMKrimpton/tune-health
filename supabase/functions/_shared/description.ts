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

// Extract all <p>…</p> blocks inside the first <section id="introduction">
function getIntroParagraphs(articleHtml: string): Array<{ raw: string; inner: string; text: string }> {
  const sectionMatch = articleHtml.match(
    /<section[^>]*id=["']introduction["'][^>]*>([\s\S]*?)<\/section>/i
  );
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
