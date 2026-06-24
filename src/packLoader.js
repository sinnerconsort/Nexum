// Nexum — packLoader.js
// Loads a world-pack (JSON) and applies its skin. Engine code; never world-specific.
// A pack's skin.tokens are CSS custom properties applied verbatim to the phone root,
// so a pack author can recolor anything the stylesheet reads.

import { EXT_URL, warn, err } from './config.js';

// Absolute-minimum fallback so a missing/broken pack file never hard-crashes the phone.
const FALLBACK_NEUTRAL = {
    pack_format: 1,
    id: 'neutral',
    name: 'Nexum',
    skin: { tokens: {}, effects: [] },
    home: {
        apps: [
            { app: 'messages', icon: 'comment', label: 'Messages' },
            { app: 'games', icon: 'dice', label: 'Games', games: ['knucklebones'] },
        ],
    },
};

export async function loadPack(id) {
    const url = new URL(`packs/${id}/pack.json`, EXT_URL).href;
    try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const pack = await res.json();
        if (!pack || typeof pack !== 'object') throw new Error('pack is not an object');
        // Minimal shape guarantees so downstream code can trust these exist.
        pack.skin = pack.skin || { tokens: {}, effects: [] };
        pack.skin.tokens = pack.skin.tokens || {};
        pack.skin.effects = Array.isArray(pack.skin.effects) ? pack.skin.effects : [];
        pack.home = pack.home || { apps: [] };
        pack.home.apps = Array.isArray(pack.home.apps) ? pack.home.apps : [];
        pack.name = pack.name || id;
        return pack;
    } catch (e) {
        warn(`Could not load pack "${id}" (${e.message}); using fallback Neutral.`);
        return { ...FALLBACK_NEUTRAL };
    }
}

// Apply skin tokens + effect classes to the phone root element.
export function applySkin(pack, rootEl) {
    if (!rootEl) return;
    try {
        // 1) tokens -> CSS custom properties
        const tokens = pack?.skin?.tokens || {};
        for (const [key, val] of Object.entries(tokens)) {
            if (typeof key === 'string' && key.startsWith('--')) {
                rootEl.style.setProperty(key, String(val));
            }
        }
        // 2) named effect layers -> classes (nexum-fx-<name>); CSS decides what they do.
        rootEl.className = rootEl.className
            .split(/\s+/)
            .filter((c) => c && !c.startsWith('nexum-fx-'))
            .join(' ');
        for (const fx of (pack?.skin?.effects || [])) {
            if (typeof fx === 'string') rootEl.classList.add(`nexum-fx-${fx}`);
        }
        // 3) tag the active pack id for any pack-scoped CSS/debugging.
        rootEl.dataset.pack = pack?.id || 'neutral';
    } catch (e) {
        err('applySkin failed:', e);
    }
}
