// Customer live queue status: position, people ahead, estimate, now serving.
// Updates arrive over WebSocket; a session refetch covers missed events.

import { h, clear, toast, spinner, emptyState } from '../dom.js';
import { api, ApiError } from '../api.js';
import { QueueSocket } from '../ws.js';

export function StatusPage(app, params) {
  const { token } = params;
  let socket = null;
  let state = null;

  async function load() {
    clear(app);
    app.append(spinner());
    try {
      state = await api.get(`/session/${encodeURIComponent(token)}`);
      clear(app);
      render();
    } catch (err) {
      showErrorPage(app, err);
      return;
    }
    socket = new QueueSocket(
      { scopeType: 'customer', token },
      async (msg) => {
        if (msg.type === 'QUEUE_CLOSED') {
          toast('This queue closed.', 'warn');
          await refresh();
          return;
        }
        await refresh();
      },
      (status) => {
        const live = document.querySelector('[data-live-status]');
        if (live) {
          live.textContent = status === 'live' ? 'LIVE' : status === 'connecting' ? 'CONNECTING…' : 'OFFLINE — RECONNECTING';
          live.className = `live-badge live-badge--${status}`;
        }
      },
    );
  }

  async function refresh() {
    try {
      state = await api.get(`/session/${encodeURIComponent(token)}`);
      render();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        socket?.close();
        showErrorPage(app, err);
      }
      // transient errors: keep showing last known state
    }
  }

  function render() {
    const yourTurn = state.state === 'CALLED';
    const done = state.state === 'SERVED' || state.state === 'LEFT';
    const bigNumber = yourTurn ? 'It\u2019s your turn' : state.display;

    const queueClosed = state.queueStatus === 'CLOSED';
    const paused = state.queuePaused;

    app.replaceChildren(
      h('div', { class: `page page--narrow status-page${yourTurn ? ' status-page--turn' : ''}` },
        h('header', { class: 'page__header page__header--center' },
          h('p', { class: 'eyebrow' }, state.orgName ?? state.queueName),
          h('h1', {}, state.queueName),
          h('span', { 'data-live-status': true, class: 'live-badge live-badge--connecting', role: 'status' }, 'CONNECTING…'),
        ),
        queueClosed || paused
          ? h('div', { class: 'card notice-card', role: 'alert' },
              h('strong', {}, paused ? 'Queue paused' : 'Queue closed'),
              h('p', { class: 'muted' },
                paused
                  ? 'The queue is temporarily paused. Your spot is safe — wait times will update when it resumes.'
                  : 'The queue closed. Staff will assist you directly.',
              ),
            )
          : null,
        done
          ? h('div', { class: 'card center-card', role: 'status' },
              h('h2', {}, state.state === 'SERVED' ? 'Done — thanks for waiting!' : 'You left the queue'),
              h('a', { href: '/join', 'data-link': true, class: 'btn btn--ghost' }, 'Join another queue'),
            )
          : h('div', { class: `turn-card card${yourTurn ? ' turn-card--active' : ''}`, role: 'status' },
              h('div', { class: 'turn-card__number', 'aria-label': 'Your ticket' }, bigNumber),
              yourTurn
                ? h('p', { class: 'turn-card__hint' }, 'Please go to the counter now.')
                : h('div', { class: 'turn-card__meta' },
                    h('div', {},
                      h('span', { class: 'stat__label' }, 'People ahead'),
                      h('span', { class: 'stat__value' }, String(state.peopleAhead)),
                    ),
                    h('div', {},
                      h('span', { class: 'stat__label' }, 'Estimated wait'),
                      h('span', { class: 'stat__value' },
                        state.estimatedWaitMinutes === null ? 'Paused' : `${state.estimatedWaitMinutes} min`,
                      ),
                    ),
                  ),
              h('p', { class: 'muted turn-card__note' },
                yourTurn ? '' : `Now serving ${state.nowServingDisplay ?? '—'} · estimate based on ${state.estimateBasis}`,
              ),
            ),
        h('button', {
          class: 'btn btn--danger btn--block',
          onclick: async () => {
            if (!confirm('Leave the queue? You will lose your spot.')) return;
            try {
              await api.post(`/session/${encodeURIComponent(token)}/leave`);
              socket?.close();
              app.replaceChildren(
                emptyState('You left the queue', 'Changed your mind? Join again any time.',
                  h('a', { href: '/join', 'data-link': true, class: 'btn btn--primary' }, 'Find a queue')),
              );
            } catch (err) {
              toast(err instanceof ApiError ? err.message : 'Could not leave the queue', 'error');
            }
          },
        }, 'Leave queue'),
      ),
    );
  }

  load();
  return () => socket?.close();
}

function showErrorPage(app, err) {
  clear(app);
  app.append(
    emptyState(
      err instanceof ApiError && err.status === 404 ? 'Session not found' : 'Connection problem',
      err instanceof ApiError && err.status === 404
        ? 'This queue session has expired or was removed.'
        : 'Could not reach LineLess. We will keep retrying.',
      h('a', { href: '/join', 'data-link': true, class: 'btn btn--primary' }, 'Find a queue'),
    ),
  );
}
