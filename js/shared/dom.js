/* ==========================================================================
   Lakbay — DOM helpers
   Safe HTML building: the `h` template tag escapes every interpolation by
   default. Trusted static markup can be wrapped in raw`...` if needed.
   ========================================================================== */

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Tagged template: html`<div class="x">${userText}</div>` — escapes values.
   Nested trusted HTML (already rendered through h/raw) is preserved. */
export function h(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) {
      const v = values[i];
      out += (v && v.__safe) ? v.__safe : esc(v);
    }
  });
  return mark(out);
}

export function raw(strings, ...values) {
  return mark(strings.join(''));
}
function mark(s) { return { __safe: s, toString() { return s; } }; }

/* Element builder: el('div', {class:'x', onclick}, children...) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html' && v && v.__safe) node.innerHTML = v.__safe;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const c of list.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.appendChild(c && c.__safe ? fragment(c.__safe) : (c instanceof Node ? c : document.createTextNode(String(c))));
  }
  return node;
}

function fragment(htmlStr) {
  const t = document.createElement('template');
  t.innerHTML = htmlStr;
  return t.content;
}

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }

/* Render helper: safely sets innerHTML from a h`` result then refreshes icons */
export async function renderHTML(node, htmlValue) {
  node.innerHTML = (htmlValue && htmlValue.__safe) ? htmlValue.__safe : String(htmlValue);
  const { Icons } = await import('./icons.js');
  Icons.refresh(node);
  return node;
}
