'use strict';

// ---- Tauri bridge ----------------------------------------------------------

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ---- Icons (static markup only; never user data) ----------------------------

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  grid: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
  file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  folder: svg('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>'),
  layers: svg('<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 13 9 5 9-5"/>'),
  trash: svg('<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>'),
  disk: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 14h18"/><circle cx="17" cy="16.5" r=".6" fill="currentColor"/>'),
  chevrons: svg('<path d="m8 9 4-4 4 4M8 15l4 4 4-4"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  external: svg('<path d="M7 17 17 7M9 7h8v8"/>'),
  sort: svg('<path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  monitor: svg('<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M9 20h6M12 16v4"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
};
function hydrateIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) {
    if (!node.firstElementChild) node.insertAdjacentHTML('afterbegin', ICONS[node.dataset.icon] ?? '');
  }
}
const icon = (name, className = '') => {
  const span = document.createElement('span');
  span.dataset.icon = name;
  if (className) span.className = className;
  span.innerHTML = ICONS[name];
  return span;
};

// ---- Formatting ------------------------------------------------------------

function formatBytes(n) {
  if (n < 1000) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let i = -1;
  do { n /= 1000; i++; } while (n >= 1000 && i < units.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}
const formatCount = (n) => n.toLocaleString();
function formatElapsed(ms) {
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)}s`;
}
function formatPct(part, whole) {
  if (!whole) return '0%';
  const p = (part / whole) * 100;
  return p >= 10 ? `${p.toFixed(0)}%` : p >= 0.1 ? `${p.toFixed(1)}%` : '<0.1%';
}
const baseName = (p) => p.split('/').filter(Boolean).pop() || p;
function kindLabel(item) {
  if (item.kind === 'dir') return 'Folder';
  if (item.kind === 'other') return 'Grouped';
  if (item.kind === 'mount') return 'Volume';
  const ext = item.name.includes('.') ? item.name.split('.').pop() : '';
  return ext && ext.length <= 6 ? `${ext.toUpperCase()} file` : 'File';
}
function describeError(code) {
  return { EACCES: 'No permission', EPERM: 'No permission', OTHER_VOLUME: 'Other volume' }[code] ?? code;
}

const $ = (id) => document.getElementById(id);
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}
const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

let toastTimer;
function showError(err) {
  const toast = $('toast');
  toast.textContent = String(err?.message ?? err);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
}

// ---- State -------------------------------------------------------------------

const state = {
  tab: 'disks', // overview | large | types | cleanup | disks
  volumes: [],
  summary: null, // open scan
  viewId: null, // folder being explored (null = scan root)
  folder: null, // { scanId, path, ancestors, tree } — tree has depth-1 children
  types: [],
  large: [],
  results: null, // search hits, or null when not searching
  query: '',
  filter: 'all',
  sortByName: false,
  hot: null, // id highlighted across chart + table
  pinnedBar: 0, // bar index labelled when nothing is hovered
  collector: new Map(), // id -> { id, name, size, location }
  dragging: null,
};

const CATEGORY_SHADES = ['--g0', '--g1', '--g2', '--g3', '--g4'];

// ---- Navigation between views ---------------------------------------------

function setTab(tab) {
  if (tab !== 'disks' && !state.summary) return;
  state.tab = tab;
  if (tab !== 'overview' && state.results) clearSearch();
  for (const t of document.querySelectorAll('.tile')) {
    t.classList.toggle('active', t.dataset.view === tab);
    t.disabled = !state.summary && t.dataset.view !== 'disks';
  }
  const scanning = tab !== 'disks';
  $('disks').hidden = scanning;
  $('hero').hidden = !scanning;
  $('content').hidden = !scanning;
  if (tab === 'disks') renderDisks();
  if (tab === 'large') loadLarge();
  renderContent();
}
for (const tile of document.querySelectorAll('.tile')) tile.addEventListener('click', () => setTab(tile.dataset.view));

// ---- Disks -------------------------------------------------------------------

async function renderDisks() {
  try {
    const [volumes, fda] = await Promise.all([invoke('list_volumes'), invoke('has_full_disk_access')]);
    state.volumes = volumes;
    $('fda').hidden = fda;
  } catch (err) {
    showError(err);
  }
  const grid = $('disk-grid');
  grid.replaceChildren(
    ...state.volumes.map((v) => {
      const used = v.total - v.free;
      const current = state.summary?.root === v.scanPath;
      return el(
        'article',
        { className: 'disk' },
        el(
          'div',
          { className: 'disk-top' },
          icon('disk', 'kind-icon'),
          el('div', {}, el('strong', {}, v.name), el('small', {}, v.isBoot ? 'Startup disk' : v.mountPoint)),
        ),
        el('div', { className: 'disk-free' }, formatBytes(v.free), el('small', {}, 'free')),
        el('div', { className: 'capacity' }, el('i', { style: `width:${((used / v.total) * 100).toFixed(1)}%` })),
        el('small', { className: 'cell muted' }, `${formatBytes(used)} used of ${formatBytes(v.total)}`),
        el('button', {
          type: 'button',
          className: 'btn-dark btn-wide',
          onclick: () => (current ? setTab('overview') : startScan(v.scanPath, v.name)),
        }, el('span', {}, current ? 'Open scan' : 'Scan disk'), icon('arrow')),
      );
    }),
    el(
      'article',
      { className: 'disk add', onclick: chooseFolder },
      icon('plus', 'kind-icon'),
      el('strong', {}, 'Scan a folder'),
      el('small', {}, 'or drop one anywhere on this window'),
    ),
  );
}
// ---- Disk picker (sidebar dropdown) ------------------------------------------

function closeDiskMenu(focusCard) {
  if ($('disk-menu').hidden) return;
  $('disk-menu').hidden = true;
  $('disk-card').setAttribute('aria-expanded', 'false');
  if (focusCard) $('disk-card').focus();
}

async function openDiskMenu() {
  const menu = $('disk-menu');
  try {
    state.volumes = await invoke('list_volumes');
  } catch (err) {
    showError(err);
  }
  const pick = (fn) => () => { closeDiskMenu(); fn(); };
  const item = (props, ...children) => el('button', { type: 'button', role: 'menuitem', className: 'menu-item', ...props }, ...children);
  const scannedRoot = state.summary?.root;
  const rows = [
    el('div', { className: 'menu-label' }, 'Disks'),
    ...state.volumes.map((v) => {
      const used = v.total - v.free;
      const current = scannedRoot === v.scanPath;
      return item(
        {
          className: `menu-item menu-disk${current ? ' current' : ''}`,
          onclick: pick(() => (current ? setTab('overview') : startScan(v.scanPath, v.name))),
        },
        icon('disk', 'menu-icon'),
        el(
          'span',
          { className: 'menu-text' },
          el('strong', {}, v.name),
          el('small', {}, `${formatBytes(v.free)} free · ${formatBytes(v.total)}`),
          el('span', { className: 'capacity' }, el('i', { style: `width:${((used / v.total) * 100).toFixed(1)}%` })),
        ),
        current ? icon('check', 'menu-check') : null,
      );
    }),
    // A scanned folder that isn't a whole disk.
    scannedRoot && !state.volumes.some((v) => v.scanPath === scannedRoot)
      ? item(
          { className: 'menu-item menu-disk current', onclick: pick(() => setTab('overview')), title: scannedRoot },
          icon('folder', 'menu-icon'),
          el('span', { className: 'menu-text' }, el('strong', {}, baseName(scannedRoot)), el('small', {}, scannedRoot)),
          icon('check', 'menu-check'),
        )
      : null,
    el('hr'),
    item({ onclick: pick(chooseFolder) }, icon('plus', 'menu-icon'), el('span', { className: 'menu-text' }, 'Scan a folder…'), el('kbd', {}, '⌘O')),
    item({ onclick: pick(() => setTab('disks')) }, icon('grid', 'menu-icon'), el('span', { className: 'menu-text' }, 'All disks')),
  ];
  menu.replaceChildren(...rows.filter(Boolean));
  menu.hidden = false;
  $('disk-card').setAttribute('aria-expanded', 'true');
  menu.querySelector('.menu-item')?.focus();
}

$('disk-card').addEventListener('click', () => ($('disk-menu').hidden ? openDiskMenu() : closeDiskMenu()));
document.addEventListener('mousedown', (e) => {
  if (!$('disk-picker').contains(e.target)) closeDiskMenu();
});
$('disk-picker').addEventListener('keydown', (e) => {
  const menu = $('disk-menu');
  if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); closeDiskMenu(true); return; }
  if (e.target === $('disk-card') && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && menu.hidden) {
    e.preventDefault();
    openDiskMenu();
    return;
  }
  if (menu.hidden || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
  e.preventDefault();
  const items = [...menu.querySelectorAll('.menu-item')];
  const at = items.indexOf(document.activeElement);
  const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
  items[next].focus();
});
// Tabbing out closes the menu. WebKit doesn't focus buttons on click, so a mouse press leaves
// relatedTarget null; clicks outside are handled by the mousedown listener above.
$('disk-menu').addEventListener('focusout', (e) => {
  if (e.relatedTarget && !$('disk-picker').contains(e.relatedTarget)) closeDiskMenu();
});

$('fda-open').addEventListener('click', () => invoke('open_full_disk_access_settings'));
$('fda-check').addEventListener('click', renderDisks);

async function chooseFolder() {
  try {
    const path = await invoke('choose_folder');
    if (path) startScan(path);
  } catch (err) {
    showError(err);
  }
}
$('choose-btn').addEventListener('click', chooseFolder);

// Folders dropped from Finder.
window.__TAURI__.webview.getCurrentWebview().onDragDropEvent(({ payload }) => {
  if (state.dragging) return;
  $('drop-overlay').hidden = !(payload.type === 'enter' || payload.type === 'over');
  if (payload.type === 'drop' && payload.paths?.length) startScan(payload.paths[0]);
});

// ---- Scanning ------------------------------------------------------------------

async function startScan(path, label) {
  try {
    const summary = await invoke('start_scan', { path, label: label ?? null });
    Object.assign(state, { viewId: null, folder: null, types: [], large: [], results: null, collector: new Map(), pinnedBar: 0 });
    $('search').value = '';
    state.query = '';
    onSummary(summary);
    setTab('overview');
  } catch (err) {
    showError(err);
  }
}

$('stop-btn').addEventListener('click', () => invoke('cancel_scan'));
$('rescan-btn').addEventListener('click', () => state.summary && startScan(state.summary.root, state.summary.label));

let liveTimer = null;
let tick = 0;
function onSummary(summary) {
  state.summary = summary;
  renderStatus();
  refresh(true);
  clearInterval(liveTimer);
  // Redraw the partially built tree while scanning.
  if (summary.status === 'scanning') {
    liveTimer = setInterval(() => refresh(++tick % 3 === 0), 1000);
  }
}

listen('scan-progress', ({ payload }) => {
  if (payload.scanId !== state.summary?.scanId) return;
  state.summary = payload;
  renderStatus();
});
listen('scan-done', ({ payload }) => {
  if (payload.scanId === state.summary?.scanId) onSummary(payload);
});

function renderStatus() {
  const s = state.summary;
  const status = $('scan-status');
  status.replaceChildren();
  $('search').disabled = !s;
  $('stop-btn').hidden = s?.status !== 'scanning';
  $('rescan-btn').hidden = !s || s.status === 'scanning';
  if (!s) return;
  const st = s.stats;
  if (s.status === 'scanning') {
    status.append(el('span', { className: 'spinner' }), `Scanning · ${formatCount(st.files)} files · ${formatBytes(st.bytes)} · ${formatElapsed(s.elapsedMs)}`);
  } else {
    const errors = st.errors ? ` · ${formatCount(st.errors)} unreadable` : '';
    status.append(`${s.status === 'cancelled' ? 'Stopped' : 'Scanned'} ${formatCount(st.files)} files in ${formatElapsed(s.elapsedMs)}${errors}`);
  }
  status.title = st.current || '';

  $('disk-card-name').textContent = s.label.startsWith('/') ? baseName(s.label) : s.label;
  $('disk-card-sub').textContent = s.space ? `${formatBytes(s.space.free)} free · ${formatBytes(s.space.total)}` : s.root;
  renderCleanupCard();
}

// ---- Data loading ----------------------------------------------------------------

let folderReq = null;
async function refresh(withInsights) {
  if (!state.summary) return;
  const id = state.viewId;
  const req = (folderReq = invoke('get_tree', { id, depth: 1 }));
  try {
    const folder = await req;
    if (req !== folderReq) return;
    state.folder = folder;
  } catch {
    if (req !== folderReq) return;
    // The folder may have been deleted; fall back to the scan root.
    if (id != null) return navigate(null);
    return;
  }
  if (withInsights) {
    try {
      state.types = await invoke('type_breakdown', { id });
    } catch {}
    if (state.tab === 'large') loadLarge();
  }
  renderHero();
  renderContent();
}

function navigate(id) {
  state.viewId = id;
  state.pinnedBar = 0;
  state.hot = null;
  refresh(true);
}

async function loadLarge() {
  try {
    state.large = await invoke('largest_files', { id: state.viewId, limit: 200 });
  } catch {
    state.large = [];
  }
  if (state.tab === 'large') renderContent();
}

// ---- Search --------------------------------------------------------------------------

let searchTimer;
$('search').addEventListener('input', (e) => {
  state.query = e.target.value.trim();
  clearTimeout(searchTimer);
  if (!state.query) return clearSearch();
  searchTimer = setTimeout(async () => {
    try {
      const results = await invoke('search_items', { query: state.query, limit: 300 });
      if (!state.query) return;
      state.results = results;
      if (state.tab !== 'overview') setTab('overview');
      else renderContent();
    } catch (err) {
      showError(err);
    }
  }, 180);
});
$('search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.target.value = ''; clearSearch(); e.target.blur(); }
});
function clearSearch() {
  state.query = '';
  state.results = null;
  $('search').value = '';
  renderContent();
}

// ---- Hero: Space by folder (bars) --------------------------------------------------

const MAX_BARS = 32;

function barItems() {
  const kids = state.folder?.tree.children ?? [];
  if (kids.length <= MAX_BARS) return kids;
  const shown = kids.slice(0, MAX_BARS - 1);
  const rest = kids.slice(MAX_BARS - 1);
  shown.push({ id: null, name: `${rest.length} more items`, kind: 'other', size: rest.reduce((a, c) => a + c.size, 0), count: rest.reduce((a, c) => a + c.count, 0) });
  return shown;
}

function renderBars() {
  const host = $('bars');
  const W = host.clientWidth || 600;
  const H = host.clientHeight || 240;
  const items = barItems();
  const root = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Space by folder' });
  host.replaceChildren(root);
  if (!items.length) {
    root.append(s('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'axis-label' }, state.summary?.status === 'scanning' ? 'Scanning…' : 'This folder is empty'));
    return;
  }

  const top = 30;
  const bottom = H - 4;
  const right = W - 40;
  const max = items[0].size || 1;
  const y = (v) => bottom - (v / max) * (bottom - top);

  for (const [frac, label] of [[1, '100%'], [0.5, '50%'], [0, '0%']]) {
    const yy = y(max * frac);
    root.append(s('line', { x1: 0, x2: right, y1: yy, y2: yy, class: 'gridline' }));
    root.append(s('text', { x: W - 2, y: yy + 4, 'text-anchor': 'end', class: 'axis-label' }, label));
  }

  const slot = right / items.length;
  const barW = Math.max(3, Math.min(64, slot * (items.length < 12 ? 0.62 : 1) - 2));
  const hotIndex = items.findIndex((it) => it.id != null && it.id === state.hot);
  const active = hotIndex >= 0 ? hotIndex : Math.min(state.pinnedBar, items.length - 1);
  const style = getComputedStyle(document.documentElement);
  const shade = style.getPropertyValue('--bar').trim();
  const cap = style.getPropertyValue('--bar-top').trim();
  const ink = style.getPropertyValue('--ink').trim();

  const defs = s('defs');
  const grad = s('linearGradient', { id: 'barfade', x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(s('stop', { offset: 0, 'stop-color': shade }), s('stop', { offset: 1, 'stop-color': shade, 'stop-opacity': 0.45 }));
  defs.append(grad);
  root.append(defs);

  items.forEach((it, i) => {
    const x = i * slot + (slot - barW) / 2;
    const yy = Math.min(y(it.size), bottom - 2);
    const isActive = i === active;
    root.append(s('rect', { x, y: yy, width: barW, height: bottom - yy, fill: isActive ? ink : 'url(#barfade)', rx: 1.5 }));
    if (!isActive) root.append(s('rect', { x, y: yy, width: barW, height: 2, fill: cap, rx: 1 }));
    const hit = s('rect', { x: i * slot, y: 0, width: slot, height: H, fill: 'transparent', class: it.id != null ? 'bar-hit' : '' });
    hit.addEventListener('mouseenter', (e) => { setHot(it.id); showTip(e, `${it.name} — ${formatBytes(it.size)}`); });
    hit.addEventListener('mousemove', (e) => moveTip(e));
    hit.addEventListener('mouseleave', () => { setHot(null); hideTip(); });
    hit.addEventListener('click', () => {
      if (it.kind === 'dir') navigate(it.id);
      else if (it.id != null) { state.pinnedBar = i; renderBars(); }
    });
    root.append(hit);
  });

  // Label over the active bar, like a date marker.
  const it = items[active];
  const cx = active * slot + slot / 2;
  const text = `${truncate(it.name, 22)} · ${formatBytes(it.size)}`;
  const anchor = cx < 90 ? 'start' : cx > right - 90 ? 'end' : 'middle';
  root.append(s('text', { x: anchor === 'start' ? cx - barW / 2 : anchor === 'end' ? cx + barW / 2 : cx, y: Math.max(14, y(it.size) - 10), 'text-anchor': anchor, class: 'bar-label' }, text));
}

function truncate(str, n) {
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

// ---- Hero: Storage overview (stacks) --------------------------------------------

function renderOverview() {
  const tree = state.folder?.tree;
  const space = state.summary?.space;
  $('big-size').textContent = tree ? formatBytes(tree.size) : '—';
  $('big-share').textContent = tree && space ? `${formatPct(tree.size, space.total)} of disk` : '';

  const types = state.types.slice(0, 4);
  const restTypes = state.types.slice(4).reduce((a, t) => a + t.size, 0);
  if (restTypes) types.push({ category: 'Other types', size: restTypes });
  const style = getComputedStyle(document.documentElement);
  const shades = CATEGORY_SHADES.map((v) => style.getPropertyValue(v).trim());
  const elsewhereShade = style.getPropertyValue('--g3').trim();
  const freeShade = style.getPropertyValue('--g5').trim();

  const host = $('stacks');
  const W = host.clientWidth || 400;
  const H = host.clientHeight || 170;
  const root = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Storage overview' });
  host.replaceChildren(root);

  const folderSize = tree?.size ?? 0;
  const used = space ? space.total - space.free : folderSize;
  const elsewhere = Math.max(0, used - folderSize);
  const free = space?.free ?? 0;
  const columns = [
    { label: 'This folder', value: folderSize, parts: types.length ? types.map((t, i) => ({ size: t.size, color: shades[i] })) : [{ size: folderSize, color: shades[0] }] },
    { label: 'Elsewhere', value: elsewhere, parts: [{ size: elsewhere, color: elsewhereShade }] },
    { label: 'Free', value: free, parts: [{ size: free, color: freeShade }] },
  ];
  const max = Math.max(...columns.map((c) => c.value), 1);
  const top = 26;
  const bottom = H - 2;
  const colW = Math.min(96, W / 4.2);
  const gap = (W - colW * 3) / 2;
  // Heights aren't strictly proportional (a folder is often <1% of a disk):
  // the folder column keeps enough height to show its type breakdown, and
  // the labels carry the real numbers.
  const avail = bottom - top;
  const heights = columns.map((c, i) => Math.max(i === 0 ? avail * 0.55 : avail * 0.12, (c.value / max) * avail));

  // Soft bands connecting the column tops.
  for (let i = 0; i < 2; i++) {
    const x1 = i * (colW + gap) + colW;
    const x2 = x1 + gap;
    root.append(s('path', {
      d: `M${x1} ${bottom - heights[i]}L${x2} ${bottom - heights[i + 1]}L${x2} ${bottom}L${x1} ${bottom}Z`,
      fill: style.getPropertyValue('--text').trim(),
      opacity: 0.045,
    }));
  }

  const GAP = 3;
  columns.forEach((col, i) => {
    const x = i * (colW + gap);
    const h = heights[i];
    const parts = col.parts.filter((p) => p.size > 0);
    if (!parts.length) parts.push({ size: 1, color: col.parts[0]?.color ?? freeShade });
    const total = parts.reduce((a, p) => a + p.size, 0);
    const minPart = 5;
    const usable = h - GAP * (parts.length - 1) - minPart * parts.length;
    // Largest (darkest) part at the bottom.
    let yy = bottom;
    for (const p of parts) {
      const ph = minPart + Math.max(0, usable) * (p.size / total);
      yy -= ph;
      root.append(s('rect', { x, y: yy, width: colW, height: ph, rx: 5, fill: p.color }));
      yy -= GAP;
    }
    root.append(s('text', { x: x + colW / 2, y: bottom - h - 10, 'text-anchor': 'middle', class: 'stack-value' }, formatBytes(col.value)));
  });

  const legend = $('legend');
  legend.replaceChildren(
    ...types.map((t, i) => el('li', { style: `--c:${shades[i]}` }, t.category)),
    el('li', { style: `--c:${elsewhereShade}` }, 'Elsewhere on disk'),
    el('li', { style: `--c:${freeShade}` }, 'Free'),
  );
}

function renderCrumbs() {
  const nav = $('crumbs');
  nav.replaceChildren();
  const chain = state.folder?.ancestors ?? [];
  chain.forEach((a, i) => {
    if (i) nav.append(el('span', {}, '/'));
    nav.append(el('button', { type: 'button', textContent: i ? a.name : baseName(a.name), title: a.name, onclick: () => navigate(a.id) }));
  });
  $('up-btn').disabled = chain.length < 2;
}
$('up-btn').addEventListener('click', goUp);
$('reveal-btn').addEventListener('click', () => state.folder && reveal(state.folder.tree.id));
function goUp() {
  const chain = state.folder?.ancestors ?? [];
  if (chain.length > 1) navigate(chain[chain.length - 2].id);
}

function renderHero() {
  renderCrumbs();
  renderBars();
  renderOverview();
}
new ResizeObserver(() => state.folder && !$('hero').hidden && (renderBars(), renderOverview())).observe($('hero'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => state.folder && renderHero());

// ---- Highlight + tooltip --------------------------------------------------------------

function setHot(id) {
  if (state.hot === id) return;
  state.hot = id;
  for (const row of $('table').querySelectorAll('.trow')) row.classList.toggle('hot', id != null && Number(row.dataset.id) === id);
  renderBars();
}
function showTip(e, text) {
  const tip = $('tooltip');
  tip.textContent = text;
  tip.hidden = false;
  moveTip(e);
}
function moveTip(e) {
  const tip = $('tooltip');
  tip.style.left = `${Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${e.clientY + 16}px`;
}
const hideTip = () => { $('tooltip').hidden = true; };

// ---- Content tables ---------------------------------------------------------------------

function renderContent() {
  if (!state.summary || state.tab === 'disks') return;
  const head = { title: 'Contents', count: '', pills: [], sort: true };
  let table;
  if (state.results) {
    head.title = `Results for “${state.query}”`;
    head.count = formatCount(state.results.length);
    head.pills = [{ label: 'Clear search', onclick: clearSearch }];
    table = filesTable(sortItems(state.results), 'Location');
  } else if (state.tab === 'overview') {
    const kids = state.folder?.tree.children ?? [];
    const counts = {
      all: kids.length,
      dirs: kids.filter((k) => k.kind === 'dir').length,
      files: kids.filter((k) => k.kind === 'file').length,
      large: kids.filter((k) => k.size >= 1e9).length,
    };
    head.count = formatCount(state.folder?.tree.count ?? 0) + ' files';
    head.pills = [
      ['all', 'All'], ['dirs', 'Folders'], ['files', 'Files'], ['large', 'Over 1 GB'],
    ].map(([key, label]) => ({ label, count: counts[key], active: state.filter === key, onclick: () => { state.filter = key; renderContent(); } }));
    const filtered = kids.filter((k) =>
      state.filter === 'all' ? true : state.filter === 'dirs' ? k.kind === 'dir' : state.filter === 'files' ? k.kind === 'file' : k.size >= 1e9);
    table = contentsTable(sortItems(filtered));
  } else if (state.tab === 'large') {
    head.title = 'Large files';
    head.count = formatCount(state.large.length);
    table = filesTable(sortItems(state.large), 'Folder');
  } else if (state.tab === 'types') {
    head.title = 'File types';
    head.count = formatCount(state.types.length);
    head.sort = false;
    table = typesTable();
  } else if (state.tab === 'cleanup') {
    head.title = 'Cleanup';
    head.count = formatCount(state.collector.size);
    head.sort = false;
    table = cleanupTable();
  }

  $('content-title').textContent = head.title;
  $('content-count').textContent = head.count;
  $('content-count').hidden = !head.count;
  $('sort-btn').hidden = !head.sort;
  $('sort-btn').title = state.sortByName ? 'Sorted by name' : 'Sorted by size';
  $('pills').replaceChildren(
    ...head.pills.map((p) => el('button', { type: 'button', className: `pill${p.active ? ' active' : ''}`, onclick: p.onclick }, p.label, p.count != null ? el('em', {}, formatCount(p.count)) : null)),
  );
  $('table').replaceChildren(...table);
}

$('sort-btn').addEventListener('click', () => { state.sortByName = !state.sortByName; renderContent(); });
function sortItems(items) {
  const out = [...items];
  if (state.sortByName) out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}

function shareCell(part, whole) {
  const pct = whole ? (part / whole) * 100 : 0;
  return el('div', { className: 'cell share' }, el('div', { className: 'share-track' }, el('i', { style: `width:${Math.min(100, pct).toFixed(2)}%` })), el('span', {}, formatPct(part, whole)));
}

function statusCell(item) {
  if (state.collector.has(item.id)) return el('div', { className: 'cell' }, el('span', { className: 'status', style: '--c:var(--ink)' }, 'In cleanup'));
  if (item.error) return el('div', { className: 'cell' }, el('span', { className: 'status', style: '--c:var(--warn)' }, describeError(item.error)));
  return el('div', { className: 'cell muted' }, '');
}

function actionsCell(item) {
  const cell = el('div', { className: 'cell actions' });
  if (item.id == null) return cell;
  const primary = item.kind === 'dir'
    ? el('button', { type: 'button', className: 'btn-ghost', textContent: 'Open', onclick: (e) => { e.stopPropagation(); openItem(item); } })
    : el('button', { type: 'button', className: 'btn-ghost', textContent: 'Reveal', onclick: (e) => { e.stopPropagation(); reveal(item.id); } });
  const collected = state.collector.has(item.id);
  const toggle = el('button', {
    type: 'button',
    className: `icon-btn${collected ? ' on' : ''}`,
    title: collected ? 'Remove from cleanup' : 'Add to cleanup',
    onclick: (e) => { e.stopPropagation(); toggleCollect(item); },
  }, icon(collected ? 'check' : 'plus'));
  cell.append(primary, toggle);
  return cell;
}

function nameCell(item, sub) {
  return el('div', { className: 'cell name', title: item.name }, icon(item.kind === 'dir' ? 'folder' : item.kind === 'other' ? 'layers' : 'file', 'kind-icon'),
    el('span', {}, item.name, sub ? el('small', { className: 'cell muted', style: 'display:block;font-weight:400;font-size:12px' }, sub) : null));
}

function makeRow(cls, item, cells) {
  const row = el('div', { className: `trow ${cls}` }, ...cells);
  if (item.id != null) {
    row.dataset.id = item.id;
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      state.dragging = { id: item.id, name: item.name, size: item.size, location: item.location };
      e.dataTransfer.setData('text/plain', item.name);
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => { state.dragging = null; });
    row.addEventListener('mouseenter', () => setHot(item.id));
    row.addEventListener('mouseleave', () => setHot(null));
  }
  return row;
}

function contentsTable(items) {
  const total = state.folder?.tree.size ?? 0;
  const header = el('div', { className: 'thead cols-contents' },
    ...['Name', 'Kind', 'Size', 'Share', 'Files', 'Status', ''].map((t, i) => el('div', { className: `cell ${['', 'c-kind', '', '', '', 'c-status', ''][i]}` }, t)));
  if (!items.length) return [header, el('div', { className: 'empty-state' }, state.summary?.status === 'scanning' ? 'Scanning…' : 'Nothing here.')];
  return [header, ...items.map((item) => {
    const row = makeRow('cols-contents', item, [
      nameCell(item),
      el('div', { className: 'cell muted c-kind' }, kindLabel(item)),
      el('div', { className: 'cell num' }, formatBytes(item.size)),
      shareCell(item.size, total),
      el('div', { className: 'cell num muted' }, item.kind === 'file' ? '—' : formatCount(item.count)),
      Object.assign(statusCell(item), { className: `${statusCell(item).className} c-status` }),
      actionsCell(item),
    ]);
    if (item.kind === 'dir') {
      row.classList.add('clickable');
      row.addEventListener('click', () => navigate(item.id));
    }
    return row;
  })];
}

function filesTable(items, locationLabel) {
  const total = state.folder?.tree.size ?? 0;
  const header = el('div', { className: 'thead cols-files' }, ...['Name', locationLabel, 'Size', 'Share', ''].map((t) => el('div', { className: 'cell' }, t)));
  if (!items.length) return [header, el('div', { className: 'empty-state' }, state.results ? 'No matches.' : 'No files yet.')];
  return [header, ...items.map((item) => makeRow('cols-files', item, [
    nameCell(item),
    el('div', { className: 'cell muted', title: item.location }, item.location),
    el('div', { className: 'cell num' }, formatBytes(item.size)),
    shareCell(item.size, total),
    actionsCell(item),
  ]))];
}

function typesTable() {
  const total = state.types.reduce((a, t) => a + t.size, 0);
  const style = getComputedStyle(document.documentElement);
  const header = el('div', { className: 'thead cols-types' }, ...['Type', 'Files', 'Size', 'Share'].map((t) => el('div', { className: 'cell' }, t)));
  if (!state.types.length) return [header, el('div', { className: 'empty-state' }, 'No files yet.')];
  return [header, ...state.types.map((t, i) => el('div', { className: 'trow cols-types' },
    el('div', { className: 'cell name' }, el('span', { className: 'kind-icon', style: `background:${style.getPropertyValue(CATEGORY_SHADES[Math.min(i, 4)]).trim()}` }), el('span', {}, t.category)),
    el('div', { className: 'cell num muted' }, formatCount(t.count)),
    el('div', { className: 'cell num' }, formatBytes(t.size)),
    shareCell(t.size, total),
  ))];
}

function cleanupTable() {
  const header = el('div', { className: 'thead cols-cleanup' }, ...['Name', 'Location', 'Size', ''].map((t) => el('div', { className: 'cell' }, t)));
  if (!state.collector.size) {
    return [header, el('div', { className: 'empty-state' }, 'Nothing collected yet. Use + on any folder or file, or drag rows onto the Cleanup card.')];
  }
  const rows = [...state.collector.values()].map((item) => el('div', { className: 'trow cols-cleanup' },
    nameCell(item),
    el('div', { className: 'cell muted', title: item.location ?? '' }, item.location ?? ''),
    el('div', { className: 'cell num' }, formatBytes(item.size)),
    el('div', { className: 'cell actions' }, el('button', { type: 'button', className: 'btn-ghost', textContent: 'Remove', onclick: () => toggleCollect(item) })),
  ));
  const total = [...state.collector.values()].reduce((a, i) => a + i.size, 0);
  const foot = el('div', { className: 'table-foot' },
    el('span', { className: 'cell muted' }, 'Up to'), el('strong', {}, formatBytes(total)),
    el('button', { type: 'button', className: 'btn-dark', onclick: confirmDelete, disabled: state.summary?.status === 'scanning' }, icon('trash'), 'Move to Trash…'));
  return [header, ...rows, foot];
}

// ---- Actions --------------------------------------------------------------------------

function openItem(item) {
  if (item.kind !== 'dir') return reveal(item.id);
  if (state.results) clearSearch();
  setTab('overview');
  navigate(item.id);
}

function reveal(id) {
  invoke('reveal', { id }).catch(showError);
}

function toggleCollect(item) {
  if (item.id == null) return;
  if (state.collector.has(item.id)) state.collector.delete(item.id);
  else {
    const location = item.location ?? relativeLocation();
    state.collector.set(item.id, { id: item.id, name: item.name, size: item.size, kind: item.kind, location });
  }
  renderCleanupCard();
  renderContent();
}

function relativeLocation() {
  const chain = state.folder?.ancestors ?? [];
  return chain.slice(1).map((a) => a.name).join('/') || '.';
}

function renderCleanupCard() {
  const n = state.collector.size;
  const total = [...state.collector.values()].reduce((a, i) => a + i.size, 0);
  $('cleanup-amount').textContent = formatBytes(total);
  $('cleanup-text').replaceChildren(
    ...(n
      ? [`${n} item${n === 1 ? '' : 's'} ready to move to the Trash.`]
      : ['Collect folders and files with ', el('b', {}, '+'), ', or drag them here.']),
  );
  $('cleanup-review').disabled = !n;
  $('cleanup-badge').hidden = !n;
  $('cleanup-badge').textContent = n;
}
$('cleanup-review').addEventListener('click', () => setTab('cleanup'));

const cleanupCard = $('cleanup-card');
cleanupCard.addEventListener('dragover', (e) => {
  if (!state.dragging) return;
  e.preventDefault();
  cleanupCard.classList.add('drag-over');
});
cleanupCard.addEventListener('dragleave', () => cleanupCard.classList.remove('drag-over'));
cleanupCard.addEventListener('drop', (e) => {
  e.preventDefault();
  cleanupCard.classList.remove('drag-over');
  if (state.dragging && !state.collector.has(state.dragging.id)) toggleCollect(state.dragging);
  state.dragging = null;
});

async function confirmDelete() {
  $('confirm-error').hidden = true;
  $('confirm-ok').disabled = false;
  let preview;
  try {
    preview = await invoke('trash_items', { scanId: state.summary.scanId, ids: [...state.collector.keys()], dryRun: true });
  } catch (err) {
    return showError(err);
  }
  const n = preview.items.length;
  $('confirm-summary').textContent = `${n} item${n === 1 ? '' : 's'} totalling ${formatBytes(preview.total)} will be moved to the Trash. You can restore them from there.`;
  $('confirm-list').replaceChildren(...preview.items.map((i) => el('li', {}, el('span', {}, i.path), el('span', {}, formatBytes(i.size)))));
  $('confirm').showModal();
}

$('confirm-ok').addEventListener('click', async (e) => {
  e.preventDefault();
  $('confirm-ok').disabled = true;
  try {
    const result = await invoke('trash_items', { scanId: state.summary.scanId, ids: [...state.collector.keys()], dryRun: false });
    for (const id of result.trashed) state.collector.delete(id);
    renderCleanupCard();
    refresh(true);
    if (result.failed.length) {
      $('confirm-error').textContent = `Couldn't move ${result.failed.length} item(s): ${result.failed.join('; ')}`;
      $('confirm-error').hidden = false;
      $('confirm-ok').disabled = false;
      return;
    }
    $('confirm').close();
  } catch (err) {
    $('confirm-error').textContent = String(err);
    $('confirm-error').hidden = false;
    $('confirm-ok').disabled = false;
  }
});

// ---- Keyboard ----------------------------------------------------------------------------

addEventListener('keydown', (e) => {
  if (!e.metaKey) return;
  const key = e.key.toLowerCase();
  if (key === 'o') { e.preventDefault(); chooseFolder(); }
  else if (key === 'f' && state.summary) { e.preventDefault(); $('search').focus(); }
  else if (key === 'r' && state.summary && state.summary.status !== 'scanning') { e.preventDefault(); $('rescan-btn').click(); }
  else if (key === 'arrowup' && state.summary) { e.preventDefault(); goUp(); }
});

// ---- Appearance --------------------------------------------------------------------------

const THEMES = ['system', 'light', 'dark'];
const THEME_ICONS = { system: 'monitor', light: 'sun', dark: 'moon' };
function applyTheme(theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const btn = $('theme-btn');
  btn.replaceChildren(icon(THEME_ICONS[theme]));
  btn.title = `Appearance: ${theme[0].toUpperCase()}${theme.slice(1)}`;
  // Match the native window (traffic lights, dialogs) to the chosen theme.
  window.__TAURI__.window?.getCurrentWindow().setTheme(theme === 'system' ? null : theme).catch(() => {});
  if (state.folder && !$('hero').hidden) renderHero();
  if (state.tab === 'types') renderContent();
}
let theme = 'system';
try { theme = localStorage.getItem('lacuna-theme') || 'system'; } catch {}
if (!THEMES.includes(theme)) theme = 'system';
$('theme-btn').addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  try { localStorage.setItem('lacuna-theme', theme); } catch {}
  applyTheme(theme);
});

// ---- Boot ---------------------------------------------------------------------------------

hydrateIcons();
applyTheme(theme);
(async () => {
  try {
    const current = await invoke('current_scan');
    if (current) {
      onSummary(current);
      setTab('overview');
      return;
    }
  } catch {}
  setTab('disks');
})();
