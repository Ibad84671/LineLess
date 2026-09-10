// Customer discovery + queue join flow.

import { h, clear, toast, spinner, emptyState } from '../dom.js';
import { api, ApiError } from '../api.js';
import { navigate } from '../router.js';
import { icon } from '../icons.js';

export function JoinDirectoryPage(app) {
  let organizations = [];
  const params = new URLSearchParams(location.search);
  let selectedOrgId = params.get('org');
  let query = params.get('q') ?? '';

  async function load() {
    clear(app);
    app.append(spinner('Finding available queues…'));
    try {
      const result = await api.get('/directory');
      organizations = result.organizations ?? [];
      clear(app);
      render();
    } catch (err) {
      showError(app, err);
    }
  }

  function render() {
    const selected = organizations.find((o) => o.orgId === selectedOrgId) ?? null;
    if (selectedOrgId && !selected) selectedOrgId = null;

    const search = h('input', {
      id: 'queue-search',
      type: 'search',
      autocomplete: 'off',
      'aria-label': 'Search businesses and services',
      placeholder: 'Search businesses, services or locations',
    });
    if (query) search.value = query;
    const list = h('div', { class: 'directory-list', 'aria-live': 'polite' });

    function draw(query = '') {
      const needle = query.trim().toLowerCase();
      const source = selected ? [selected] : organizations;
      const matches = source
        .map((org) => ({
          ...org,
          queues: (org.queues ?? []).filter((q) => !needle || [org.name, org.location, q.name, q.description, q.branchName, q.serviceName]
            .filter(Boolean).join(' ').toLowerCase().includes(needle)),
        }))
        .filter((org) => org.queues.length > 0 || (!needle && !selected));

      list.replaceChildren(
        ...(matches.length
          ? matches.map((org) => organizationCard(org))
          : [emptyState(
              'No matching queues',
              selected ? 'This business has no public queues matching your search.' : 'Try a different business, service or location.',
              selected ? h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { selectedOrgId = null; render(); } }, 'View all businesses') : null,
            )]),
      );
    }

    search.addEventListener('input', () => {
      query = search.value;
      draw(query);
    });

    app.append(
      h('div', { class: 'page' },
        h('header', { class: 'page__header' },
          h('p', { class: 'eyebrow' }, selected ? 'Business queues' : 'Public directory'),
          h('h1', {}, selected ? selected.name : 'Find a service'),
          h('p', { class: 'muted' }, selected
            ? 'Choose an available queue and join remotely. No account required.'
            : 'Find a public queue, see what is available, and join without waiting at the counter.'),
        ),
        h('div', { class: 'directory-toolbar' },
          h('div', { class: 'search-box' },
            icon('search', { size: 16 }),
            search,
          ),
          selected ? h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { selectedOrgId = null; render(); } }, 'All businesses') : null,
        ),
        list,
      ),
    );
    draw();
  }

  load();
  return null;
}

function organizationCard(org) {
  const openQueues = org.queues.filter((q) => q.status === 'OPEN' && !q.paused);
  return h('section', { class: 'directory-org' },
    h('div', {},
      h('div', { class: 'directory-org__meta' },
        h('strong', {}, org.name),
        org.location
          ? h('span', { class: 'org-loc' }, icon('mapPin', { size: 14 }), org.location)
          : null,
        h('span', { class: 'muted' }, `${openQueues.length} ${openQueues.length === 1 ? 'queue' : 'queues'} available`),
      ),
      h('div', { class: 'directory-org__queues' },
        org.queues.map((q) => queueLink(q)),
      ),
    ),
  );
}

function queueLink(q) {
  const open = q.status === 'OPEN' && !q.paused;
  return h('a', {
    class: 'directory-queue',
    href: open ? `/join/${encodeURIComponent(q.queueId)}` : '#',
    ...(open ? { 'data-link': true } : {}),
    'aria-disabled': open ? 'false' : 'true',
    onclick: open ? undefined : (e) => e.preventDefault(),
  },
    h('span', { class: 'directory-queue__info' },
      h('strong', {}, q.name),
      h('span', { class: 'muted' }, [q.serviceName, q.branchName].filter(Boolean).join(' · ') || 'Service queue'),
    ),
    h('span', { class: 'directory-queue__warm' },
      open
        ? h('span', { class: 'muted' }, icon('users', { size: 15 }), ` ${q.waitingCount ?? 0} waiting`)
        : null,
      h('span', { class: `badge ${open ? 'badge--open' : 'badge--closed'}` }, q.paused ? 'PAUSED' : q.status),
      open ? icon('arrowRight', { size: 15 }) : null,
    ),
  );
}

function stat(label, value) {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat__label' }, label),
    h('span', { class: 'stat__value' }, value),
  );
}

export function showError(app, err) {
  clear(app);
  const status = err instanceof ApiError ? err.status : 0;
  app.append(
    emptyState(
      status === 404 ? 'Not found' : 'Connection problem',
      status === 404
        ? 'This queue does not exist or is no longer available.'
        : 'LineLess could not reach the service. Check your connection and try again.',
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => location.reload() }, 'Try again'),
    ),
  );
}

export function JoinQueuePage(app, params) {
  const { queueId } = params;

  async function load() {
    clear(app);
    app.append(spinner('Loading queue…'));
    try {
      const state = await api.get(`/queues/${encodeURIComponent(queueId)}/public`);
      clear(app);
      render(state);
    } catch (err) {
      showError(app, err);
    }
  }

  function render(state) {
    const closed = state.status !== 'OPEN' || state.paused;
    app.replaceChildren(
      h('div', { class: 'page page--narrow' },
        h('header', { class: 'page__header' },
          h('p', { class: 'eyebrow' }, state.orgName ?? 'Queue'),
          h('h1', {}, state.name),
          state.description ? h('p', { class: 'muted' }, state.description) : null,
          h('p', { class: 'muted' }, [state.branchName, state.serviceName].filter(Boolean).join(' · ')),
        ),
        h('div', { class: 'stat-row' },
          stat('Now serving', state.nowServingDisplay ?? '—'),
          stat('Waiting', String(state.waitingCount ?? 0)),
          stat('Avg. service', state.avgServiceMinutes != null ? `${state.avgServiceMinutes} min` : '—'),
        ),
        closed
          ? h('div', { class: 'card notice-card', role: 'status' },
              h('strong', {}, state.paused ? 'This queue is paused' : 'This queue is closed'),
              h('p', { class: 'muted' }, state.paused
                ? 'New customers cannot join while service is paused. Your existing session, if any, remains unaffected.'
                : 'New customers cannot join this queue right now. Check back later or contact the business.'),
              h('a', { href: '/join', 'data-link': true, class: 'btn btn--ghost' }, 'Browse other queues'),
            )
          : buildForm(state),
      ),
    );
  }

  function buildForm() {
    const nameInput = h('input', { id: 'jn', name: 'name', type: 'text', maxlength: '80', autocomplete: 'name', required: true, placeholder: 'Your name' });
    const emailInput = h('input', { id: 'je', name: 'email', type: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
    const phoneInput = h('input', { id: 'jp', name: 'phone', type: 'tel', autocomplete: 'tel', placeholder: '+91…' });
    const submit = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, 'Join queue');

    return h('form', {
      class: 'card form-card',
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        submit.textContent = 'Joining…';
        try {
          const result = await api.post(`/queues/${encodeURIComponent(queueId)}/join`, {
            name: nameInput.value.trim() || undefined,
            email: emailInput.value.trim() || undefined,
            phone: phoneInput.value.trim() || undefined,
          }, { headers: { 'Idempotency-Key': crypto.randomUUID() } });
          navigate(`/q/${encodeURIComponent(result.token)}`);
        } catch (err) {
          submit.disabled = false;
          submit.textContent = 'Join queue';
          if (err instanceof ApiError && err.code === 'DUPLICATE_JOIN') toast('You are already in this queue.', 'warn');
          else if (err instanceof ApiError && err.code === 'QUEUE_CLOSED') { toast('This queue just closed.', 'warn'); load(); }
          else if (err instanceof ApiError && err.code === 'QUEUE_PAUSED') { toast('This queue is currently paused.', 'warn'); load(); }
          else if (err instanceof ApiError) toast(err.message, 'error');
          else toast('Network error — check your connection and try again.', 'error');
        }
      },
    },
      h('div', { class: 'field' }, h('label', { for: 'jn' }, 'Name'), nameInput),
      h('div', { class: 'field' }, h('label', { for: 'je' }, 'Email ', h('span', { class: 'muted' }, '(optional — for turn alerts)')), emailInput),
      h('div', { class: 'field' }, h('label', { for: 'jp' }, 'Phone ', h('span', { class: 'muted' }, '(optional — for SMS alerts)')), phoneInput),
      submit,
      h('p', { class: 'muted form-note' }, 'No account needed. After joining, LineLess gives you a private link to track your place.'),
    );
  }

  load();
  return null;
}
