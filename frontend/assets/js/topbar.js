// Top navigation bar. Adapts to auth state; hidden on display/kiosk pages.

import { h } from './dom.js';
import { icon } from './icons.js';
import { auth } from './auth.js';
import { navigate } from './router.js';
import { theme } from './theme.js';

export function renderTopbar(el, hidden = false) {
  if (!el) return;
  if (hidden) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }

  el.hidden = false;
  const signedIn = auth.isAuthenticated();
  const dark = theme.isDark();
  const path = location.pathname;
  const isCurrent = (prefix) => path === prefix || path.startsWith(`${prefix}/`);

  el.replaceChildren(
    h('div', { class: 'topbar__inner' },
      h('a', { href: '/', 'data-link': true, class: 'brand', 'aria-label': 'LineLess home' },
        h('span', { class: 'brand__mark', 'aria-hidden': 'true' }, 'L'),
        h('span', { class: 'brand__logo' }, 'LineLess'),
      ),
      h('nav', { class: 'topbar__nav', 'aria-label': 'Primary navigation' },
        h('a', { href: '/join', 'data-link': true, 'aria-current': isCurrent('/join') ? 'page' : undefined }, 'Find a queue'),
        signedIn ? h('a', { href: '/dashboard', 'data-link': true, 'aria-current': isCurrent('/dashboard') && !path.includes('/analytics') ? 'page' : undefined }, 'Dashboard') : null,
        signedIn ? h('a', { href: '/dashboard/analytics', 'data-link': true, 'aria-current': path.includes('/analytics') ? 'page' : undefined }, 'Analytics') : null,
      ),
      h('div', { class: 'topbar__actions' },
        h('button', {
          class: 'theme-toggle',
          type: 'button',
          'aria-label': dark ? 'Switch to light mode' : 'Switch to dark mode',
          'aria-pressed': dark ? 'false' : 'true',
          title: dark ? 'Switch to light mode' : 'Switch to dark mode',
          onclick: () => { theme.toggle(); renderTopbar(el, hidden); },
        }, dark ? icon('sun', { size: 17 }) : icon('moon', { size: 17 })),
        signedIn
          ? h('button', {
              class: 'btn btn--ghost btn--sm',
              type: 'button',
              onclick: () => { auth.signOut(); navigate('/'); },
            }, icon('logOut', { size: 15 }), 'Sign out')
          : h('a', { href: '/login', 'data-link': true, class: 'btn btn--ghost btn--sm' }, 'Business sign in'),
      ),
    ),
  );
}
