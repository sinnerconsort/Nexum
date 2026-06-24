// Nexum — apps/messages.js
// The DM channel. Contact list -> thread. Replies generate via isolated calls
// (no main-chat pollution). Threads persist per-contact in global settings, so a
// conversation survives chat-switches — the groundwork for cross-chat continuity.
// Contacts come from the active pack; with the Neutral pack (no contacts) it falls
// back to whatever character the current ST chat is with, so it works out of the box.

import { getSettings, saveSettings } from '../state.js';
import { isolatedGenerate, stripReasoning } from '../generate.js';
import { notify } from '../notifications.js';
import { isPhoneOpen } from '../chassis.js';

function stx() { return window.SillyTavern?.getContext?.() ?? null; }

// ---- thread store (global, per-contact) ----
function threads() {
    const s = getSettings();
    if (!s.threads || typeof s.threads !== 'object') s.threads = {};
    return s.threads;
}
function getThread(id) {
    const t = threads();
    if (!Array.isArray(t[id])) t[id] = [];
    return t[id];
}

// ---- contact resolution ----
function findCard(name) {
    const c = stx();
    if (!c?.characters || !name) return null;
    return c.characters.find((x) => x.name === name) || null;
}

function makeContact({ id, name, handle, card, voice }) {
    const c = stx();
    let persona = '';
    if (card) {
        const parts = [];
        if (card.description) parts.push(card.description);
        if (card.personality) parts.push(card.personality);
        persona = parts.join('\n');
        if (c?.substituteParams) { try { persona = c.substituteParams(persona); } catch (_) { /* ignore */ } }
    } else if (voice) {
        persona = voice;
    }
    if (persona.length > 3500) persona = persona.slice(0, 3500);
    let avatar = '';
    if (card?.avatar && c?.getThumbnailUrl) {
        try { avatar = c.getThumbnailUrl('avatar', card.avatar); } catch (_) { /* ignore */ }
    }
    return { id: String(id), name: name || handle || 'Unknown', handle: handle || '', persona, avatar };
}

function resolveContacts(pack) {
    const c = stx();
    const packContacts = pack?.contacts || [];
    if (packContacts.length) {
        return packContacts.map((pc) => makeContact({
            id: pc.handle || pc.character || pc.name,
            name: pc.character || pc.name || pc.handle,
            handle: pc.handle || '',
            card: findCard(pc.character || pc.name),
            voice: pc.voice || '',
        }));
    }
    // Fallback: the character of the active ST chat.
    const ch = c?.characters?.[c?.characterId];
    if (ch) return [makeContact({ id: ch.avatar || ch.name, name: ch.name, handle: '', card: ch })];
    return [];
}

// ---- module-level view state (single phone instance) ----
let view = 'list';
let activeId = null;

export function mountMessages(mountEl, ctx) {
    const screen = ctx?.screen || null;
    const contacts = resolveContacts(ctx?.pack);

    function showList() {
        view = 'list'; activeId = null;
        if (screen) { screen.setTitle('Messages'); screen.setBack(null); }
        renderList();
    }

    function renderList() {
        mountEl.innerHTML = '';
        if (!contacts.length) {
            mountEl.innerHTML = '<div class="nexum-empty">No contacts yet.<br><small>Open an ST chat with a character, or load a world pack with contacts.</small></div>';
            return;
        }
        const list = document.createElement('div');
        list.className = 'nexum-msg-list';
        for (const ct of contacts) {
            const th = getThread(ct.id);
            const last = th[th.length - 1];
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
        for (const m of getThread(ct.id)) scroll.appendChild(bubble(m));
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
            const thread = getThread(ct.id);
            thread.push({ from: 'user', text, ts: Date.now() });
            saveSettings();
            scroll.appendChild(bubble({ from: 'user', text }));
            scrollDown(scroll);

            const typing = typingEl();
            scroll.appendChild(typing);
            scrollDown(scroll);
            send.disabled = true; input.disabled = true;

            try {
                const reply = stripReasoning(await generateReply(ct, thread)) || '…';
                typing.remove();
                const parts = splitReply(reply);
                // Persist every part up front so they survive navigating away mid-reveal.
                for (const p of parts) thread.push({ from: 'char', text: p, ts: Date.now() });
                saveSettings();

                const looking = () => isPhoneOpen() && view === 'thread' && activeId === ct.id;
                if (looking()) {
                    // Reveal bubbles one at a time, with a short typing beat between —
                    // so a multi-paragraph reply trickles in like real texts.
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

    showList();
}

async function generateReply(ct, thread) {
    const c = stx();
    const userName = c?.name1 || 'the user';
    const sys = `You are ${ct.name}. Stay fully in character.\n\n${ct.persona}\n\n`
        + `You are exchanging text messages with ${userName} on a phone. Reply ONLY as ${ct.name}, `
        + `in a casual texting voice: short, natural, in character. No narration, no asterisk actions, `
        + `no quotation marks wrapping the whole message. Never speak or act for ${userName}.`;
    const msgs = [{ role: 'system', content: sys }];
    for (const m of thread) msgs.push({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text });
    return isolatedGenerate(msgs);
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
