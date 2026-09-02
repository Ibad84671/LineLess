// Landing page — product-first, calm, premium SaaS presentation.

import { h } from '../dom.js';

export function LandingPage(app) {
  const el = h('div', { class: 'page landing' },
    h('section', { class: 'hero hero--split' },
      h('div', { class: 'hero__copy' },
        h('div', { class: 'hero__badge' },
          h('span', { class: 'hero__badge-dot', 'aria-hidden': 'true' }),
          'Live queue management',
        ),
        h('p', { class: 'eyebrow' }, 'For modern service businesses'),
        h('h1', { class: 'hero__title' },
          'Skip the line. ', h('span', { class: 'text-gradient' }, 'Keep moving.'),
        ),
        h('p', { class: 'hero__sub' },
          'LineLess lets customers join remotely, follow their place in real time, and arrive when it actually matters. Give your team a faster, calmer way to run the queue.',
        ),
        h('div', { class: 'hero__actions' },
          h('a', { href: '/join', 'data-link': true, class: 'btn btn--primary btn--lg' }, 'Find a queue', h('span', { 'aria-hidden': 'true' }, '→')),
          h('a', { href: '/login', 'data-link': true, class: 'btn btn--ghost btn--lg' }, 'Run a business'),
        ),
        h('div', { class: 'hero__proof' },
          proof('01', 'Join remotely'),
          proof('02', 'Track live'),
          proof('03', 'Arrive on time'),
        ),
      ),
      h('div', { class: 'hero__visual', 'aria-label': 'LineLess live queue preview' },
        h('div', { class: 'hero-window' },
          h('div', { class: 'hero-window__top' },
            h('div', { class: 'hero-window__dots', 'aria-hidden': 'true' }, h('span'), h('span'), h('span')),
            h('span', { class: 'live-badge' }, '● LIVE'),
          ),
          h('div', { class: 'hero-window__body' },
            h('div', { class: 'hero-window__label' }, 'CITY CARE CLINIC'),
            h('h2', {}, 'General consultation'),
            h('div', { class: 'queue-number' },
              h('span', { class: 'muted' }, 'YOU ARE'),
              h('strong', {}, '#47'),
            ),
            h('div', { class: 'queue-meta' },
              miniStat('Ahead', '6 people'),
              miniStat('Est. wait', '~18 min'),
            ),
            h('div', { class: 'queue-progress' },
              h('div', { class: 'queue-progress__track' }, h('div', { class: 'queue-progress__fill' })),
              h('span', { class: 'muted' }, 'Moving steadily'),
            ),
          ),
        ),
        h('div', { class: 'hero-float hero-float--top' },
          h('span', { class: 'hero-float__icon' }, '✓'),
          h('div', {}, h('strong', {}, 'Turn approaching'), h('span', {}, 'You are almost up')),
        ),
        h('div', { class: 'hero-float hero-float--bottom' },
          h('span', { class: 'hero-float__pulse' }),
          h('span', {}, 'Realtime connected'),
        ),
      ),
    ),
    h('section', { class: 'section-block' },
      h('div', { class: 'section-heading' },
        h('p', { class: 'eyebrow' }, 'Simple for everyone'),
        h('h2', {}, 'A better waiting experience, end to end.'),
        h('p', { class: 'muted' }, 'One calm interface for customers. One focused console for staff. One live source of truth for the queue.'),
      ),
      h('div', { class: 'features' },
        featureCard('01', 'Join from anywhere', 'Scan a QR code or open a queue link. Customers get a secure place in line without crowding the reception desk.'),
        featureCard('02', 'Know what is happening', 'Live position, people ahead and estimated wait remove the uncertainty from waiting.'),
        featureCard('03', 'Run the counter faster', 'Staff can call, skip, recall, pause and resume from a keyboard-friendly queue console.'),
      ),
    ),
    h('section', { class: 'use-cases card' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Made for real queues'),
        h('h2', {}, 'From clinics to service desks.'),
        h('p', { class: 'muted' }, 'Wherever people wait for a service, LineLess keeps the room calmer and the operation clearer.'),
      ),
      h('div', { class: 'use-cases__grid' },
        useCase('Clinics', 'Appointments & walk-ins'),
        useCase('Salons', 'Stylists & service chairs'),
        useCase('Service centers', 'Repairs & support desks'),
        useCase('Government', 'Public service counters'),
      ),
    ),
    h('section', { class: 'trust' },
      h('div', { class: 'trust__header' },
        h('div', {}, h('p', { class: 'eyebrow' }, 'Built for reliability'), h('h2', {}, 'Fast on the front. Careful underneath.')),
        h('p', { class: 'muted' }, 'Serverless AWS architecture keeps queue state durable, mutations concurrency-safe, and updates realtime.'),
      ),
      h('div', { class: 'trust__grid' },
        trustItem('Realtime', 'WebSocket updates, not refresh buttons'),
        trustItem('Fairness', 'Atomic queue mutations prevent duplicate turns'),
        trustItem('Privacy', 'Tenant-aware authorization on every staff operation'),
        trustItem('Resilience', 'Event-driven notifications with SQS + DLQ'),
      ),
    ),
    h('section', { class: 'final-cta card' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Ready when you are'), h('h2', {}, 'Your next queue should not need a waiting room.'), h('p', { class: 'muted' }, 'Find an existing queue or sign in to start managing one.' )),
      h('div', { class: 'hero__actions' },
        h('a', { href: '/join', 'data-link': true, class: 'btn btn--primary' }, 'Find a queue'),
        h('a', { href: '/login', 'data-link': true, class: 'btn btn--ghost' }, 'Business sign in'),
      ),
    ),
    h('footer', { class: 'footer footer--landing' },
      h('span', {}, 'LineLess'),
      h('span', { class: 'muted' }, 'Join the Queue. Skip the Wait.'),
    ),
  );
  app.replaceChildren(el);
  return null;
}

function proof(num, label) {
  return h('div', { class: 'hero__proof-item' }, h('span', {}, num), h('strong', {}, label));
}

function miniStat(label, value) {
  return h('div', { class: 'queue-meta__item' }, h('span', { class: 'muted' }, label), h('strong', {}, value));
}

function featureCard(num, title, body) {
  return h('article', { class: 'card feature-card' },
    h('span', { class: 'feature-card__num', 'aria-hidden': 'true' }, num),
    h('h3', {}, title),
    h('p', { class: 'muted' }, body),
    h('span', { class: 'feature-card__arrow', 'aria-hidden': 'true' }, '↗'),
  );
}

function useCase(title, body) {
  return h('div', { class: 'use-case' }, h('strong', {}, title), h('span', { class: 'muted' }, body));
}

function trustItem(title, body) {
  return h('div', { class: 'trust__item' }, h('strong', {}, title), h('span', { class: 'muted' }, body));
}
