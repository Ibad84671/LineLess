// Landing page — communicates the value proposition in the first screen.

import { h } from '../dom.js';

export function LandingPage(app) {
  const el = h('div', { class: 'page landing' },
    h('section', { class: 'hero' },
      h('div', { class: 'hero__glow', 'aria-hidden': 'true' }),
      h('p', { class: 'eyebrow' }, 'Live virtual queues'),
      h('h1', { class: 'hero__title' },
        'Stop waiting ', h('span', { class: 'text-gradient' }, 'in line'), '.',
      ),
      h('p', { class: 'hero__sub' },
        'Join a queue from your phone, watch your place move in real time, and walk in exactly when it is your turn. No crowd. No clipboard. No guesswork.',
      ),
      h('div', { class: 'hero__actions' },
        h('a', { href: '/join', 'data-link': true, class: 'btn btn--primary btn--lg' }, 'Find a service'),
        h('a', { href: '/login', 'data-link': true, class: 'btn btn--ghost btn--lg' }, 'I\u2019m a business'),
      ),
    ),
    h('section', { class: 'features', 'aria-label': 'How LineLess works' },
      featureCard('01', 'Join remotely', 'Scan a QR code or open a queue link, take your number, and wait wherever you are.'),
      featureCard('02', 'Track live', 'Your position, people ahead, and estimated wait update instantly over a live connection.'),
      featureCard('03', 'Show up on time', 'Get an alert before your turn and arrive exactly when the counter is ready.'),
    ),
    h('section', { class: 'trust' },
      h('h2', {}, 'Built for counters, not conference rooms'),
      h('p', { class: 'muted' },
        'Clinics, salons, repair centers, government counters, service desks — any business where people wait in line. Staff run the queue from a fast keyboard-first console; customers see a calm, live status page.',
      ),
      h('div', { class: 'trust__grid' },
        h('div', { class: 'trust__item' }, h('strong', {}, 'Real-time engine'), h('span', { class: 'muted' }, 'WebSocket events, not refresh buttons')),
        h('div', { class: 'trust__item' }, h('strong', {}, 'Fair by design'), h('span', { class: 'muted' }, 'Concurrency-safe queue operations')),
        h('div', { class: 'trust__item' }, h('strong', {}, 'Private'), h('span', { class: 'muted' }, 'No account needed to join a queue')),
      ),
    ),
    h('footer', { class: 'footer' },
      h('p', {}, 'LineLess — Join the Queue. Skip the Wait.'),
    ),
  );
  app.replaceChildren(el);
  return null;
}

function featureCard(num, title, body) {
  return h('article', { class: 'card feature-card' },
    h('span', { class: 'feature-card__num', 'aria-hidden': 'true' }, num),
    h('h3', {}, title),
    h('p', { class: 'muted' }, body),
  );
}
