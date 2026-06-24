// Nexum — forumStore.js
// Per-pack forum state: boards -> threads -> posts. Stored globally but keyed by the
// active pack id, so each world keeps its own forum and it ACCUMULATES across sessions
// (the "the internet never stops" feel). Threads are capped per board so it can't grow
// without bound.

import { getSettings, saveSettings } from './state.js';

const MAX_THREADS_PER_BOARD = 40;

function root() {
    const s = getSettings();
    if (!s.forums || typeof s.forums !== 'object') s.forums = {};
    return s.forums;
}
function packForum(packId) {
    const r = root();
    if (!r[packId] || typeof r[packId] !== 'object') r[packId] = { boards: {} };
    if (!r[packId].boards) r[packId].boards = {};
    return r[packId];
}

export function getBoard(packId, boardId) {
    const pf = packForum(packId);
    if (!pf.boards[boardId]) pf.boards[boardId] = { threads: [] };
    if (!Array.isArray(pf.boards[boardId].threads)) pf.boards[boardId].threads = [];
    return pf.boards[boardId];
}

export function listThreads(packId, boardId) { return getBoard(packId, boardId).threads; }

export function addThread(packId, boardId, thread) {
    const b = getBoard(packId, boardId);
    b.threads.unshift(thread);
    if (b.threads.length > MAX_THREADS_PER_BOARD) b.threads.length = MAX_THREADS_PER_BOARD;
    saveSettings();
    return thread;
}

export function getThread(packId, boardId, threadId) {
    return getBoard(packId, boardId).threads.find((t) => t.id === threadId) || null;
}

export function addPosts(packId, boardId, threadId, posts) {
    const t = getThread(packId, boardId, threadId);
    if (t) {
        if (!Array.isArray(t.posts)) t.posts = [];
        t.posts.push(...posts);
        t.bumpedTs = Date.now();
        saveSettings();
    }
    return t;
}

export function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
