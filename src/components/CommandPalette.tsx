import { Command } from 'cmdk';
import { useState, useEffect, useCallback } from 'react';

// Article data - in a real app this would come from a CMS/API
const articles = [
  {
    id: 'mirtazapine',
    title: 'Mirtazapine: The Quiet Overachiever',
    description: 'A comprehensive clinical evidence review',
    category: 'Mental Health',
    href: '/articles/mirtazapine-guide',
    readTime: '12 min',
  },
  {
    id: 'nicotine',
    title: "Nicotine's Promising Health Benefits",
    description: 'A comprehensive research summary',
    category: 'Neuroscience',
    href: '/articles/nicotine-research',
    readTime: '18 min',
  },
];

const pages = [
  { id: 'home', title: 'Home', href: '/', icon: '🏠' },
  { id: 'articles', title: 'All Articles', href: '/articles', icon: '📰' },
  { id: 'deep-dives', title: 'Deep Dives', href: '/deep-dives', icon: '🔬' },
  { id: 'subscribe', title: 'Subscribe', href: '/subscribe', icon: '📧' },
];

const actions = [
  { id: 'theme', title: 'Toggle Dark Mode', icon: '🌓', action: 'toggleTheme' },
  { id: 'top', title: 'Back to Top', icon: '⬆️', action: 'scrollToTop' },
  { id: 'share', title: 'Share Page', icon: '📤', action: 'share' },
  { id: 'print', title: 'Print Article', icon: '🖨️', action: 'print' },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [recentlyUsed, setRecentlyUsed] = useState<string[]>([]);

  // Load recently used from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('cmdk-recent');
    if (stored) {
      setRecentlyUsed(JSON.parse(stored));
    }
  }, []);

  // Save recently used
  const addToRecent = useCallback((id: string) => {
    setRecentlyUsed((prev) => {
      const updated = [id, ...prev.filter((i) => i !== id)].slice(0, 5);
      localStorage.setItem('cmdk-recent', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };

    document.addEventListener('keydown', down);

    // Also listen for trigger buttons
    const triggers = document.querySelectorAll('#cmdkTrigger, #cmdkTriggerMobile');
    triggers.forEach((trigger) => {
      trigger.addEventListener('click', () => setOpen(true));
    });

    return () => {
      document.removeEventListener('keydown', down);
    };
  }, []);

  // Handle navigation
  const navigate = useCallback((href: string, id: string) => {
    addToRecent(id);
    setOpen(false);

    // Use View Transitions if available
    if ('startViewTransition' in document) {
      (document as any).startViewTransition(() => {
        window.location.href = href;
      });
    } else {
      window.location.href = href;
    }
  }, [addToRecent]);

  // Handle actions
  const executeAction = useCallback((action: string, id: string) => {
    addToRecent(id);
    setOpen(false);

    switch (action) {
      case 'toggleTheme':
        (window as any).toggleTheme?.();
        break;
      case 'scrollToTop':
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'share':
        if (navigator.share) {
          navigator.share({
            title: document.title,
            url: window.location.href,
          });
        } else {
          navigator.clipboard.writeText(window.location.href);
        }
        break;
      case 'print':
        window.print();
        break;
    }
  }, [addToRecent]);

  // Get current page sections for article pages
  const [sections, setSections] = useState<Array<{ id: string; title: string }>>([]);

  useEffect(() => {
    if (open) {
      const headings = document.querySelectorAll('article h2[id], article h3[id]');
      const sectionList = Array.from(headings).map((h) => ({
        id: h.id,
        title: h.textContent || '',
      }));
      setSections(sectionList);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="absolute left-1/2 top-[15%] -translate-x-1/2 w-full max-w-xl">
        <Command
          className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden"
          loop
        >
          {/* Input */}
          <div className="flex items-center gap-3 px-4 border-b border-stone-200 dark:border-stone-700">
            <svg
              className="w-5 h-5 text-stone-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" strokeWidth="2" />
              <path d="m21 21-4.35-4.35" strokeWidth="2" />
            </svg>
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search articles, pages, or actions..."
              className="flex-1 py-4 bg-transparent border-none outline-none text-base placeholder-stone-400"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex px-2 py-1 text-xs font-mono text-stone-400 bg-stone-100 dark:bg-stone-800 rounded">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-stone-500">
              No results found for "{search}"
            </Command.Empty>

            {/* Recently Used */}
            {!search && recentlyUsed.length > 0 && (
              <Command.Group heading="Recent" className="mb-2">
                {recentlyUsed.map((id) => {
                  const item =
                    articles.find((a) => a.id === id) ||
                    pages.find((p) => p.id === id) ||
                    actions.find((a) => a.id === id);
                  if (!item) return null;

                  if ('href' in item) {
                    return (
                      <Command.Item
                        key={id}
                        value={item.title}
                        onSelect={() => navigate(item.href, id)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/20"
                      >
                        {'icon' in item ? (
                          <span className="text-lg">{item.icon}</span>
                        ) : (
                          <span className="w-6 h-6 rounded bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-600">
                            {(item as any).category?.[0]}
                          </span>
                        )}
                        <span className="flex-1 truncate">{item.title}</span>
                        <span className="text-xs text-stone-400">↵</span>
                      </Command.Item>
                    );
                  }

                  return (
                    <Command.Item
                      key={id}
                      value={item.title}
                      onSelect={() => executeAction((item as any).action, id)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/20"
                    >
                      <span className="text-lg">{(item as any).icon}</span>
                      <span className="flex-1">{item.title}</span>
                      <span className="text-xs text-stone-400">↵</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Articles */}
            <Command.Group heading="Articles" className="mb-2">
              {articles.map((article) => (
                <Command.Item
                  key={article.id}
                  value={`${article.title} ${article.category} ${article.description}`}
                  onSelect={() => navigate(article.href, article.id)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/20"
                >
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-xs font-bold">
                    {article.category[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{article.title}</div>
                    <div className="text-xs text-stone-500 truncate">
                      {article.category} · {article.readTime}
                    </div>
                  </div>
                  <span className="text-xs text-stone-400">↵</span>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Current Page Sections (if any) */}
            {sections.length > 0 && (
              <Command.Group heading="Jump to Section" className="mb-2">
                {sections.map((section) => (
                  <Command.Item
                    key={section.id}
                    value={section.title}
                    onSelect={() => {
                      setOpen(false);
                      const el = document.getElementById(section.id);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/20"
                  >
                    <span className="text-stone-400">#</span>
                    <span className="flex-1 truncate">{section.title}</span>
                    <span className="text-xs text-stone-400">↵</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Pages */}
            <Command.Group heading="Pages" className="mb-2">
              {pages.map((page) => (
                <Command.Item
                  key={page.id}
                  value={page.title}
                  onSelect={() => navigate(page.href, page.id)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/20"
                >
                  <span className="text-lg">{page.icon}</span>
                  <span className="flex-1">{page.title}</span>
                  <span className="text-xs text-stone-400">↵</span>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Actions */}
            <Command.Group heading="Actions">
              {actions.map((action) => (
                <Command.Item
                  key={action.id}
                  value={action.title}
                  onSelect={() => executeAction(action.action, action.id)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/20"
                >
                  <span className="text-lg">{action.icon}</span>
                  <span className="flex-1">{action.title}</span>
                  <span className="text-xs text-stone-400">↵</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-stone-200 dark:border-stone-700 text-xs text-stone-400">
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
            <span className="text-primary-600 font-medium">Tune Health</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
