// Nexum — router.js
// Draws the home screen from pack.home.apps and swaps a screen into the viewport
// when an icon is tapped. Drop #1: every app is a stub. Drop #2 wires knucklebones
// into openApp('games'/'knucklebones'). The router itself never changes per world.

import { warn } from './config.js';

let currentPack = null;
let viewportEl = null;

// Registry of real app renderers. Empty in drop #1.
// Later: appRegistry.knucklebones = (mountEl, ctx) => { ...build board... }
const appRegistry = {};

export function registerApp(name, renderFn) {
    if (typeof name === 'string' && typeof renderFn === 'function') {
        appRegistry[name] = renderFn;
    }
}

export function mountRouter(pack, viewport) {
    currentPack = pack;
    viewportEl = viewport;
    renderHome();
}

export function renderHome() {
    if (!viewportEl) return;
    const apps = currentPack?.home?.apps || [];

    const grid = document.createElement('div');
    grid.className = 'nexum-home';

    if (apps.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'nexum-empty';
        empty.textContent = 'No apps in this pack.';
        grid.appendChild(empty);
    }

    for (const entry of apps) {
        const name = entry.app || 'app';
        const icon = entry.icon || 'square';
        const label = entry.label || name;

        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'nexum-app-tile';
        tile.dataset.app = name;
        tile.innerHTML = `
            <span class="nexum-app-icon"><i class="fa-solid fa-${icon}"></i></span>
            <span class="nexum-app-label">${escapeHtml(label)}</span>
        `;
        tile.addEventListener('click', (e) => {
            e.preventDefault();
            openApp(name, entry);
        });
        grid.appendChild(tile);
    }

    viewportEl.innerHTML = '';
    viewportEl.appendChild(grid);
}

export function openApp(name, entry = {}) {
    if (!viewportEl) return;

    // Real app available? Hand it the mount node and the entry config.
    if (appRegistry[name]) {
        const screen = buildAppScreen(entry.label || name);
        viewportEl.innerHTML = '';
        viewportEl.appendChild(screen.wrapper);
        try {
            appRegistry[name](screen.body, { pack: currentPack, entry });
        } catch (e) {
            warn(`app "${name}" failed to render:`, e);
            screen.body.innerHTML = '<div class="nexum-empty">This app hit a snag. Tap back and try again.</div>';
        }
        return;
    }

    // Drop #1 stub — proves the icon opens a screen and back returns home.
    const screen = buildAppScreen(entry.label || name);
    const stub = document.createElement('div');
    stub.className = 'nexum-empty';
    stub.innerHTML = `Nothing here yet.<br><small>${escapeHtml(entry.label || name)} arrives in a later drop.</small>`;
    screen.body.appendChild(stub);
    viewportEl.innerHTML = '';
    viewportEl.appendChild(screen.wrapper);
}

// A screen = a header with a back button + a body the app fills.
function buildAppScreen(title) {
    const wrapper = document.createElement('div');
    wrapper.className = 'nexum-screen';

    const header = document.createElement('div');
    header.className = 'nexum-screen-header';

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'nexum-back';
    back.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    back.addEventListener('click', (e) => { e.preventDefault(); renderHome(); });

    const h = document.createElement('span');
    h.className = 'nexum-screen-title';
    h.textContent = title;

    header.appendChild(back);
    header.appendChild(h);

    const body = document.createElement('div');
    body.className = 'nexum-screen-body';

    wrapper.appendChild(header);
    wrapper.appendChild(body);
    return { wrapper, body };
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
}
