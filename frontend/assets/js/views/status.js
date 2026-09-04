// Customer live queue status: position, people ahead, estimate, now serving.
// Updates arrive over WebSocket; a session refetch covers missed events.

import { h, clear, toast, spinner, emptyState } from '../dom.js';
import { api, ApiError } from '../api.js';
import { QueueSocket } from '../ws.js';

export function StatusPage(app, params) {
  const { token } = params;
  let socket = null;
  let state = null;
  let liveStatus = 'connecting';

  async function load() {
    clear(app);
    app.append(spinner('Loading your queue status…'));
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
        if (msg.type === 'QUEUE_CLOSED') toast('This queue closed.', 'warn');
        await refresh();
      },
      (status) => {
        liveStatus = status;
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
      // Keep the last known state during transient failures.
    }
  }

  function render() {
    const yourTurn = state.state === 'CALLED';
    const done = state.state === 'SERVED' || state.state === 'LEFT';
    const queueClosed = state.queueStatus === 'CLOSED';
    const paused = state.queuePaused;

    app.replaceChildren(
      h('div', { class: `page page--narrow status-page${yourTurn ? ' status-page--turn' : ''}` },
        h('header', { class: 'page__header page__header--center' },
          h('p', { class: 'eyebrow' }, state.orgName ?? state.queueName),
          h('h1', {}, state.queueName),
          h('span', { 'data-live-status': true, class: `live-badge live-badge--${liveStatus}`, role: 'status' },
            liveStatus === 'live' ? 'LIVE' : liveStatus === 'offline' ? 'OFFLINE — RECONNECTING' : 'CONNECTING…'),
        ),
        queueClosed || paused
          ? h('div', { class: 'card notice-card', role: 'alert' },
              h('strong', {}, paused ? 'Queue paused' : 'Queue closed'),
              h('p', { class: 'muted' }, paused
                ? 'The queue is temporarily paused. Your spot is safe — wait times will update when it resumes.'
                : 'The queue closed. Staff will assist you directly.'),
            )
          : null,
        done
          ? h('div', { class: 'card center-card', role: 'status' },
              h('h2', {}, state.state === 'SERVED' ? 'Done — thanks for waiting!' : 'You left the queue'),
              h('p', { class: 'muted' }, state.state === 'SERVED' ? 'Your queue session is complete.' : 'Your place in the queue has been released.'),
              h('a', { href: '/join', 'data-link': true, class: 'btn btn--ghost' }, 'Join another queue'),
            )
          : h('div', { class: `turn-card card${yourTurn ? ' turn-card--active' : ''}`, role: 'status', 'aria-live': yourTurn ? 'assertive' : 'polite' },
              h('div', { class: 'turn-card__number', 'aria-label': yourTurn ? 'Your turn' : `Your ticket ${state.display}` }, yourTurn ? 'It’s your turn' : state.display),
              yourTurn
                ? h('p', { class: 'turn-card__hint' }, 'Please go to the counter now.')
                : h('div', { class: 'turn-card__meta' },
                    h('div', {},
                      h('span', { class: 'stat__label' }, 'People ahead'),
                      h('span', { class: 'stat__value' }, String(state.peopleAhead)),
                    ),
                    h('div', {},
                      h('span', { class: 'stat__label' }, 'Estimated wait'),
                      h('span', { class: 'stat__value' }, state.estimatedWaitMinutes === null ? 'Paused' : `${state.estimatedWaitMinutes} min`),
                    ),
                  ),
              h('p', { class: 'muted turn-card__note' }, yourTurn ? '' : `Now serving ${state.nowServingDisplay ?? '—'} · estimate based on ${state.estimateBasis}`),
            ),
        !done
          ? h('button', {
              class: 'btn btn--danger btn--block',
              type: 'button',
              onclick: async (e) => {
                if (!confirm('Leave the queue? You will lose your spot.')) return;
                const button = e.currentTarget;
                button.disabled = true;
                button.textContent = 'Leaving…';
                try {
                  await api.post(`/session/${encodeURIComponent(token)}/leave`);
                  socket?.close();
                  app.replaceChildren(emptyState(
                    'You left the queue',
                    'Changed your mind? Join again any time.',
                    h('a', { href: '/join', 'data-link': true, class: 'btn btn--primary' }, 'Find a queue'),
                  ));
                } catch (err) {
                  button.disabled = false;
                  button.textContent = 'Leave queue';
                  toast(err instanceof ApiError ? err.message : 'Could not leave the queue', 'error');
                }
              },
            }, 'Leave queue')
          : null,
      ),
    );
  }

  function showErrorPage(target, err) {
    clear(target);
    target.append(emptyState(
      err instanceof ApiError && err.status === 404 ? 'Session not found' : 'Connection problem',
      err instanceof ApiError && err.status === 404
        ? 'This queue session has expired or was removed.'
        : 'LineLess could not reach the service. Check your connection and try again.',
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => load() }, 'Try again'),
    ));
  }

  load();
  return () => socket?.close();
}
