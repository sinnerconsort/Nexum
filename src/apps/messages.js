// Nexum — apps/messages.js
// The DM surface. Reads its roster from contacts.js and its history from
// conversations.js (group-ready, 1:1 for now). Replies generate via isolated calls
// and trickle in as multiple bubbles. Accepts entry.startContactId so the Contacts
// app can hand off straight into a thread.

import { getSettings } from '../state.js';
import { isolatedGenerate, stripReasoning } from '../generate.js';
import { notify } from '../notifications.js';
import { isPhoneOpen } from '../chassis.js';
import { getRoster } from '../contacts.js';
import { getConversation, addMessage } from '../conversations.js';

function stx() { return window.SillyTavern?.getContext?.() ?? null; }

// 1:1 conversation id == the contact id.
function convMessages(ct) { return getConversation(ct.id, [ct.id]).messages; }

let view = 'list';
let activeId = null;

export function mountMessages(mountEl, ctx) {
    const screen = ctx?.screen || null;
    const pack = ctx?.pack || null;
    const roster = getRoster(pack);

    function showList() {
        view = 'list'; activeId = null;
        if (screen) { screen.setTitle('Messages'); screen.setBack(null); }
        renderList();
    }

    function renderList() {
        mountEl.innerHTML = '';
        if (!roster.length) {
            mountEl.innerHTML = '<div class="nexum-empty">No contacts yet.<br><small>Add someone in Contacts, or open an ST chat with a character.</small></div>';
            return;
        }
        const list = document.createElement('div');
        list.className = 'nexum-msg-list';
        for (const ct of roster) {
            const msgs = convMessages(ct);
            const last = msgs[msgs.length - 1];
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'nexum-msg-row';
            row.appendChild(avatarEl(ct));
            const meta = document.createElement('div');
            meta.className = 'nexum-msg-meta';
            const previewText = last ? `${last.from === 'user' ? 'You: ' : ''}${last.text}` : 'Tap to start texting';
            meta.innerHTML = `<span class="nexum-msg-name">${esc(ct.name)}</span><span class="nexum-msg-preview">${esc(previewText)}</span>`;
            row.appendChild(meta);
            row.addEventListener('click', () => openThread(ct));
            list.appendChild(row);
        }
        mountEl.appendChild(list);
    }

    function openThread(ct) {
        view = 'thread'; activeId = ct.id;
        if (screen) { screen.setTitle(ct.name); screen.setBack(showList); }
        renderThread(ct);
    }

    function renderThread(ct) {
        mountEl.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'nexum-msg-thread';

        const scroll = document.createElement('div');
        scroll.className = 'nexum-msg-scroll';
        for (const m of convMessages(ct)) scroll.appendChild(bubble(m));
        wrap.appendChild(scroll);

        const bar = document.createElement('div');
        bar.className = 'nexum-msg-inputbar';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'nexum-msg-input';
        input.placeholder = `Message ${ct.name}…`;
        input.autocomplete = 'off';
        const send = document.createElement('button');
        send.type = 'button';
        send.className = 'nexum-msg-send';
        send.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        bar.appendChild(input);
        bar.appendChild(send);
        wrap.appendChild(bar);
        mountEl.appendChild(wrap);

        const doSend = async () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            addMessage(ct.id, { from: 'user', senderId: null, text, ts: Date.now() }, [ct.id]);
            scroll.appendChild(bubble({ from: 'user', text }));
            scrollDown(scroll);

            const typing = typingEl();
            scroll.appendChild(typing);
            scrollDown(scroll);
            send.disabled = true; input.disabled = true;

            try {
                const reply = stripReasoning(await generateReply(ct)) || '…';
                typing.remove();
                const parts = splitReply(reply);
                for (const p of parts) addMessage(ct.id, { from: 'char', senderId: ct.id, text: p, ts: Date.now() }, [ct.id]);

                const looking = () => isPhoneOpen() && view === 'thread' && activeId === ct.id;
                if (looking()) {
                    for (let i = 0; i < parts.length; i++) {
                        if (i > 0) {
                            const t = typingEl();
                            scroll.appendChild(t); scrollDown(scroll);
                            await delay(staggerFor(parts[i]));
                            t.remove();
                        }
                        if (!looking()) break;
                        scroll.appendChild(bubble({ from: 'char', text: parts[i] }));
                        scrollDown(scroll);
                    }
                }
                if (!looking()) {
                    notify(`${ct.name}: ${previewLine(parts[0] || reply)}`, { app: 'messages' });
                }
            } catch (e) {
                typing.remove();
                const errb = bubble({ from: 'char', text: '(couldn’t reach the network — check your Connection Profile in ST)' });
                errb.classList.add('err');
                scroll.appendChild(errb);
                scrollDown(scroll);
            } finally {
                send.disabled = false; input.disabled = false;
                input.focus();
            }
        };
        send.addEventListener('click', doSend);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSend(); } });
        scrollDown(scroll);
    }

    // Direct-open handoff from the Contacts app.
    const startId = ctx?.entry?.startContactId;
    const target = startId ? roster.find((c) => c.id === startId) : null;
    if (target) openThread(target); else showList();
}

async function generateReply(ct) {
    const c = stx();
    const userName = c?.name1 || 'the user';
    let sys = `You are ${ct.name}. Stay fully in character.\n\n${ct.persona}\n\n`;

    // Same-entity bleed: if this contact is a character actually present in the
    // current main-chat scene, they ARE that character — fold in what they just
    // witnessed in person, so phone-them knows what room-them knows. This is the
    // innermost ring of knowledge: private to the two of you, NOT network-visible.
    if (getSettings().liveBleed !== false && isLiveContact(ct)) {
        const scene = liveSceneBlock();
        if (scene) {
            sys += `You and ${userName} are together in person right now. Here is what is passing `
                + `between you two, in order (most recent last):\n${scene}\n\n`
                + `Text as someone living through that very moment — you are aware of it and remember it. `
                + `Don't recap it back word-for-word; just let it color how you reply. This passed between `
                + `you two privately, in person — it is not public knowledge and you would not broadcast it.\n\n`;
        }
    }

    sys += `You are exchanging text messages with ${userName} on a phone. Reply ONLY as ${ct.name}, `
        + `in a casual texting voice: short, natural, in character. No narration, no asterisk actions, `
        + `no quotation marks wrapping the whole message. Never speak or act for ${userName}.`;
    const msgs = [{ role: 'system', content: sys }];
    for (const m of convMessages(ct)) msgs.push({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text });
    return isolatedGenerate(msgs);
}

// Is this contact a character present in the live main chat right now?
// (the active single card, or a member of the active group). Derived, never stored —
// so it's always correct as you switch chats, and absent cast stay isolated.
function isLiveContact(ct) {
    if (!ct) return false;
    if (ct.source === 'active') return true; // literally the active card
    const names = presentCharNames();
    return names.has(String(ct.name || '').trim().toLowerCase());
}

function presentCharNames() {
    const c = stx();
    const names = new Set();
    if (!c) return names;
    const card = c.characters?.[c.characterId];
    if (card?.name) names.add(card.name.toLowerCase());
    try {
        if (c.groupId && Array.isArray(c.groups)) {
            const g = c.groups.find((x) => x.id === c.groupId);
            for (const m of (g?.members || [])) {
                const mc = c.characters?.find((x) => x.avatar === m);
                if (mc?.name) names.add(mc.name.toLowerCase());
            }
        }
    } catch (_) { /* group introspection is best-effort */ }
    return names;
}

// A trimmed, bounded slice of the current main-chat scene. Read-only.
function liveSceneBlock(limit = 8) {
    const c = stx();
    if (!c || !Array.isArray(c.chat)) return '';
    const userName = c.name1 || 'User';
    const lines = c.chat
        .filter((m) => m && !m.is_system && typeof m.mes === 'string' && m.mes.trim())
        .slice(-limit)
        .map((m) => {
            const who = m.is_user ? userName : (m.name || 'Them');
            let text = m.mes.replace(/\s+/g, ' ').trim();
            if (text.length > 400) text = `${text.slice(0, 400)}…`;
            return `${who}: ${text}`;
        });
    return lines.join('\n');
}

// ---- small UI helpers ----
function avatarEl(ct) {
    const a = document.createElement('div');
    a.className = 'nexum-msg-avatar';
    if (ct.avatar) {
        const img = document.createElement('img');
        img.src = ct.avatar;
        img.alt = ct.name;
        img.onerror = () => { a.textContent = initial(ct.name); a.classList.add('fallback'); };
        a.appendChild(img);
    } else {
        a.textContent = initial(ct.name);
        a.classList.add('fallback');
    }
    return a;
}
function bubble(m) {
    const b = document.createElement('div');
    b.className = `nexum-bubble ${m.from === 'user' ? 'user' : 'char'}`;
    b.textContent = m.text;
    return b;
}
function typingEl() {
    const t = document.createElement('div');
    t.className = 'nexum-bubble char typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    return t;
}
function scrollDown(el) { requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }); }
function splitReply(text) {
    const parts = String(text || '').split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : [String(text || '').trim() || '…'];
}
function staggerFor(part) { return Math.min(1100, 300 + (part?.length || 0) * 9); }
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
function initial(name) { return (String(name || '?').trim()[0] || '?').toUpperCase(); }
function previewLine(s) { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > 42 ? `${t.slice(0, 42)}…` : t; }
function esc(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }
