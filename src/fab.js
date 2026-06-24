// Nexum — fab.js
// The floating button that opens the phone. Body-mounted, top/left ONLY, clamped to
// viewport. preventDefault on the activating event kills the synthetic-click double-fire.

import { getSettings, saveSettings } from './state.js';
import { togglePhone } from './chassis.js';

let fabEl = null;

export function createFab() {
    if (fabEl) return; // singleton

    const s = getSettings();
    fabEl = document.createElement('button');
    fabEl.id = 'nexum-fab';
    fabEl.type = 'button';
    fabEl.title = 'Open Nexum';
    fabEl.setAttribute('aria-label', 'Open Nexum');
    fabEl.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i>';

    // top/left ONLY, clamped so a stale saved coord can't park it offscreen.
    const pad = 8;
    const w = 52, h = 52;
    const top = clamp(s.fab.top, pad, Math.max(pad, window.innerHeight - h - pad));
    const left = clamp(s.fab.left, pad, Math.max(pad, window.innerWidth - w - pad));
    fabEl.style.top = `${top}px`;
    fabEl.style.left = `${left}px`;

    makeFabInteractive(fabEl);
    document.body.appendChild(fabEl);
}

export function fabInDom() {
    return !!(fabEl && document.body.contains(fabEl));
}

// Single, guarded activation. We bind 'click' but call preventDefault so a touch
// that synthesizes a follow-up click can't fire the toggle twice.
function makeFabInteractive(el) {
    let lock = false;
    const fire = (e) => {
        if (e) e.preventDefault();
        if (lock) return;
        lock = true;
        togglePhone();
        setTimeout(() => { lock = false; }, 250);
    };
    el.addEventListener('click', fire);
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
}

// Re-clamp on resize/rotate so it never strands offscreen.
window.addEventListener('resize', () => {
    if (!fabEl) return;
    const pad = 8, w = 52, h = 52;
    const top = clamp(parseFloat(fabEl.style.top), pad, Math.max(pad, window.innerHeight - h - pad));
    const left = clamp(parseFloat(fabEl.style.left), pad, Math.max(pad, window.innerWidth - w - pad));
    fabEl.style.top = `${top}px`;
    fabEl.style.left = `${left}px`;
    const s = getSettings();
    s.fab.top = top; s.fab.left = left;
    saveSettings();
});
