// Nexum — index.js (entry point)
// Boots the phone: settings -> build chassis -> load + skin the active pack -> FAB.
// Defensive throughout; on mobile, toastr is our only error channel.

import { EXT_NAME, log, err, toast } from './src/config.js';
import { getSettings, saveSettings } from './src/state.js';
import { loadPack, applySkin } from './src/packLoader.js';
import {
    buildPhone, getPhoneRoot, getStrip, renderPack, togglePhone,
    openPhone, closePhone, phoneInDom,
} from './src/chassis.js';
import { createFab, fabInDom } from './src/fab.js';
import { initNotifications, notify, clearNotifications } from './src/notifications.js';
import { openApp } from './src/router.js';

let keepaliveTimer = null;

async function applyActivePack() {
    const s = getSettings();
    const pack = await loadPack(s.activePackId);
    applySkin(pack, getPhoneRoot());
    renderPack(pack);
    return pack;
}

async function initUI() {
    buildPhone();
    initNotifications(getStrip(), (appName) => openApp(appName, { label: appName }));
    createFab();
    await applyActivePack();
    startKeepalive();
}

function destroyUI() {
    stopKeepalive();
    closePhone();
    document.getElementById('nexum-phone')?.remove();
    document.getElementById('nexum-backdrop')?.remove();
    document.getElementById('nexum-fab')?.remove();
}

// Cheap insurance: if some other layer rebuilds the DOM and drops our nodes,
// put them back. Mirrors the suite's keepalive pattern.
function startKeepalive() {
    if (keepaliveTimer) return;
    keepaliveTimer = setInterval(async () => {
        const s = getSettings();
        if (!s.enabled) return;
        if (!phoneInDom() || !fabInDom()) {
            log('keepalive: restoring UI');
            try { await initUI(); } catch (e) { err('keepalive init failed:', e); }
        }
    }, 4000);
}
function stopKeepalive() {
    if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
}

function addSettingsPanel() {
    const s = getSettings();
    const html = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>📱 Nexum</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label">
                    <input type="checkbox" id="nexum-enabled" ${s.enabled ? 'checked' : ''}>
                    <span>Enable Nexum</span>
                </label>
                <small class="nexum-settings-note">Active pack: <code>${s.activePackId}</code></small>
                <div class="menu_button" id="nexum-open-btn" style="margin-top:8px;">Open phone</div>
            </div>
        </div>
    `;
    $('#extensions_settings2').append(html);

    $('#nexum-enabled').on('change', async function () {
        const was = getSettings().enabled;
        const now = $(this).prop('checked');
        getSettings().enabled = now;
        saveSettings();
        if (now && !was) { try { await initUI(); } catch (e) { err(e); } }
        else if (!now && was) { destroyUI(); }
    });

    $('#nexum-open-btn').on('click', () => {
        if (getSettings().enabled) togglePhone();
        else toast('info', 'Enable Nexum first.');
    });
}

function registerSlash() {
    try {
        const c = window.SillyTavern?.getContext?.();
        const reg = c?.registerSlashCommand || window.registerSlashCommand;
        if (typeof reg === 'function') {
            reg('nexum', () => { togglePhone(); return ''; }, [], 'Toggle the Nexum phone', true, true);
        }
    } catch (_) { /* optional; never block init on this */ }
}

jQuery(async () => {
    try {
        log('initializing…');

        try { addSettingsPanel(); } catch (e) { err('settings panel failed:', e); }

        if (!getSettings().enabled) { log('disabled'); return; }

        await initUI();
        registerSlash();

        // One welcome notification per page load, so the banner is visible the
        // first time you open the phone. Tap it to clear it to the idle line.
        notify('Nexum online.', { app: null });

        // Expose for mobile testing via address bar (no console needed).
        window.Nexum = {
            open: openPhone,
            close: closePhone,
            toggle: togglePhone,
            reloadPack: applyActivePack,
            notify,                 // Nexum.notify('hello', { app: 'messages' })
            clearNotifications,
            settings: getSettings,
        };

        log('✅ ready');
    } catch (e) {
        err('❌ critical failure:', e);
        toast('error', 'Nexum failed to start. See the thumbs-down to report.', 'Nexum');
    }
});
