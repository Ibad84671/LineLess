// History-API router with CloudFront-friendly clean URLs.

import { h, clear, spinner } from './dom.js';
import { auth } from './auth.js';
import { renderTopbar } from './topbar.js';
import { LandingPage } from './views/landing.js';
import { JoinDirectoryPage, JoinQueuePage } from './views/join.js';
import { StatusPage } from './views/status.js';
import { DisplayPage } from './views/display.js';
import { LoginPage } from './views/login.js';
import { SignupPage } from './views/signup.js';
import { DashboardPage, QueueConsolePage, AnalyticsPage } from './views/dashboard.js';
import { OnboardingPage } from './views/onboarding.js';
import { NotFoundPage } from './views/notfound.js';

const routes = [
  { pattern: /^\/$/, view: LandingPage },
  { pattern: /^\/join\/?$/, view: JoinDirectoryPage },
  { pattern: /^\/join\/(?<queueId>[A-Za-z0-9_-]{1,64})\/?$/, view: JoinQueuePage },
  { pattern: /^\/q\/(?<token>[A-Za-z0-9_-]{20,160})\/?$/, view: StatusPage },
  { pattern: /^\/display\/(?<queueId>[A-Za-z0-9_-]{1,64})\/?$/, view: DisplayPage, chrome: false },
  { pattern: /^\/login\/?$/, view: LoginPage },
  { pattern: /^\/signup\/?$/, view: SignupPage },
  { pattern: /^\/onboarding\/?$/, view: OnboardingPage, protected: true },
  { pattern: /^\/dashboard\/?$/, view: DashboardPage, protected: true },
  { pattern: /^\/dashboard\/queue\/(?<queueId>[A-Za-z0-9_-]{1,64})\/?$/, view: QueueConsolePage, protected: true },
  { pattern: /^\/dashboard\/analytics\/?$/, view: AnalyticsPage, protected: true },
];

let currentTeardown = null;

export function navigate(path) {
  history.pushState({}, '', path);
  render();
}

export function render() {
  if (typeof currentTeardown === 'function') {
    try { currentTeardown(); } catch { /* page already gone */ }
    currentTeardown = null;
  }

  const app = document.getElementById('app');
  const path = location.pathname;
  const topbar = document.getElementById('topbar');

  let matched = null;
  let params = {};
  for (const r of routes) {
    const m = r.pattern.exec(path);
    if (m) {
      matched = r;
      params = m.groups ?? {};
      break;
    }
  }

  renderTopbar(topbar, matched?.chrome === false);

  clear(app);
  if (!matched) {
    currentTeardown = NotFoundPage(app);
    return;
  }

  if (matched.protected && !auth.isAuthenticated()) {
    sessionStorage.setItem('lineless.returnTo', path);
    history.replaceState({}, '', '/login');
    render();
    return;
  }

  app.append(spinner());
  const teardown = matched.view(app, params, navigate);
  currentTeardown = typeof teardown === 'function' ? teardown : null;
  app.focus({ preventScroll: false });
  window.scrollTo(0, 0);
}

export function startRouter() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-link]');
    if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      navigate(link.getAttribute('href'));
    }
  });
  window.addEventListener('popstate', render);
  render();
}
