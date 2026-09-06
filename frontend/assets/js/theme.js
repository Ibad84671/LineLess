// Theme management: light/dark mode with system preference detection,
// localStorage persistence, and no flash of incorrect theme.

const STORAGE_KEY = 'lineless.theme';
const META_THEME = { dark: '#0b0e14', light: '#f6f8fb' };

function getSystemPreference() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function getStoredTheme() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_THEME[next]);
}

export const theme = {
  init() {
    applyTheme(getStoredTheme() || getSystemPreference());
  },

  toggle() {
    const next = this.isDark() ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* session-only fallback */ }
    return next;
  },

  isDark() { return (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark'; },
  current() { return document.documentElement.getAttribute('data-theme') || 'dark'; },
};

theme.init();
