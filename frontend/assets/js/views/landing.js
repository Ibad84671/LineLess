// Landing page — product-first, calm, premium SaaS presentation.
// Primary interaction is FIND A SERVICE: a real search that routes to the
// live directory, plus a real queue preview rendered from /directory data.

import { h } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { navigate } from '../router.js';

export function LandingPage(app) {
  let directory = [];

  async function load() {
    try {
      const result = await api.get('/directory');
      directory = result.organizations ?? [];
    } catch {
      directory = []; // keep hero usable; live card falls back to steps
    }
    render();
  }

  function render() {
    const firstOpen = findFirstOpenQueue(directory);
    app.replaceChildren(
      h('div', { class: 'page landing' },
        h('section', { class: 'hero' },
          h('div', { class: 'hero__copy' },
            h('div', { class: 'hero__badge' },
              h('span', { class: 'hero__badge-dot', 'aria-hidden': 'true' }),
              'Live virtual queue management',
            ),
            h('h1', { class: 'hero__title' },
              'Virtual queues, ', h('span', { class: 'accent' }, 'without'), ' the waiting room.',
            ),
            h('p', { class: 'hero__sub' },
              'Find a service, join a live queue from your phone, and get called when it is actually your turn. LineLess replaces the waiting room with a calm, realtime queue.',
            ),
            h('form', {
              class: 'hero-search', role: 'search',
              onsubmit: (e) => {
                e.preventDefault();
                const q = e.target.querySelector('input').value.trim();
                navigate(q ? `/join?q=${encodeURIComponent(q)}` : '/join');
              },
            },
              h('span', { class: 'hero-search__wrap' },
                icon('search', { class: 'hero-search__icon', size: 18 }),
                h('input', {
                  class: 'hero-search__input', type: 'search', name: 'q',
                  placeholder: 'Clinic, salon, service center…',
                  'aria-label': 'Search for a service, business or location',
                  autocomplete: 'off',
                }),
              ),
              h('button', { class: 'btn btn--primary btn--lg', type: 'submit' }, 'Find a service'),
            ),
            h('div', { class: 'hero__proof' },
              proof('check', 'Join remotely'),
              proof('clock', 'Track live'),
              proof('zap', 'Arrive on time'),
            ),
          ),
          h('div', { class: 'hero__visual', 'aria-label': 'A live LineLess queue' },
            firstOpen ? liveCard(firstOpen) : liveFallback(),
          ),
        ),
h('section', { class: 'section-block' },
          h('div', { class: 'section-heading' },
            h('p', { class: 'eyebrow' }, 'How it works'),
            h('h2', {}, 'A better waiting experience, end to end.'),
            h('p', { class: 'muted' }, 'One calm interface for customers. One focused console for staff. One live source of truth for the queue.'),
          ),
          h('div', { class: 'features' },
            featureCard('store', 'Join from anywhere', 'Scan a QR code or open a queue link. Customers get a secure place in line without crowding the reception desk.'),
            featureCard('zap', 'Know what is happening', 'Live position, people ahead and estimated wait remove the uncertainty from waiting.'),
            featureCard('activity', 'Run the counter faster', 'Staff can call, skip, recall, pause and resume from a keyboard-friendly queue console.'),
          ),
        ),
        h('section', { class: 'use-cases' },
          h('div', {},
            h('p', { class: 'eyebrow' }, 'Made for real queues'),
            h('h2', {}, 'From clinics to service desks.'),
            h('p', { class: 'muted' }, 'Wherever people wait for a service, LineLess keeps the room calmer and the operation clearer.'),
          ),
          h('div', { class: 'use-cases__grid' },
            useCase('Clinics', 'Checkups & walk-ins'),
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
            trustItem('zap', 'Realtime', 'WebSocket updates, not refresh buttons'),
            trustItem('check', 'Fairness', 'Atomic queue mutations prevent duplicate turns'),
            trustItem('shield', 'Privacy', 'Tenant-aware authorization on every staff operation'),
            trustItem('refresh', 'Resilience', 'Event-driven notifications with SQS + DLQ'),
          ),
        ),
        h('section', { class: 'final-cta' },
          h('div', {},
            h('p', { class: 'eyebrow' }, 'Ready when you are'),
            h('h2', {}, 'Your next queue should not need a waiting room.'),
            h('p', { class: 'muted' }, 'Find an existing queue or sign in to start managing one.'),
          ),
          h('div', { class: 'hero__actions' },
            h('a', { href: '/join', 'data-link': true, class: 'btn btn--primary' }, 'Find a service'),
            h('a', { href: '/login', 'data-link': true, class: 'btn btn--ghost' }, 'Business sign in'),
          ),
        ),
        h('footer', { class: 'footer footer--landing' },
          h('span', {}, h('strong', {}, 'LineLess'), h('span', { class: 'muted' }, ' — Join the Queue. Skip the Wait.')),
          h('span', {},
            h('a', { href: '/join', 'data-link': true, class: 'muted' }, 'Find a service'),
            ' · ',
            h('a', { href: '/login', 'data-link': true, class: 'muted' }, 'Business sign in'),
          ),
        ),
      ),
    );
  }
function findFirstOpenQueue(orgs) {
    for (const org of orgs) {
      const open = (org.queues ?? []).find((q) => q.status === 'OPEN' && !q.paused);
      if (open) return { ...org, queue: open };
    }
    return null;
  }

  function liveCard(org) {
    const q = org.queue;
    return h('div', { class: 'live-card' },
      h('div', { class: 'live-card__top' },
        h('span', { class: 'live-card__org' }, org.name),
        h('span', { class: 'live-badge live-badge--live', role: 'status' }, 'LIVE'),
      ),
      h('p', { class: 'muted live-card__title' }, q.name),
      h('div', { class: 'live-card__body' },
        h('div', {},
          h('span', { class: 'section-label' }, 'Waiting'),
          h('div', { class: 'live-card__number' }, String(q.waitingCount ?? 0)),
        ),
        h('div', { class: 'live-card__meta' },
          h('div', { class: 'live-card__meta-row' },
            icon('users', { size: 16 }),
            h('span', {}, 'People ahead of you: '),
            h('strong', {}, String(Math.max(0, (q.waitingCount ?? 0) - 1))),
          ),
          h('div', { class: 'live-card__meta-row' },
            icon('clock', { size: 16 }),
            h('span', {}, 'Join to track your place — no account needed'),
          ),
        ),
      ),
      h('a', { class: 'btn btn--primary btn--block', href: `/join/${encodeURIComponent(q.queueId)}`, 'data-link': true }, 'Join this queue'),
    );
  }

  function liveFallback() {
    return h('div', { class: 'live-card' },
      h('div', { class: 'live-card__top' },
        h('span', { class: 'live-card__org' }, 'How it works'),
        h('span', { class: 'live-badge live-badge--connecting' }, 'READY'),
      ),
      h('div', { class: 'live-card__body' },
        liveStep('1', 'Search and find the service you need'),
        liveStep('2', 'Join the queue remotely — no account needed'),
        liveStep('3', 'Track your place live and arrive when it matters'),
      ),
      h('p', { class: 'muted live-card__placeholder' }, 'When a business publishes a public queue, its live numbers appear right here.'),
    );
  }

  function liveStep(num, label) {
    return h('div', { class: 'live-card__meta-row' },
      h('span', { class: 'live-step__n' }, num),
      h('span', {}, label),
    );
  }

  function proof(iconName, label) {
    return h('div', { class: 'hero__proof-item' }, icon(iconName, { size: 16 }), h('strong', {}, label));
  }

  function featureCard(iconName, title, body) {
    return h('article', { class: 'feature-card' },
      h('div', { class: 'feature-card__icon', 'aria-hidden': 'true' }, icon(iconName, { size: 20 })),
      h('h3', {}, title),
      h('p', { class: 'muted' }, body),
    );
  }

  function useCase(title, body) {
    return h('div', { class: 'use-case' }, h('strong', {}, title), h('span', { class: 'muted' }, body));
  }

  function trustItem(iconName, title, body) {
    return h('div', { class: 'trust__item' },
      icon(iconName, { size: 18 }),
      h('strong', {}, title),
      h('span', { class: 'muted' }, body),
    );
  }

  load();
  return null;
}