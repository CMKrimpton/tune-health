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

export function assembleAstroFile(
  metadata: {
    title: string;
    description: string;
    category: string;
    readTime: number;
    tags: string[];
  },
  html: string,
  toc: { id: string; title: string }[],
): string {
  const tocHtml = toc
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
