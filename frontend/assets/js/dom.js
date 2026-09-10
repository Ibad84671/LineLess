// Tiny DOM helpers. All rendering goes through h()/text so user-provided
// data is NEVER assigned via innerHTML — this is the frontend's XSS
// defense-in-depth (backend also sanitizes at write time).

import { icon } from './icons.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value') el.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'required' || key === 'selected' || key === 'hidden') {
      el[key] = Boolean(value);
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function toast(message, kind = 'info', timeout = 4000) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = h('div', { class: `toast toast--${kind}`, role: 'status' },
    h('span', { class: 'toast__dot', 'aria-hidden': 'true' }),
    h('span', {}, message),
  );
  root.append(node);
  requestAnimationFrame(() => node.classList.add('toast--in'));
  setTimeout(() => {
    node.classList.remove('toast--in');
    setTimeout(() => node.remove(), 300);
  }, timeout);
}

export function spinner(label = 'Loading…') {
  return h('div', { class: 'spinner-wrap', role: 'status', 'aria-label': label },
    h('div', { class: 'spinner', 'aria-hidden': 'true' }),
  );
}

/** @param {string} [iconName] icon key rendered above the message */
export function emptyState(title, hint, action, iconName = null) {
  return h('div', { class: 'empty-state' },
    iconName
      ? h('div', { class: 'empty-state__icon', 'aria-hidden': 'true' }, icon(iconName, { size: 26 }))
      : null,
    h('h2', {}, title),
    hint ? h('p', { class: 'muted' }, hint) : null,
    action ?? null,
  );
}
