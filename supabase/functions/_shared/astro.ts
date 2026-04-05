const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function publishDateDisplay(): string {
  const d = new Date();
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Slugify a heading string into a valid HTML id. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[''\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function assembleAstroFile(
  metadata: {
    title: string;
    description: string;
    category: string;
    readTime: number;
    tags: string[];
  },
  rawHtml: string,
  toc: { id: string; title: string }[],
): string {
  // Deduplicate: if the first <p> in the introduction section is essentially
  // the same text as the description (which ArticleLayout renders as a
  // standfirst), strip it so the reader doesn't see the same text twice.
  // Only strip if the paragraph and description are truly the same content
  // (within 20% length), not when the description is a short excerpt of a
  // much longer paragraph.
  let html = rawHtml;
  const descPlain = metadata.description.replace(/\s+/g, " ").trim();
  if (descPlain.length > 30) {
    // Match the first <p>...</p> inside <section id="introduction">
    const introMatch = html.match(
      /(<section[^>]*id="introduction"[^>]*>\s*)(<p[^>]*>)([\s\S]*?)(<\/p>)/i
    );
    if (introMatch) {
      const firstParaText = introMatch[3].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      // Only strip if lengths are within 20% — prevents stripping a long
      // paragraph just because a short auto-extracted description matches
      // its opening words.
      const lengthRatio = Math.min(descPlain.length, firstParaText.length) / Math.max(descPlain.length, firstParaText.length);
      if (lengthRatio > 0.8 && (descPlain.startsWith(firstParaText.slice(0, 80)) || firstParaText.startsWith(descPlain.slice(0, 80)))) {
        html = html.replace(
          introMatch[0],
          introMatch[1] // keep the <section> tag, drop the first <p>
        );
      }
    }
  }
  // ── Re-derive section IDs and TOC from the actual HTML ───────────
  // Don't trust the incoming `toc` — it may have stale IDs from before
  // headers were rewritten. Parse <section id="X"><h2>Y</h2> pairs
  // directly from the HTML, slugify each <h2> into a fresh ID, and
  // update both the HTML and the TOC links.
  // Match sections that contain an <h2> WITHOUT crossing into the next section.
  // Use a negative lookahead to stop before any </section> or <section boundary.
  const sectionMatches = [
    ...html.matchAll(/<section[^>]*\sid="([^"]+)"[^>]*>(?:(?!<\/section>|<section[\s>])[\s\S])*?<h2[^>]*>([^<]+)<\/h2>/gi),
  ];
  const usedIds = new Set<string>();
  const reconciledToc: { id: string; title: string }[] = [];
  for (const m of sectionMatches) {
    const oldId = m[1];
    const h2Text = m[2].trim();
    const newId = slugify(h2Text) || oldId;
    let finalId = newId;
    let suffix = 2;
    while (usedIds.has(finalId)) {
      finalId = `${newId}-${suffix++}`;
    }
    usedIds.add(finalId);
    if (finalId !== oldId) {
      const sectionRe = new RegExp(
        `(<section[^>]*\\s)id="${oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
        "i",
      );
      html = html.replace(sectionRe, `$1id="${finalId}"`);
    }
    reconciledToc.push({ id: finalId, title: h2Text });
  }

  const tocHtml = reconciledToc
    .map(
      (t) =>
        `      <a href="#${t.id}" class="block text-sm text-stone-600 dark:text-stone-400 hover:text-primary-600 transition-colors">${t.title}</a>`,
    )
    .join("\n");

  const tagsHtml = metadata.tags
    .map(
      (tag) =>
        `    <span class="px-3 py-1 bg-stone-100 dark:bg-stone-800 rounded-full text-sm">${tag}</span>`,
    )
    .join("\n");

  return `---
import ArticleLayout from '../../layouts/ArticleLayout.astro';
---

<ArticleLayout
  title="${escapeAttr(metadata.title)}"
  description="${escapeAttr(metadata.description)}"
  category="${escapeAttr(metadata.category)}"
  readTime="${metadata.readTime} min read"
  publishDate="${publishDateDisplay()}"
>
  <!-- Table of Contents -->
  <div class="mb-12 p-6 bg-stone-100 dark:bg-stone-900 rounded-2xl reveal">
    <h2 class="font-serif text-lg font-semibold mb-4">In This Article</h2>
    <nav class="space-y-2">
${tocHtml}
    </nav>
  </div>

  <!-- Article Content -->
  <div class="article-content">
    ${html.replace(/<(?![a-zA-Z/!])/g, "&lt;")}
  </div>

  <!-- Tags -->
  <Fragment slot="tags">
${tagsHtml}
  </Fragment>
</ArticleLayout>
`;
}
