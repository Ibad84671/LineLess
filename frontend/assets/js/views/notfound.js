// 404 view.

import { h } from '../dom.js';
import { emptyState } from '../dom.js';

export function NotFoundPage(app) {
  app.replaceChildren(
    emptyState(
      'Page not found',
      'The page you are looking for does not exist or has moved.',
      h('a', { href: '/', 'data-link': true, class: 'btn btn--primary' }, 'Back to home'),
    ),
  );
  return null;
}
