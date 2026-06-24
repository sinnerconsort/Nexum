// Nexum — state.js
// Global persistence only (extensionSettings + saveSettingsDebounced).
// Global, NOT per-chat: this is what lets the phone follow you across chats
// later (cross-chat bleed). Per-chat storage would break that, so we don't use it.

import { EXT_NAME, DEFAULTS } from './config.js';

function ctx() {
    return (window.SillyTavern && window.SillyTavern.getContext)
        ? window.SillyTavern.getContext()
        : null;
}

// Returns the live settings object, creating + filling defaults on first run.
export function getSettings() {
    const c = ctx();
    const store = c?.extensionSettings ?? (window.extension_settings ?? {});
    if (!store[EXT_NAME] || typeof store[EXT_NAME] !== 'object') {
        store[EXT_NAME] = {};
    }
    const s = store[EXT_NAME];
    // Defensive fill — add any missing keys without clobbering existing ones.
    if (typeof s.enabled !== 'boolean') s.enabled = DEFAULTS.enabled;
    if (typeof s.activePackId !== 'string') s.activePackId = DEFAULTS.activePackId;
    if (typeof s.messageTokens !== 'number') s.messageTokens = DEFAULTS.messageTokens;
    if (!s.fab || typeof s.fab !== 'object') s.fab = { ...DEFAULTS.fab };
    if (typeof s.fab.top !== 'number') s.fab.top = DEFAULTS.fab.top;
    if (typeof s.fab.left !== 'number') s.fab.left = DEFAULTS.fab.left;
    return s;
}

export function saveSettings() {
    const c = ctx();
    const fn = c?.saveSettingsDebounced ?? window.saveSettingsDebounced;
    if (typeof fn === 'function') fn();
}
