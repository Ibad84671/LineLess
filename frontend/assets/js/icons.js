// LineLess icon system — inline SVG icons in Lucide style (24×24 grid,
// 2px stroke, round caps, currentColor). Vectors are Lucide's (ISC license,
// https://lucide.dev). Only the icons this app uses are bundled; nothing is
// loaded at runtime, so there is no flash of missing glyphs.

// Each entry is an array of primitives drawn inside the 24×24 viewBox:
//   ['path', d]                       stroked path
//   ['circle', cx, cy, r]             stroked circle
//   ['rect', x, y, w, h, rx]          stroked rect

const ICONS = {
  search: [
    ['path', 'm21 21-4.34-4.34'],
    ['circle', 11, 11, 8],
  ],
  sun: [
    ['circle', 12, 12, 4],
    ['path', 'M12 2v2'],
    ['path', 'M12 20v2'],
    ['path', 'm4.93 4.93 1.41 1.41'],
    ['path', 'm17.66 17.66 1.41 1.41'],
    ['path', 'M2 12h2'],
    ['path', 'M20 12h2'],
    ['path', 'm6.34 17.66-1.41 1.41'],
    ['path', 'm19.07 4.93-1.41 1.41'],
  ],
  moon: [
    ['path', 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401'],
  ],
  clock: [
    ['circle', 12, 12, 10],
    ['path', 'M12 6v6l4 2'],
  ],
  users: [
    ['path', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'],
    ['circle', 9, 7, 4],
    ['path', 'M22 21v-2a4 4 0 0 0-3-3.87'],
    ['path', 'M16 3.13a4 4 0 0 1 0 7.75'],
  ],
  user: [
    ['path', 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'],
    ['circle', 12, 7, 4],
  ],
  check: [
    ['path', 'M20 6 9 17l-5-5'],
  ],
  x: [
    ['path', 'M18 6 6 18'],
    ['path', 'm6 6 12 12'],
  ],
  arrowRight: [
    ['path', 'M5 12h14'],
    ['path', 'm12 5 7 7-7 7'],
  ],
  chevronDown: [
    ['path', 'm6 9 6 6 6-6'],
  ],
  pause: [
    ['rect', 14, 3, 5, 18, 1],
    ['rect', 5, 3, 5, 18, 1],
  ],
  play: [
    ['path', 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z'],
  ],
  skipForward: [
    ['path', 'M21 4v16'],
    ['path', 'M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z'],
  ],
  refresh: [
    ['path', 'M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'],
    ['path', 'M3 3v5h5'],
    ['path', 'M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16'],
    ['path', 'M16 16h5v5'],
  ],
  logOut: [
    ['path', 'm16 17 5-5-5-5'],
    ['path', 'M21 12H9'],
    ['path', 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'],
  ],
  copy: [
    ['rect', 8, 8, 14, 14, 2],
    ['path', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
  ],
  qrCode: [
    ['rect', 3, 3, 5, 5, 1],
    ['rect', 16, 3, 5, 5, 1],
    ['rect', 3, 16, 5, 5, 1],
    ['path', 'M21 16h-3a2 2 0 0 0-2 2v3'],
    ['path', 'M21 21v.01'],
    ['path', 'M12 7v3a2 2 0 0 1-2 2H7'],
    ['path', 'M12 3h.01'],
    ['path', 'M12 16v.01'],
    ['path', 'M16 12h1'],
    ['path', 'M12 21v-1'],
  ],
  zap: [
    ['path', 'M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z'],
  ],
  store: [
    ['path', 'M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5'],
    ['path', 'M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244'],
    ['path', 'M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05'],
  ],
  bell: [
    ['path', 'M10.268 21a2 2 0 0 0 3.464 0'],
    ['path', 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326'],
  ],
  plus: [
    ['path', 'M12 5v14'],
    ['path', 'M5 12h14'],
  ],
  sliders: [
    ['path', 'M10 5H3'],
    ['path', 'M12 19H3'],
    ['path', 'M14 3v4'],
    ['path', 'M16 17v4'],
    ['path', 'M21 12h-9'],
    ['path', 'M8 10v4'],
  ],
  gauge: [
    ['path', 'm12 14 4-4'],
    ['path', 'M3.34 19a10 10 0 1 1 17.32 0'],
  ],
  eye: [
    ['path', 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'],
    ['circle', 12, 12, 3],
  ],
  eyeOff: [
    ['path', 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49'],
    ['path', 'M14.084 14.158a3 3 0 0 1-4.242-4.242'],
    ['path', 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143'],
    ['path', 'm2 2 20 20'],
  ],
  mapPin: [
    ['path', 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'],
    ['circle', 12, 10, 3],
  ],
  activity: [
    ['path', 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2'],
  ],
  dashboard: [
    ['rect', 3, 3, 7, 9, 1],
    ['rect', 14, 3, 7, 5, 1],
    ['rect', 14, 12, 7, 9, 1],
    ['rect', 3, 16, 7, 5, 1],
  ],
  shield: [
    ['path', 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
  ],
};

const NS = 'http://www.w3.org/2000/svg';

/**
 * Renders an icon as an inline SVG element.
 * @param {string} name icon key from ICONS
 * @param {{size?: number, class?: string, 'aria-hidden'?: string|boolean}} [opts]
 * @returns {SVGElement}
 */
export function icon(name, opts = {}) {
  const { size = 18, class: className = '', ...rest } = opts;
  const defs = ICONS[name];
  if (!defs) throw new Error(`Unknown icon: ${name}`);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (className) svg.setAttribute('class', className);
  if (rest['aria-hidden'] === undefined) svg.setAttribute('aria-hidden', 'true');
  for (const [k, v] of Object.entries(rest)) {
    if (v === null || v === undefined || v === false) continue;
    svg.setAttribute(k, String(v));
  }

  for (const def of defs) {
    const el = document.createElementNS(NS, def[0]);
    if (def[0] === 'path') {
      el.setAttribute('d', def[1]);
    } else if (def[0] === 'circle') {
      el.setAttribute('cx', String(def[1]));
      el.setAttribute('cy', String(def[2]));
      el.setAttribute('r', String(def[3]));
    } else if (def[0] === 'rect') {
      el.setAttribute('x', String(def[1]));
      el.setAttribute('y', String(def[2]));
      el.setAttribute('width', String(def[3]));
      el.setAttribute('height', String(def[4]));
      el.setAttribute('rx', String(def[5]));
    }
    svg.append(el);
  }
  return svg;
}