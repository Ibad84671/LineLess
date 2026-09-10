// Customer live queue status: position, people ahead, estimate, now serving.
// Updates arrive over WebSocket; a session refetch covers missed events.

import { h, clear, toast, spinner, emptyState } from '../dom.js';
import { api, ApiError } from '../api.js';
import { QueueSocket } from '../ws.js';
import { icon } from '../icons.js';

export function StatusPage(app, params) {
  const { token } = params;
  let socket = null;
  let state = null;
  let liveStatus = 'connecting';
  let lastUpdated = null;
  let leftLocally = false; // set when the customer leaves; blocks late refreshes

  async function load() {
    clear(app);
    app.append(spinner('Loading your queue status…'));
    try {
      state = await api.get(`/session/${encodeURIComponent(token)}`);
      lastUpdated = new Date();
      clear(app);
      render();
    } catch (err) {
      showErrorPage(app, err);
      return;
    }

    socket = new QueueSocket(
      { scopeType: 'customer', token },
      async (msg) => {
        if (leftLocally) return;
        if (msg.type === 'QUEUE_CLOSED') toast('This queue closed.', 'warn');
        await refresh();
      },
      (status) => {
        liveStatus = status;
        const live = document.querySelector('[data-live-status]');
        if (live) {
          live.textContent = status === 'live' ? 'LIVE' : status === 'offline' ? 'OFFLINE - RECONNECTING' : 'CONNECTING…';
          live.className = `live-badge live-badge--${status}`;
        }
      },
    );
  }

  async function refresh() {
    if (leftLocally) return;
    try {
      state = await api.get(`/session/${encodeURIComponent(token)}`);
      lastUpdated = new Date();
      render();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        socket?.close();
        // If the customer just left, the session is legitimately gone — the
        // leave handler already rendered the confirmation state. Only an
        // unexpected 404 (expired/removed session) shows the error page.
        if (!leftLocally) showErrorPage(app, err);
      }
    }
  }

  function render() {
    const yourTurn = state.state === 'CALLED';
    const serving = state.state === 'SERVED';
    const left = state.state === 'LEFT';
    const done = serving || left;
    const queueClosed = state.queueStatus === 'CLOSED';
    const paused = state.queuePaused;
    const approaching = !yourTurn && !done && state.peopleAhead <= 3 && state.peopleAhead > 0;
    const timeLabel = lastUpdated
      ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : '';

    app.replaceChildren(
      h('div', { class: `page status-page${yourTurn ? ' status-page--turn' : ''}${approaching ? ' status-page--approaching' : ''}` },
        h('header', { class: 'status-page__header' },
          h('div', { class: 'status-page__org' },
            h('p', { class: 'eyebrow' }, state.orgName ?? 'Queue'),
            h('h1', {}, state.queueName),
          ),
          h('div', { class: 'status-page__actions' },
            h('span', { 'data-live-status': true, class: `live-badge live-badge--${liveStatus}`, role: 'status' },
              liveStatus === 'live' ? 'LIVE' : liveStatus === 'offline' ? 'OFFLINE - RECONNECTING' : 'CONNECTING…'),
            timeLabel ? h('span', { class: 'muted live-updated' }, icon('clock', { size: 13 }), timeLabel) : null,
          ),
        ),
        queueClosed || paused
          ? h('div', { class: 'card notice-card', role: 'alert' },
              h('strong', {}, paused ? 'Queue paused' : 'Queue closed'),
              h('p', { class: 'muted' }, paused
                ? 'The queue is temporarily paused. Your spot is safe.'
                : 'The queue closed. Staff will assist you directly.'),
            )
          : null,
        done
          ? h('div', { class: 'status-done', role: 'status' },
              h('div', { class: `status-done__icon${serving ? ' status-done__icon--success' : ''}` },
                serving ? icon('check', { size: 30 }) : icon('x', { size: 30 })),
              h('h2', {}, serving ? 'Done - thanks for waiting!' : 'You left the queue'),
              h('p', { class: 'muted' }, serving ? 'Your queue session is complete.' : 'Your place has been released.'),
              h('a', { href: '/join', 'data-link': true, class: 'btn btn--primary' }, 'Find another queue'),
            )
          : null,
!done
            ? h('div', { class: `status-card${yourTurn ? ' status-card--turn' : ''}${approaching ? ' status-card--approaching' : ''}`, role: 'status', 'aria-live': yourTurn ? 'assertive' : 'polite' },
                h('div', { class: 'status-card__ticket' },
                  h('span', { class: 'status-card__label' }, yourTurn ? 'YOUR TURN' : 'YOUR TICKET'),
                  h('strong', { class: 'status-card__number', 'aria-label': yourTurn ? 'Your turn now' : `Ticket ${state.display}` }, state.display),
                ),
                !yourTurn
                  ? h('div', { class: 'status-card__progress' },
                      h('div', { class: 'status-card__progress-track' },
                        h('div', {
                          class: 'status-card__progress-fill',
                          style: `width: ${Math.max(5, 100 - (state.peopleAhead * 100 / Math.max(state.peopleAhead + state.waitingCount || 1, 1)))}%`,
                        }),
                      ),
                    )
                  : null,
                h('div', { class: 'status-card__stats' },
                  h('div', { class: 'status-card__stat' },
                    h('span', { class: 'status-card__stat-label' }, icon('users', { size: 14 }), 'People ahead'),
                    h('strong', { class: 'status-card__stat-value' }, String(state.peopleAhead)),
                  ),
                  h('div', { class: 'status-card__stat' },
                    h('span', { class: 'status-card__stat-label' }, icon('clock', { size: 14 }), 'Est. wait'),
                    h('strong', { class: 'status-card__stat-value' }, state.estimatedWaitMinutes === null ? 'Paused' : `~${state.estimatedWaitMinutes} min`),
                  ),
                  h('div', { class: 'status-card__stat' },
                    h('span', { class: 'status-card__stat-label' }, icon('user', { size: 14 }), 'Now serving'),
                    h('strong', { class: 'status-card__stat-value' }, state.nowServingDisplay ?? '--'),
                  ),
                ),
                approaching
                  ? h('p', { class: 'status-card__hint status-card__hint--warn' }, 'You are almost up - get ready to head to the counter.')
                  : null,
                yourTurn
                  ? h('p', { class: 'status-card__hint status-card__hint--turn' }, 'Please go to the counter now.')
                  : null,
                !yourTurn && !approaching
                  ? h('p', { class: 'status-card__hint muted' }, `Estimate based on ${state.estimateBasis}.`)
                  : null,
              )
            : null,
            !done
              ? h('button', {
                  class: 'btn btn--danger btn--block',
                  type: 'button',
                  onclick: async (e) => {
                    if (!confirm('Leave the queue? You will lose your spot.')) return;
                    const button = e.currentTarget;
                    button.disabled = true;
                    button.textContent = 'Leaving…';
                    leftLocally = true; // the leave DELETEs the session; ignore late WS refreshes
                    try {
                      await api.post(`/session/${encodeURIComponent(token)}/leave`);
                      socket?.close();
                      app.replaceChildren(emptyState(
                        'You left the queue',
                        'Changed your mind? Join again any time.',
                        h('a', { href: '/join', 'data-link': true, class: 'btn btn--primary' }, 'Find a queue'),
                      ));
                    } catch (err) {
                      leftLocally = false; // leave failed — still in the queue
                      button.disabled = false;
                      button.textContent = 'Leave queue';
                      toast(err instanceof ApiError ? err.message : 'Could not leave the queue', 'error');
                    }
                  },
                }, icon('x', { size: 15 }), 'Leave queue')
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
      'search',
    ));
  }

  load();
  return () => socket?.close();
}