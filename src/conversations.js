// Nexum — conversations.js
// Per-conversation message store, shaped for groups from day one: a conversation has
// a participants list. 1:1 is just participants:[oneId] and convId = that id; a group
// (later) is multiple ids and convId = the sorted ids joined. Building 1:1 now; the
// shape means groups don't require a data migration later. Also migrates the old
// per-contact `threads` store into this on first access.

import { getSettings, saveSettings } from './state.js';

function store() {
    const s = getSettings();
    if (!s.conversations || typeof s.conversations !== 'object') s.conversations = {};

    // One-time migration from the earlier `threads` shape.
    if (s.threads && typeof s.threads === 'object' && !s._convMigrated) {
        for (const [id, msgs] of Object.entries(s.threads)) {
            if (Array.isArray(msgs) && !s.conversations[id]) {
                s.conversations[id] = {
                    participants: [id],
                    messages: msgs.map((m) => ({
                        from: m.from,
                        senderId: m.from === 'char' ? id : null,
                        text: m.text,
                        ts: m.ts,
                    })),
                };
            }
        }
        s._convMigrated = true;
        saveSettings();
    }
    return s.conversations;
}

// Stable conversation id for a set of participants. 1:1 -> the single id.
export function convIdFor(participantIds) {
    const ids = [...new Set(participantIds)].filter(Boolean).sort();
    return ids.join('|');
}

export function getConversation(convId, participants) {
    const c = store();
    if (!c[convId]) {
        c[convId] = { participants: participants || convId.split('|'), messages: [] };
    }
    return c[convId];
}

export function addMessage(convId, msg, participants) {
    const conv = getConversation(convId, participants);
    conv.messages.push(msg);
    saveSettings();
    return conv;
}
