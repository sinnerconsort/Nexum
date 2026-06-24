// Nexum — contacts.js
// The roster. Three sources, merged: the active pack's cast (read-only, the world's),
// contacts you add (from an ST card or typed by hand), and — only if the roster would
// otherwise be empty — the character of the current ST chat, so Messages is never dead.
// Each contact is a self-contained record: { id, name, handle, persona, avatar, source }.
// persona is the voice blob used as the DM system prompt — exactly what a lorebook
// "Voice & Style" entry is, which is why the UnderNet cast drops straight in here.

import { getSettings, saveSettings } from './state.js';

function stx() { return window.SillyTavern?.getContext?.() ?? null; }

function findCard(name) {
    const c = stx();
    if (!c?.characters || !name) return null;
    return c.characters.find((x) => x.name === name) || null;
}

function personaFromCard(card) {
    const c = stx();
    const parts = [];
    if (card?.description) parts.push(card.description);
    if (card?.personality) parts.push(card.personality);
    let persona = parts.join('\n');
    if (c?.substituteParams) { try { persona = c.substituteParams(persona); } catch (_) { /* ignore */ } }
    if (persona.length > 3500) persona = persona.slice(0, 3500);
    return persona;
}

function avatarFromCard(card) {
    const c = stx();
    if (card?.avatar && c?.getThumbnailUrl) {
        try { return c.getThumbnailUrl('avatar', card.avatar); } catch (_) { /* ignore */ }
    }
    return '';
}

// Build a contact from a live ST card.
export function contactFromCard(card, { source = 'card', handle = '' } = {}) {
    if (!card) return null;
    return {
        id: `card:${card.avatar || card.name}`,
        name: card.name,
        handle,
        persona: personaFromCard(card),
        avatar: avatarFromCard(card),
        source,
    };
}

// Resolve a pack-cast entry { handle, character, voice } to a contact.
function contactFromPack(pc) {
    const card = findCard(pc.character || pc.name);
    if (card) {
        return {
            ...contactFromCard(card, { source: 'pack', handle: pc.handle || '' }),
            id: `pack:${pc.handle || pc.character || pc.name}`,
            name: pc.character || pc.name || pc.handle,
        };
    }
    // No matching card — use the voice blob the pack provides.
    return {
        id: `pack:${pc.handle || pc.character || pc.name}`,
        name: pc.character || pc.name || pc.handle || 'Unknown',
        handle: pc.handle || '',
        persona: (pc.voice || '').slice(0, 3500),
        avatar: '',
        source: 'pack',
    };
}

// ---- user-added store ----
function userList() {
    const s = getSettings();
    if (!Array.isArray(s.contacts)) s.contacts = [];
    return s.contacts;
}

export function addUserContact(record) {
    if (!record || !record.id) return false;
    const list = userList();
    if (list.some((c) => c.id === record.id)) return false; // already present
    list.push({
        id: record.id,
        name: record.name || 'Unknown',
        handle: record.handle || '',
        persona: record.persona || '',
        avatar: record.avatar || '',
        source: record.source || 'manual',
    });
    saveSettings();
    return true;
}

export function removeUserContact(id) {
    const s = getSettings();
    if (!Array.isArray(s.contacts)) return;
    s.contacts = s.contacts.filter((c) => c.id !== id);
    saveSettings();
}

export function makeManualContact({ name, persona, handle }) {
    return {
        id: `manual:${Date.now()}`,
        name: (name || '').trim() || 'Unknown',
        handle: (handle || '').trim(),
        persona: (persona || '').trim(),
        avatar: '',
        source: 'manual',
    };
}

// ---- the merged roster ----
export function getRoster(pack) {
    const seen = new Set();
    const roster = [];
    const add = (c) => { if (c && !seen.has(c.id)) { seen.add(c.id); roster.push(c); } };

    for (const pc of (pack?.contacts || [])) add(contactFromPack(pc));
    for (const uc of userList()) add(uc);

    if (roster.length === 0) {
        const c = stx();
        const card = c?.characters?.[c?.characterId];
        if (card) add({ ...contactFromCard(card, { source: 'active' }) });
    }
    return roster;
}

export function findContact(pack, id) {
    return getRoster(pack).find((c) => c.id === id) || null;
}

// List of ST cards for the "add from card" picker: [{ name, avatar }].
export function listCards() {
    const c = stx();
    return (c?.characters || []).map((x) => ({ name: x.name, avatar: x.avatar }));
}
