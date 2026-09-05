// Theme management: light/dark mode with system preference detection,
// localStorage persistence, and no flash of incorrect theme.

const STORAGE_KEY = 'lineless.theme';

function getSystemPreference() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function getStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export const theme = {
  init() {
    const stored = getStoredTheme();
    const initial = stored || getSystemPreference();
    applyTheme(initial);
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable; theme still applies for this session
    }
    return next;
  },

  isDark() {
    return (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
  },

  current() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  },
};

// Apply theme immediately to prevent flash
theme.init();
