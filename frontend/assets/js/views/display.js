// TV / reception display: NOW SERVING + NEXT. Large typography, no chrome,
// updates via WebSocket only. Intentionally minimal for kiosk/TV use.

import { h, clear, spinner } from '../dom.js';
import { api } from '../api.js';
import { QueueSocket } from '../ws.js';

export function DisplayPage(app, params) {
  const { queueId } = params;
  let socket = null;

  async function refresh() {
    try {
      const state = await api.get(`/queues/${encodeURIComponent(queueId)}/display`);
      render(state);
    } catch {
      // keep last state on the big screen; a small status line signals issues
      const badge = document.querySelector('.display__status');
      if (badge) badge.textContent = 'RECONNECTING…';
    }
  }

  function render(state) {
    app.replaceChildren(
      h('div', { class: 'display' },
        h('div', { class: 'display__status', role: 'status' }, 'LIVE'),
        h('header', { class: 'display__header' },
          h('p', { class: 'display__org' }, state.orgName ?? ''),
          h('h1', { class: 'display__title' }, state.name),
        ),
        state.paused || state.status !== 'OPEN'
          ? h('div', { class: 'display__notice' }, state.paused ? 'QUEUE PAUSED' : 'QUEUE CLOSED')
          : h('div', { class: 'display__grid' },
              h('section', { class: 'display__now', 'aria-label': 'Now serving' },
                h('h2', { class: 'display__label' }, 'NOW SERVING'),
                h('div', { class: 'display__number' }, state.nowServing ?? '—'),
              ),
              h('section', { class: 'display__next', 'aria-label': 'Up next' },
                h('h2', { class: 'display__label' }, 'NEXT'),
                h('ol', { class: 'display__list' },
                  (state.next ?? []).slice(0, 6).map((e) => h('li', {}, e.display)),
                ),
                (state.next ?? []).length === 0 ? h('p', { class: 'display__empty' }, '—') : null,
              ),
            ),
      ),
    );
  }

  async function load() {
    clear(app);
    app.append(spinner());
    try {
      const state = await api.get(`/queues/${encodeURIComponent(queueId)}/display`);
      render(state);
    } catch {
      app.replaceChildren(
        h('div', { class: 'display' },
          h('div', { class: 'display__notice' }, 'QUEUE NOT FOUND'),
        ),
      );
      return;
    }
    socket = new QueueSocket({ scopeType: 'queue', queueId }, refresh);
  }

  load();
  return () => socket?.close();
}
