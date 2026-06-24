// Nexum — chassis.js
// The device shell: frame, status bar (live clock + carrier = pack name), viewport,
// home pill. Body-mounted, centered with top/left + transform (never bottom/right).

import { mountRouter } from './router.js';

let backdropEl = null;
let phoneEl = null;
let viewportEl = null;
let carrierEl = null;
let clockEl = null;
let clockTimer = null;
let isOpen = false;

export function buildPhone() {
    if (phoneEl) return; // singleton

    // Backdrop (tap to close)
    backdropEl = document.createElement('div');
    backdropEl.id = 'nexum-backdrop';
    backdropEl.addEventListener('click', () => closePhone());

    // Phone root
    phoneEl = document.createElement('div');
    phoneEl.id = 'nexum-phone';
    phoneEl.setAttribute('role', 'dialog');
    phoneEl.setAttribute('aria-label', 'Nexum');

    phoneEl.innerHTML = `
        <div class="nexum-statusbar">
            <span class="nexum-carrier"></span>
            <span class="nexum-clock"></span>
            <span class="nexum-status-icons">
                <i class="fa-solid fa-signal"></i>
                <i class="fa-solid fa-wifi"></i>
                <i class="fa-solid fa-battery-three-quarters"></i>
            </span>
        </div>
        <div class="nexum-viewport"></div>
        <div class="nexum-homebar" role="button" aria-label="Close" title="Close"></div>
    `;

    // Don't let clicks inside the phone bubble up to the backdrop.
    phoneEl.addEventListener('click', (e) => e.stopPropagation());

    viewportEl = phoneEl.querySelector('.nexum-viewport');
    carrierEl = phoneEl.querySelector('.nexum-carrier');
    clockEl = phoneEl.querySelector('.nexum-clock');

    phoneEl.querySelector('.nexum-homebar')
        .addEventListener('click', () => closePhone());

    document.body.appendChild(backdropEl);
    document.body.appendChild(phoneEl);
}

export function getPhoneRoot() { return phoneEl; }
export function getViewport() { return viewportEl; }

// Called after a pack is loaded + skinned, to populate the home screen.
export function renderPack(pack) {
    if (carrierEl) carrierEl.textContent = pack?.name || 'Nexum';
    mountRouter(pack, viewportEl);
}

export function openPhone() {
    if (!phoneEl) return;
    backdropEl.classList.add('open');
    phoneEl.classList.add('open');
    isOpen = true;
    updateClock();
    clockTimer = setInterval(updateClock, 15000);
}

export function closePhone() {
    if (!phoneEl) return;
    backdropEl.classList.remove('open');
    phoneEl.classList.remove('open');
    isOpen = false;
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
}

export function togglePhone() {
    if (isOpen) closePhone(); else openPhone();
}

export function isPhoneOpen() { return isOpen; }

export function phoneInDom() {
    return !!(phoneEl && document.body.contains(phoneEl));
}

function updateClock() {
    if (!clockEl) return;
    try {
        clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
        const d = new Date();
        clockEl.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
}
