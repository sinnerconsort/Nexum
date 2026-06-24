// Nexum — notifications.js
// The strip under the status bar. Idle = a short thin line. On news = a flashing
// dot + sliding text + optional count. Tap clears (marks read) and, if the
// notification names a source app, opens it. In-memory for now; this is also the
// state that will later drive the FAB's glow when the phone is closed.

let stripEl = null;
let dotEl = null;
let textEl = null;
let countEl = null;
let onOpenApp = null;
let queue = [];

export function initNotifications(strip, openAppFn) {
    stripEl = strip;
    onOpenApp = (typeof openAppFn === 'function') ? openAppFn : null;
    if (!stripEl) return;

    stripEl.innerHTML = `
        <span class="nexum-notif-line"></span>
        <span class="nexum-notif-dot"></span>
        <span class="nexum-notif-text"></span>
        <span class="nexum-notif-count"></span>
    `;
    dotEl = stripEl.querySelector('.nexum-notif-dot');
    textEl = stripEl.querySelector('.nexum-notif-text');
    countEl = stripEl.querySelector('.nexum-notif-count');

    stripEl.addEventListener('click', handleTap);
    render(false);
}

// Push a notification. opts.app = source app name (tapping opens it).
export function notify(text, opts = {}) {
    const n = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        app: opts.app || null,
        text: String(text ?? ''),
        ts: Date.now(),
        read: false,
    };
    queue.push(n);
    render(true);
    return n.id;
}

export function clearNotifications() {
    queue.forEach((n) => { n.read = true; });
    render(false);
}

export function unreadCount() {
    return queue.filter((n) => !n.read).length;
}

function render(animate) {
    if (!stripEl) return;
    const u = queue.filter((n) => !n.read);

    if (u.length > 0) {
        const latest = u[u.length - 1];
        textEl.textContent = latest.text;
        if (u.length > 1) { countEl.textContent = String(u.length); countEl.style.display = ''; }
        else { countEl.textContent = ''; countEl.style.display = 'none'; }
        stripEl.classList.add('has-notif');
        if (animate) {
            stripEl.classList.remove('slide');
            void stripEl.offsetWidth; // restart the slide animation
            stripEl.classList.add('slide');
        }
    } else {
        stripEl.classList.remove('has-notif', 'slide');
        textEl.textContent = '';
        countEl.textContent = '';
    }
}

function handleTap() {
    const u = queue.filter((n) => !n.read);
    if (u.length === 0) return;
    const latest = u[u.length - 1];
    queue.forEach((n) => { n.read = true; });
    render(false);
    if (latest.app && onOpenApp) {
        try { onOpenApp(latest.app); } catch (_) { /* ignore */ }
    }
}
