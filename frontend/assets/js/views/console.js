// Staff live queue console: queue board + CALL NEXT / SKIP / RECALL /
// PAUSE / RESUME / CLOSE controls. Keyboard-first, real-time via WebSocket.

import { h, clear, toast, spinner } from '../dom.js';
import { api, ApiError } from '../api.js';
import { QueueSocket } from '../ws.js';
import { showError } from './join.js';

export function QueueConsolePage(app, params) {
  const { queueId } = params;
  let socket = null;
  let state = null;
  let actionLock = false;

  async function load() {
    clear(app);
    app.append(spinner());
    try {
      state = await api.get(`/queues/${encodeURIComponent(queueId)}/state`);
      clear(app);
      render();
    } catch (err) {
      showError(app, err);
      return;
    }
    socket = new QueueSocket({ scopeType: 'queue', queueId }, refresh, (status) => {
      const badge = document.querySelector('[data-console-status]');
      if (badge) badge.textContent = status === 'live' ? 'LIVE' : status === 'connecting' ? 'CONNECTING…' : 'OFFLINE';
    });
  }

  async function refresh() {
    try {
      state = await api.get(`/queues/${encodeURIComponent(queueId)}/state`);
      render();
    } catch { /* keep last state on transient errors */ }
  }

  async function mutate(path, confirmText) {
    if (actionLock) return;
    if (confirmText && !confirm(confirmText)) return;
    actionLock = true;
    try {
      await api.post(`/queues/${encodeURIComponent(queueId)}/${path}`);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STALE_STATE') {
        toast('Queue just changed — refreshing state.', 'warn');
        await refresh();
      } else {
        toast(err instanceof ApiError ? err.message : 'Operation failed', 'error');
      }
      actionLock = false;
      return;
    }
    actionLock = false;
  }

  function render() {
    const open = state.status === 'OPEN';
    const paused = state.paused;

    app.replaceChildren(
      h('div', { class: 'page console' },
        h('header', { class: 'page__header console__header' },
          h('div', {},
            h('p', { class: 'eyebrow' }, state.orgName ?? 'Queue console'),
            h('h1', {}, state.name),
          ),
          h('div', { class: 'console__badges' },
            h('span', { 'data-console-status': true, class: 'live-badge live-badge--connecting' }, 'CONNECTING…'),
            h('span', { class: `badge ${open ? (paused ? 'badge--paused' : 'badge--open') : 'badge--closed'}` },
              open ? (paused ? 'PAUSED' : 'OPEN') : 'CLOSED'),
          ),
        ),
        h('div', { class: 'stat-row' },
          kpi('Waiting', String(state.waitingCount)),
          kpi('Now serving', state.nowServingDisplay ?? '—'),
          kpi('Est. wait', state.waitingCount > 0 ? `${state.estimatedWaitMinutes} min` : '—'),
          kpi('Avg. service', state.avgServiceMinutes ? `${state.avgServiceMinutes} min` : '—'),
        ),
        h('div', { class: 'console__controls', role: 'toolbar', 'aria-label': 'Queue controls' },
          h('button', { class: 'btn btn--primary btn--lg', disabled: !open || paused, onclick: () => mutate('next') }, 'CALL NEXT'),
          h('button', { class: 'btn btn--ghost', disabled: !state.nowServing || !open || paused, onclick: () => mutate('recall') }, 'RECALL'),
          h('button', { class: 'btn btn--ghost', disabled: !state.nowServing || !open || paused, onclick: () => mutate('skip', 'Skip the current customer?') }, 'SKIP'),
          open
            ? (paused
                ? h('button', { class: 'btn btn--ghost', onclick: () => mutate('resume') }, 'RESUME')
                : h('button', { class: 'btn btn--ghost', onclick: () => mutate('pause') }, 'PAUSE'))
            : h('button', { class: 'btn btn--ghost', onclick: () => mutate('reopen') }, 'REOPEN QUEUE'),
          open
            ? h('button', { class: 'btn btn--danger', onclick: () => mutate('close', 'Close this queue? Waiting customers will be notified.') }, 'CLOSE QUEUE')
            : null,
          h('a', { class: 'btn btn--ghost', href: `/display/${encodeURIComponent(queueId)}`, 'data-link': true }, 'DISPLAY VIEW'),
        ),
        h('div', { class: 'console__board' },
          h('section', { class: 'card console__current', 'aria-label': 'Current customer' },
            h('h2', { class: 'section-label' }, 'CURRENT'),
            h('div', { class: 'console__big' }, state.nowServingDisplay ?? '—'),
            state.nowServingDisplay
              ? h('p', { class: 'muted' }, 'Being served')
              : h('p', { class: 'muted' }, 'Call next to start'),
          ),
          h('section', { class: 'card', 'aria-label': 'Waiting customers' },
            h('h2', { class: 'section-label' }, 'WAITING'),
            state.waitingCount === 0
              ? h('p', { class: 'muted console__empty' }, 'No one waiting.')
              : h('ol', { class: 'queue-board' },
                  state.entries.filter((e) => e.state === 'WAITING').map((e) =>
                    h('li', { class: 'queue-board__item' },
                      h('span', { class: 'queue-board__ticket' }, e.display),
                      h('span', { class: 'muted' }, e.name ?? ''),
                      h('span', { class: 'muted' }, `~${e.estimateMinutes} min`),
                    )),
                ),
          ),
          state.calledCount > 0
            ? h('section', { class: 'card', 'aria-label': 'Called customers' },
                h('h2', { class: 'section-label' }, 'CALLED'),
                h('ol', { class: 'queue-board' },
                  state.entries.filter((e) => e.state === 'CALLED').map((e) =>
                    h('li', { class: 'queue-board__item queue-board__item--called' },
                      h('span', { class: 'queue-board__ticket' }, e.display),
                      h('span', { class: 'muted' }, e.callCount > 1 ? `recalled ×${e.callCount - 1}` : 'waiting for customer'),
                    )),
                ),
              )
            : null,
        ),
        buildShareCard(queueId, state.name),
      ),
    );
  }

  load();
  return () => socket?.close();
}

function kpi(label, value) {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat__label' }, label),
    h('span', { class: 'stat__value' }, value),
  );
}

function buildShareCard(queueId, name) {
  const joinUrl = `${location.origin}/join/${queueId}`;
  return h('section', { class: 'card share-card' },
    h('h2', { class: 'section-label' }, 'CUSTOMER JOIN'),
    h('p', { class: 'muted' }, 'Share the QR code or link so customers can join.'),
    h('div', { class: 'share-card__row' },
      h('img', {
        src: `${window.LINELESS_CONFIG.apiBaseUrl}/queues/${encodeURIComponent(queueId)}/qr.svg`,
        alt: `QR code to join ${name}`,
        width: '132', height: '132', loading: 'lazy',
      }),
      h('div', {},
        h('code', { class: 'share-link' }, joinUrl),
        h('div', { class: 'share-card__actions' },
          h('button', {
            class: 'btn btn--ghost btn--sm',
            onclick: () => {
              navigator.clipboard?.writeText(joinUrl)
                .then(() => toast('Link copied.', 'success'))
                .catch(() => toast('Copy failed', 'error'));
            },
          }, 'Copy link'),
          h('a', {
            class: 'btn btn--ghost btn--sm',
            href: `${window.LINELESS_CONFIG.apiBaseUrl}/queues/${encodeURIComponent(queueId)}/qr.svg`,
            target: '_blank', rel: 'noopener',
          }, 'Open QR'),
        ),
      ),
    ),
  );
}
