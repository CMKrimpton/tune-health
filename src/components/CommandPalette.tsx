import { Command } from 'cmdk';
import { useState, useEffect, useCallback, useMemo } from 'react';

declare global {
  interface Window {
    __ALUMI_ARTICLES__?: ArticleItem[];
    toggleTheme?: () => void;
  }
}

interface ArticleItem {
  id: string;
  title: string;
  description: string;
  category: string;
  href: string;
  readTime: string;
  tags: string[];
}

const pages = [
  { id: 'home', title: 'Home', href: '/', icon: '🏠' },
  { id: 'articles', title: 'All Articles', href: '/articles', icon: '📰' },
  { id: 'deep-dives', title: 'Deep Dives', href: '/deep-dives', icon: '🔬' },
  { id: 'reading-list', title: 'Reading List', href: '/reading-list', icon: '🔖' },
  { id: 'subscribe', title: 'Subscribe', href: '/subscribe', icon: '📧' },
  { id: 'about', title: 'About', href: '/about', icon: '📋' },
];

const actions = [
  { id: 'theme', title: 'Cycle Theme (System / Light / Dark)', icon: '🌓', action: 'toggleTheme' },
  { id: 'share', title: 'Share This Page', icon: '📤', action: 'share' },
  { id: 'top', title: 'Back to Top', icon: '⬆️', action: 'scrollToTop' },
  { id: 'print', title: 'Print', icon: '🖨️', action: 'print' },
];

// Category colors for badges
const categoryColors: Record<string, string> = {
  'Mental Health': '#7c3aed',
  'Neuroscience': '#0891b2',
  'Longevity': '#059669',
  'Clinical Evidence': '#7c3aed',
  'Environmental Health': '#d97706',
  'Nutrition': '#16a34a',
  'Fitness': '#dc2626',
  'Sleep Science': '#4f46e5',
  'Pharmacology': '#0d9488',
  'Research': '#78716c',
  'Research Summary': '#78716c',
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [recentlyUsed, setRecentlyUsed] = useState<string[]>([]);
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Load articles from window data injected by Astro
  useEffect(() => {
    const data = window.__ALUMI_ARTICLES__;
    if (Array.isArray(data)) setArticles(data);
  }, []);

  // Load recently used from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cmdk-recent');
      if (stored) setRecentlyUsed(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Save recently used
  const addToRecent = useCallback((id: string) => {
    setRecentlyUsed((prev) => {
      const updated = [id, ...prev.filter((i) => i !== id)].slice(0, 8);
      localStorage.setItem('cmdk-recent', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Unique categories with counts
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    articles.forEach(a => map.set(a.category, (map.get(a.category) || 0) + 1));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [articles]);

  // Filtered articles based on search + category
  const filteredArticles = useMemo(() => {
    let result = articles;

    if (selectedCategory) {
      result = result.filter(a => a.category === selectedCategory);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    return result;
  }, [articles, search, selectedCategory]);

  // Group filtered articles by category
  const groupedArticles = useMemo(() => {
    const map = new Map<string, ArticleItem[]>();
    filteredArticles.forEach(a => {
      const existing = map.get(a.category) || [];
      existing.push(a);
      map.set(a.category, existing);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredArticles]);

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);

    const triggers = document.querySelectorAll('#cmdkTrigger, #cmdkTriggerMobile');
    const openHandler = () => setOpen(true);
    triggers.forEach((t) => t.addEventListener('click', openHandler));

    return () => {
      document.removeEventListener('keydown', down);
    };
  }, []);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedCategory(null);
    }
  }, [open]);

  const navigate = useCallback((href: string, id: string) => {
    addToRecent(id);
    setOpen(false);
    window.location.href = href;
  }, [addToRecent]);

  const executeAction = useCallback((action: string, id: string) => {
    addToRecent(id);
    setOpen(false);
    switch (action) {
      case 'toggleTheme': window.toggleTheme?.(); break;
      case 'scrollToTop': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'share':
        if (navigator.share) {
          navigator.share({ title: document.title, url: window.location.href });
        } else {
          navigator.clipboard.writeText(window.location.href);
        }
        break;
      case 'print': window.print(); break;
    }
  }, [addToRecent]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  // Current page sections
  const [sections, setSections] = useState<Array<{ id: string; title: string }>>([]);
  useEffect(() => {
    if (open) {
      const headings = document.querySelectorAll('article h2[id], article h3[id]');
      setSections(Array.from(headings).map((h) => ({ id: h.id, title: h.textContent || '' })));
    }
  }, [open]);

  const isSearching = search.length > 0;
  const isBrowsingCategory = selectedCategory !== null;
  const showArticles = isSearching || isBrowsingCategory;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Search">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-2xl px-4" style={{ top: 'max(12%, env(safe-area-inset-top, 0px))' }}>
        <Command
          className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden"
          loop
          shouldFilter={false}
        >
          {/* Input */}
          <div className="flex items-center gap-3 px-4 border-b border-stone-200 dark:border-stone-700">
            {isBrowsingCategory && !isSearching ? (
              <button
                onClick={() => setSelectedCategory(null)}
                className="flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 12H5M5 12l7 7M5 12l7-7" strokeWidth="2"/></svg>
                Back
              </button>
            ) : (
              <svg className="w-5 h-5 text-stone-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" strokeWidth="2" />
                <path d="m21 21-4.35-4.35" strokeWidth="2" />
              </svg>
            )}
            <Command.Input
              value={search}
              onValueChange={(v) => { setSearch(v); if (v) setSelectedCategory(null); }}
              placeholder={isBrowsingCategory ? `Search in ${selectedCategory}...` : "Search articles, topics, pages..."}
              className="flex-1 py-4 bg-transparent border-none outline-none text-base placeholder-stone-400"
              autoFocus
            />
            {(isSearching || isBrowsingCategory) && (
              <span className="text-xs text-stone-400 font-medium whitespace-nowrap">
                {filteredArticles.length} result{filteredArticles.length !== 1 ? 's' : ''}
              </span>
            )}
            <kbd className="hidden sm:inline-flex px-2 py-1 text-xs font-mono text-stone-400 bg-stone-100 dark:bg-stone-800 rounded">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-stone-500">
              No results for "{search}"
            </Command.Empty>

            {/* === IDLE STATE: no search, no category === */}
            {!showArticles && (
              <>
                {/* Recently Used */}
                {recentlyUsed.length > 0 && (
                  <Command.Group heading="Recent" className="mb-3">
                    {recentlyUsed.map((id) => {
                      const article = articles.find((a) => a.id === id);
                      const page = pages.find((p) => p.id === id);
                      if (article) {
                        return (
                          <Command.Item key={id} value={article.title} onSelect={() => navigate(article.href, id)}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/20">
                            <span className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white" style={{ background: categoryColors[article.category] || '#78716c' }}>
                              {article.category[0]}
                            </span>
                            <span className="flex-1 truncate text-sm">{article.title}</span>
                            <span className="text-xs text-stone-400">{article.readTime}</span>
                          </Command.Item>
                        );
                      }
                      if (page) {
                        return (
                          <Command.Item key={id} value={page.title} onSelect={() => navigate(page.href, id)}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/20">
                            <span className="text-base">{page.icon}</span>
                            <span className="flex-1 text-sm">{page.title}</span>
                          </Command.Item>
                        );
                      }
                      return null;
                    })}
                  </Command.Group>
                )}

                {/* Browse by Topic */}
                <Command.Group heading="Browse by Topic" className="mb-3">
                  {categories.map(({ name, count }) => (
                    <Command.Item key={name} value={name} onSelect={() => setSelectedCategory(name)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/20">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: categoryColors[name] || '#78716c' }} />
                      <span className="flex-1 text-sm font-medium">{name}</span>
                      <span className="text-xs text-stone-400">{count}</span>
                    </Command.Item>
                  ))}
                </Command.Group>

                {/* Jump to Section (on article pages) */}
                {sections.length > 0 && (
                  <Command.Group heading="Jump to Section" className="mb-3">
                    {sections.map((section) => (
                      <Command.Item key={section.id} value={section.title}
                        onSelect={() => { setOpen(false); document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/20">
                        <span className="text-stone-400 text-xs">#</span>
                        <span className="flex-1 text-sm truncate">{section.title}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {/* Pages */}
                <Command.Group heading="Pages" className="mb-3">
                  {pages.map((page) => (
                    <Command.Item key={page.id} value={page.title} onSelect={() => navigate(page.href, page.id)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/20">
                      <span className="text-base">{page.icon}</span>
                      <span className="flex-1 text-sm">{page.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>

                {/* Actions */}
                <Command.Group heading="Actions">
                  {actions.map((action) => (
                    <Command.Item key={action.id} value={action.title} onSelect={() => executeAction(action.action, action.id)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/20">
                      <span className="text-base">{action.icon}</span>
                      <span className="flex-1 text-sm">{action.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              </>
            )}

            {/* === SEARCH / CATEGORY RESULTS === */}
            {showArticles && groupedArticles.map(([category, catArticles]) => (
              <Command.Group key={category} heading={`${category} (${catArticles.length})`} className="mb-3">
                {catArticles.map((article) => (
                  <Command.Item
                    key={article.id}
                    value={article.title}
                    onSelect={() => navigate(article.href, article.id)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/20"
                  >
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: categoryColors[article.category] || '#78716c' }}>
                      {article.category[0]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{article.title}</div>
                      <div className="text-xs text-stone-500 truncate mt-0.5">{article.description}</div>
                    </div>
                    <span className="text-xs text-stone-400 whitespace-nowrap flex-shrink-0">{article.readTime}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-stone-200 dark:border-stone-700 text-xs text-stone-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-stone-100 dark:bg-stone-800 rounded font-mono">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-stone-100 dark:bg-stone-800 rounded font-mono">↵</kbd>
                select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-stone-100 dark:bg-stone-800 rounded font-mono">esc</kbd>
                close
              </span>
            </div>
            <span className="text-primary-600 font-medium">alumi news</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
