// Customer join flow: public directory and queue preview + join form.

import { h, clear, toast, spinner, emptyState } from '../dom.js';
import { api, ApiError } from '../api.js';
import { navigate } from '../router.js';

export function JoinDirectoryPage(app) {
  async function load() {
    clear(app);
    app.append(spinner());
    try {
      const { organizations } = await api.get('/directory');
      clear(app);
      app.append(
        h('div', { class: 'page' },
          h('header', { class: 'page__header' },
            h('h1', {}, 'Find a service'),
            h('p', { class: 'muted' }, 'Businesses publishing public queues with LineLess.'),
          ),
          organizations.length === 0
            ? emptyState(
                'No public queues yet',
                'Businesses appear here once they publish their queues. If you have a QR code or queue link, open it directly.',
                h('a', { href: '/', 'data-link': true, class: 'btn btn--ghost' }, 'Back to home'),
              )
            : h('ul', { class: 'card-list' },
                organizations.map((o) => h('li', {},
                  h('a', {
                    class: 'card card--link',
                    href: `/join?org=${encodeURIComponent(o.orgId)}`,
                    'data-link': true,
                  },
                    h('div', {},
                      h('strong', {}, o.name),
                      o.location ? h('span', { class: 'muted' }, ` · ${o.location}`) : null,
                    ),
                    h('span', { class: 'muted' }, 'View queues'),
                  ),
                )),
              ),
        ),
      );
    } catch (err) {
      showError(app, err);
    }
  }
  load();
  return null;
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
      status === 404 ? 'Not found' : 'Something went wrong',
      status === 404
        ? 'This queue does not exist or is no longer available.'
        : 'Could not reach LineLess. Check your connection and try again.',
      h('button', { class: 'btn btn--ghost', onclick: () => location.reload() }, 'Retry'),
    ),
  );
}

export function JoinQueuePage(app, params) {
  const { queueId } = params;

  async function load() {
    clear(app);
    app.append(spinner());
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
        ),
        h('div', { class: 'stat-row' },
          stat('Now serving', state.nowServingDisplay ?? '—'),
          stat('Waiting', String(state.waitingCount ?? 0)),
          stat('Avg. service', state.avgWaitMinutes ? `${state.avgWaitMinutes} min` : '—'),
        ),
        closed
          ? h('div', { class: 'card notice-card', role: 'status' },
              h('strong', {}, state.paused ? 'This queue is paused' : 'This queue is closed'),
              h('p', { class: 'muted' }, 'Check back later or ask the staff for details.'),
            )
          : buildForm(state),
      ),
    );
  }

  function buildForm(state) {
    const nameInput = h('input', { id: 'jn', name: 'name', type: 'text', maxlength: '80', autocomplete: 'name', required: true, placeholder: 'Your name' });
    const emailInput = h('input', { id: 'je', name: 'email', type: 'email', autocomplete: 'email', placeholder: 'you@example.com (optional)' });
    const phoneInput = h('input', { id: 'jp', name: 'phone', type: 'tel', autocomplete: 'tel', placeholder: 'Phone for alerts (optional)' });
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
          }, {
            headers: { 'Idempotency-Key': crypto.randomUUID() },
          });
          navigate(`/q/${encodeURIComponent(result.token)}`);
        } catch (err) {
          submit.disabled = false;
          submit.textContent = 'Join queue';
          if (err instanceof ApiError && err.code === 'DUPLICATE_JOIN') {
            toast('You are already in this queue.', 'warn');
          } else if (err instanceof ApiError && err.code === 'QUEUE_CLOSED') {
            toast('This queue just closed.', 'warn');
            load();
          } else if (err instanceof ApiError) {
            toast(err.message, 'error');
          } else {
            toast('Network error — check your connection and try again.', 'error');
          }
        }
      },
    },
      h('div', { class: 'field' },
        h('label', { for: 'jn' }, 'Name'),
        nameInput,
      ),
      h('div', { class: 'field' },
        h('label', { for: 'je' }, 'Email ', h('span', { class: 'muted' }, '(optional — for turn alerts)')),
        emailInput,
      ),
      h('div', { class: 'field' },
        h('label', { for: 'jp' }, 'Phone ', h('span', { class: 'muted' }, '(optional — for SMS alerts)')),
        phoneInput,
      ),
      submit,
      h('p', { class: 'muted form-note' }, 'No account needed. You will get a private link to track your spot.'),
    );
  }

  load();
  return null;
}
