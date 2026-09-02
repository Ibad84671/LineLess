// Manager dashboard: organization + queue overview, and analytics view.

import { h, clear, toast, spinner, emptyState } from '../dom.js';
import { api, ApiError } from '../api.js';
import { showError } from './join.js';

export function DashboardPage(app) {
  async function load() {
    clear(app);
    app.append(spinner());
    try {
      const me = await api.get('/me');
      const orgs = me.organizations ?? [];
      if (orgs.length === 0) {
        clear(app);
        app.append(
          emptyState(
            'No organization yet',
            'Create your organization to start running queues.',
            h('a', { href: '/onboarding', 'data-link': true, class: 'btn btn--primary' }, 'Create organization'),
          ),
        );
        return;
      }
      const org = orgs[0];
      const { queues } = await api.get(`/organizations/${encodeURIComponent(org.orgId)}/queues`);
      clear(app);
      app.append(
        h('div', { class: 'page' },
          h('header', { class: 'page__header page__header--row' },
            h('div', {},
              h('p', { class: 'eyebrow' }, `Signed in as ${org.role.toLowerCase().replace('_', ' ')}`),
              h('h1', {}, org.name),
            ),
            h('div', { class: 'topbar__actions' },
              h('a', { href: '/dashboard/analytics', 'data-link': true, class: 'btn btn--ghost' }, 'Analytics'),
              h('a', { href: '/onboarding', 'data-link': true, class: 'btn btn--primary' }, 'New queue'),
            ),
          ),
          queues.length === 0
            ? emptyState('No queues yet', 'Create your first queue to start taking customers.',
                h('a', { href: '/onboarding', 'data-link': true, class: 'btn btn--primary' }, 'Create a queue'))
            : h('ul', { class: 'card-list' },
                queues.map((q) => h('li', {},
                  h('a', { class: 'card card--link', href: `/dashboard/queue/${encodeURIComponent(q.queueId)}`, 'data-link': true },
                    h('div', {},
                      h('strong', {}, q.name),
                      h('span', { class: 'muted' }, ` · ${q.branchName ?? ''} ${q.serviceName ? `· ${q.serviceName}` : ''}`),
                    ),
                    h('span', { class: `badge ${q.status === 'OPEN' ? 'badge--open' : 'badge--closed'}` }, q.status),
                  ),
                )),
              ),
          buildStaffInvite(org),
        ),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        location.assign('/login');
        return;
      }
      showError(app, err);
    }
  }
  load();
  return null;
}

function buildStaffInvite(org) {
  return h('section', { class: 'card staff-card' },
    h('h2', { class: 'section-label' }, 'STAFF'),
    h('p', { class: 'muted' }, 'Invite team members by email (organization admins only).'),
    h('form', {
      class: 'inline-form',
      onsubmit: async (e) => {
        e.preventDefault();
        const form = e.target;
        const email = form.querySelector('input[type=email]').value.trim();
        const role = form.querySelector('select').value;
        try {
          await api.post(`/organizations/${encodeURIComponent(org.orgId)}/staff`, { email, role });
          toast(`Invitation sent to ${email}.`, 'success');
          form.reset();
        } catch (err) {
          toast(err instanceof ApiError ? err.message : 'Invite failed', 'error');
        }
      },
    },
      h('input', { type: 'email', required: true, placeholder: 'teammate@business.com', 'aria-label': 'Staff email' }),
      h('select', { 'aria-label': 'Role' },
        h('option', { value: 'STAFF' }, 'Staff'),
        h('option', { value: 'MANAGER' }, 'Manager'),
        h('option', { value: 'ORGANIZATION_ADMIN' }, 'Admin'),
      ),
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Invite'),
    ),
  );
}

function kpi(label, value) {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat__label' }, label),
    h('span', { class: 'stat__value' }, value),
  );
}

export { kpi };

export function AnalyticsPage(app) {
  async function load() {
    clear(app);
    app.append(spinner());
    try {
      const me = await api.get('/me');
      const org = (me.organizations ?? [])[0];
      if (!org) {
        clear(app);
        app.append(emptyState('No organization', 'Create an organization first.',
          h('a', { href: '/onboarding', 'data-link': true, class: 'btn btn--primary' }, 'Create organization')));
        return;
      }
      const data = await api.get(`/organizations/${encodeURIComponent(org.orgId)}/analytics`);
      clear(app);
      app.append(
        h('div', { class: 'page' },
          h('header', { class: 'page__header' },
            h('p', { class: 'eyebrow' }, `Last ${data.periodDays} days`),
            h('h1', {}, 'Analytics'),
          ),
          h('div', { class: 'stat-row' },
            kpi('Joined', String(data.totals.joined)),
            kpi('Served', String(data.totals.served)),
            kpi('No-show rate', `${data.totals.noShowRate}%`),
            kpi('Avg. wait', data.totals.avgWaitMinutes !== null ? `${data.totals.avgWaitMinutes} min` : '—'),
            kpi('Avg. service', data.totals.avgServiceMinutes !== null ? `${data.totals.avgServiceMinutes} min` : '—'),
          ),
          data.perQueue.length === 0
            ? emptyState('No queue activity yet', 'Data appears as customers join your queues.')
            : h('div', { class: 'card table-card' },
                h('table', { class: 'data-table' },
                  h('thead', {},
                    h('tr', {},
                      h('th', { scope: 'col' }, 'Queue'),
                      h('th', { scope: 'col' }, 'Joined'),
                      h('th', { scope: 'col' }, 'Served'),
                      h('th', { scope: 'col' }, 'Skipped'),
                      h('th', { scope: 'col' }, 'Left'),
                      h('th', { scope: 'col' }, 'Avg. wait'),
                      h('th', { scope: 'col' }, 'Avg. service'),
                    ),
                  ),
                  h('tbody', {},
                    data.perQueue.map((q) =>
                      h('tr', {},
                        h('th', { scope: 'row' }, q.name),
                        h('td', {}, String(q.joined)),
                        h('td', {}, String(q.served)),
                        h('td', {}, String(q.skipped)),
                        h('td', {}, String(q.left)),
                        h('td', {}, q.avgWaitMinutes !== null ? `${q.avgWaitMinutes} min` : '—'),
                        h('td', {}, q.avgServiceMinutes !== null ? `${q.avgServiceMinutes} min` : '—'),
                      )),
                  ),
                ),
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
