// Nexum — config.js
// Constants, paths, defaults, and a tiny logger. No ST APIs touched here.

export const EXT_NAME = 'Nexum';

// Extension root URL, resolved relative to this file (src/config.js -> ../).
// Used to fetch packs/<id>/pack.json without hardcoding the install path.
export const EXT_URL = new URL('../', import.meta.url).href;

// Default global settings. Persisted under extensionSettings[EXT_NAME].
export const DEFAULTS = {
    enabled: true,
    activePackId: 'neutral',
    messageTokens: 1000,
    forumTokens: 1800,
    liveBleed: true,
    fab: {
        // top/left ONLY. Never bottom/right (ST's transformed body poisons those).
        top: 96,
        left: 12,
    },
};

const PREFIX = '[Nexum]';
export const log = (...a) => console.log(PREFIX, ...a);
export const warn = (...a) => console.warn(PREFIX, ...a);
export const err = (...a) => console.error(PREFIX, ...a);

// Toast helper — our primary debug channel on mobile (no console).
export function toast(kind, msg, title = 'Nexum') {
    try {
        if (window.toastr && typeof window.toastr[kind] === 'function') {
            window.toastr[kind](msg, title, { timeOut: 6000 });
        }
    } catch (_) { /* toastr not ready; ignore */ }
}
