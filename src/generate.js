// Nexum — generate.js
// Isolated AI generation that never touches the main chat. Primary path:
// ConnectionManagerRequestService with the user's CURRENT profile — uses whatever
// backend is already active, no setup, no chat pollution. Fallback: generateQuietPrompt.
// messages = [{ role: 'system'|'user'|'assistant', content }]. Reused by every
// AI-backed app (Messages now; search/weather/feed later).

import { getSettings } from './state.js';

function ctx() { return window.SillyTavern?.getContext?.() ?? null; }

export async function isolatedGenerate(messages, maxTokens) {
    const c = ctx();
    if (!c) throw new Error('No SillyTavern context');
    // Never hardcode the budget (the reasoning-model tax). Read from settings.
    const budget = maxTokens || getSettings().messageTokens || 1000;

    const profileId = c.extensionSettings?.connectionManager?.selectedProfile;
    if (c.ConnectionManagerRequestService && profileId) {
        const r = await c.ConnectionManagerRequestService.sendRequest(
            profileId,
            messages,
            budget,
            { extractData: true, includePreset: true, includeInstruct: false },
            {},
        );
        return extractText(r);
    }

    // Fallback for builds without ConnectionManager: flatten and use a quiet prompt.
    if (typeof c.generateQuietPrompt === 'function') {
        const flat = messages.map((m) => `[${m.role}] ${m.content}`).join('\n\n');
        const r = await c.generateQuietPrompt(flat, false, false);
        return extractText(r);
    }

    throw new Error('No generation method available — set a Connection Profile in ST.');
}

function extractText(r) {
    if (r == null) return '';
    if (typeof r === 'string') return r;
    return r.content ?? r.text ?? r.message ?? r.response ?? '';
}

// Strip hidden chain-of-thought blocks so they never leak into a text bubble.
const REASONING_RE = /<(think|thinking|thought|reason|reasoning)[^>]*>[\s\S]*?<\/\1>/gi;
export function stripReasoning(text) {
    return String(text || '').replace(REASONING_RE, '').trim();
}
