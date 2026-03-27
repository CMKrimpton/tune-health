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
  { id: 'home', title: 'Home', href: '/' },
  { id: 'articles', title: 'All Articles', href: '/articles' },
  { id: 'deep-dives', title: 'Deep Dives', href: '/deep-dives' },
  { id: 'reading-list', title: 'Reading List', href: '/reading-list' },
  { id: 'subscribe', title: 'Subscribe', href: '/subscribe' },
  { id: 'about', title: 'About', href: '/about' },
];

const actions = [
  { id: 'theme', title: 'Cycle Theme', subtitle: 'System / Light / Dark', action: 'toggleTheme' },
  { id: 'share', title: 'Share This Page', action: 'share' },
  { id: 'top', title: 'Back to Top', action: 'scrollToTop' },
  { id: 'print', title: 'Print', action: 'print' },
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

// Minimal SVG icons
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.4 }}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.3 }}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M5 12l7 7M5 12l7-7" />
    </svg>
  );
}

const itemClass = "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-colors data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800";

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
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        style={{ transition: 'opacity 150ms ease' }}
      />

      <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-xl px-4" style={{ top: 'max(14%, env(safe-area-inset-top, 0px))' }}>
        <Command
          className="overflow-hidden rounded-xl border border-stone-200/80 dark:border-stone-700/80 shadow-2xl"
          style={{
            background: 'rgba(255,255,255,0.98)',
            backdropFilter: 'blur(20px)',
          }}
          loop
          shouldFilter={false}
        >
          <style>{`
            .dark [cmdk-root] { background: rgba(28,25,23,0.97) !important; }
            [cmdk-group-heading] {
              font-size: 11px;
              font-weight: 600;
              letter-spacing: 0.05em;
              text-transform: uppercase;
              padding: 8px 12px 4px;
              color: rgb(168 162 158);
            }
            .dark [cmdk-group-heading] { color: rgb(120 113 108); }
            [cmdk-input] { caret-color: rgb(220 38 38); box-shadow: none !important; outline: none !important; }
            [cmdk-list]::-webkit-scrollbar { width: 6px; }
            [cmdk-list]::-webkit-scrollbar-track { background: transparent; }
            [cmdk-list]::-webkit-scrollbar-thumb { background: rgba(120,113,108,0.2); border-radius: 3px; }
            [cmdk-list]::-webkit-scrollbar-thumb:hover { background: rgba(120,113,108,0.4); }
          `}</style>

          {/* Input */}
          <div className="flex items-center gap-3 px-4 border-b border-stone-200/60 dark:border-stone-700/60">
            {isBrowsingCategory && !isSearching ? (
              <button
                onClick={() => setSelectedCategory(null)}
                className="flex items-center gap-1.5 text-xs font-medium text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
              >
                <BackIcon />
                <span>Back</span>
              </button>
            ) : (
              <SearchIcon />
            )}
            <Command.Input
              value={search}
              onValueChange={(v) => { setSearch(v); if (v) setSelectedCategory(null); }}
              placeholder={isBrowsingCategory ? `Search ${selectedCategory}...` : "Search..."}
              className="flex-1 py-3.5 bg-transparent border-none outline-none text-sm placeholder:text-stone-400 dark:placeholder:text-stone-500"
              autoFocus
            />
            {(isSearching || isBrowsingCategory) && (
              <span className="text-[11px] text-stone-400 font-medium tabular-nums">
                {filteredArticles.length}
              </span>
            )}
            <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono text-stone-400 bg-stone-100 dark:bg-stone-800 rounded border border-stone-200/60 dark:border-stone-700/60">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[min(60vh,400px)] overflow-y-auto p-1.5">
            <Command.Empty className="py-10 text-center text-sm text-stone-400">
              No results for &ldquo;{search}&rdquo;
            </Command.Empty>

            {/* === IDLE STATE === */}
            {!showArticles && (
              <>
                {/* Recently Used */}
                {recentlyUsed.length > 0 && (
                  <Command.Group heading="Recent">
                    {recentlyUsed.slice(0, 4).map((id) => {
                      const article = articles.find((a) => a.id === id);
                      const page = pages.find((p) => p.id === id);
                      if (article) {
                        return (
                          <Command.Item key={id} value={`recent-${article.title}`} onSelect={() => navigate(article.href, id)} className={itemClass}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: categoryColors[article.category] || '#78716c' }} />
                            <span className="flex-1 truncate">{article.title}</span>
                            <ArrowIcon />
                          </Command.Item>
                        );
                      }
                      if (page) {
                        return (
                          <Command.Item key={id} value={`recent-${page.title}`} onSelect={() => navigate(page.href, id)} className={itemClass}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-stone-400" />
                            <span className="flex-1">{page.title}</span>
                            <ArrowIcon />
                          </Command.Item>
                        );
                      }
                      return null;
                    })}
                  </Command.Group>
                )}

                {/* Browse by Topic */}
                <Command.Group heading="Topics">
                  {categories.map(({ name, count }) => (
                    <Command.Item key={name} value={name} onSelect={() => setSelectedCategory(name)} className={itemClass}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: categoryColors[name] || '#78716c' }} />
                      <span className="flex-1 font-medium">{name}</span>
                      <span className="text-[11px] text-stone-400 tabular-nums">{count}</span>
                    </Command.Item>
                  ))}
                </Command.Group>

                {/* Jump to Section (on article pages) */}
                {sections.length > 0 && (
                  <Command.Group heading="Sections">
                    {sections.map((section) => (
                      <Command.Item key={section.id} value={`section-${section.title}`}
                        onSelect={() => { setOpen(false); document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                        className={itemClass}>
                        <span className="text-[11px] text-stone-400 font-mono flex-shrink-0">#</span>
                        <span className="flex-1 truncate">{section.title}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {/* Pages + Actions combined */}
                <Command.Group heading="Navigate">
                  {pages.map((page) => (
                    <Command.Item key={page.id} value={page.title} onSelect={() => navigate(page.href, page.id)} className={itemClass}>
                      <span className="flex-1">{page.title}</span>
                      <ArrowIcon />
                    </Command.Item>
                  ))}
                  <div className="h-px bg-stone-100 dark:bg-stone-800 mx-3 my-1" />
                  {actions.map((action) => (
                    <Command.Item key={action.id} value={action.title} onSelect={() => executeAction(action.action, action.id)} className={itemClass}>
                      <span className="flex-1">{action.title}</span>
                      {action.subtitle && <span className="text-[11px] text-stone-400">{action.subtitle}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              </>
            )}

            {/* === SEARCH / CATEGORY RESULTS === */}
            {showArticles && groupedArticles.map(([category, catArticles]) => (
              <Command.Group key={category} heading={`${category} (${catArticles.length})`}>
                {catArticles.map((article) => (
                  <Command.Item
                    key={article.id}
                    value={article.title}
                    onSelect={() => navigate(article.href, article.id)}
                    className={itemClass}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: categoryColors[article.category] || '#78716c' }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{article.title}</div>
                      <div className="text-xs text-stone-400 truncate mt-0.5">{article.description}</div>
                    </div>
                    <span className="text-[11px] text-stone-400 whitespace-nowrap flex-shrink-0 tabular-nums">{article.readTime}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>

          {/* Footer — minimal */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-stone-200/60 dark:border-stone-700/60">
            <div className="flex items-center gap-3 text-[11px] text-stone-400">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-px bg-stone-100 dark:bg-stone-800 rounded text-[10px] font-mono">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-px bg-stone-100 dark:bg-stone-800 rounded text-[10px] font-mono">↵</kbd>
                select
              </span>
            </div>
            <span className="text-[11px] font-serif italic text-stone-300 dark:text-stone-600">alumi</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
