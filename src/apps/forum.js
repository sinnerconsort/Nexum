// Nexum — apps/forum.js
// The centerpiece: an early-2000s-style message board. boards -> threads -> posts.
// Cast members (the roster) post in character; you can start threads and reply, and
// "summon activity" to have the board come alive. Content generates via isolated
// calls (structured JSON), is parsed defensively, and persists per-pack. The look is
// all --nexum-* tokens, so a pack (UnderNet) reskins it into full BBS later.

import { getSettings } from '../state.js';
import { isolatedGenerate, stripReasoning } from '../generate.js';
import { getRoster } from '../contacts.js';
import {
    listThreads, addThread, getThread, addPosts, uid,
} from '../forumStore.js';

function stx() { return window.SillyTavern?.getContext?.() ?? null; }
function packId() { return getSettings().activePackId || 'neutral'; }

const DEFAULT_BOARDS = [
    { id: 'general', name: 'General', desc: 'Anything goes.' },
    { id: 'rumors', name: 'Rumors', desc: 'Hearsay, gossip, the unverified.' },
    { id: 'offtopic', name: 'Off-Topic', desc: 'Nonsense and noise.' },
];

let busy = false;

export function mountForum(mountEl, ctx) {
    const screen = ctx?.screen || null;
    const pack = ctx?.pack || null;
    const boards = (pack?.forum?.boards?.length ? pack.forum.boards : DEFAULT_BOARDS);
    const forumTitle = pack?.forum?.title || 'Forum';

    function showBoards() {
        if (screen) { screen.setTitle(forumTitle); screen.setBack(null); }
        renderBoards();
    }

    function renderBoards() {
        mountEl.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'nexum-fr-boards';
        for (const b of boards) {
            const n = listThreads(packId(), b.id).length;
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'nexum-fr-board';
            row.innerHTML = `
                <span class="nexum-fr-board-name">${esc(b.name)}</span>
                <span class="nexum-fr-board-desc">${esc(b.desc || '')}</span>
                <span class="nexum-fr-board-count">${n} ${n === 1 ? 'thread' : 'threads'}</span>
            `;
            row.addEventListener('click', () => showBoard(b));
            wrap.appendChild(row);
        }
        mountEl.appendChild(wrap);
    }

    function showBoard(board) {
        if (screen) { screen.setTitle(board.name); screen.setBack(showBoards); }
        renderBoard(board);
    }

    function renderBoard(board) {
        mountEl.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'nexum-fr-threadlist';

        const bar = document.createElement('div');
        bar.className = 'nexum-fr-bar';
        bar.appendChild(actionBtn('New thread', 'pen', () => openComposer(board)));
        bar.appendChild(actionBtn('Summon activity', 'wand-magic-sparkles', async () => {
            await summon(board);
            renderBoard(board);
        }));
        wrap.appendChild(bar);

        const threads = listThreads(packId(), board.id);
        if (!threads.length) {
            const empty = document.createElement('div');
            empty.className = 'nexum-empty';
            empty.innerHTML = 'This board is quiet.<br><small>Summon activity, or start a thread.</small>';
            wrap.appendChild(empty);
        } else {
            for (const t of threads) {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'nexum-fr-thread-row';
                const replies = (t.posts || []).length;
                row.innerHTML = `
                    <span class="nexum-fr-thread-title">${esc(t.title)}</span>
                    <span class="nexum-fr-thread-meta">${esc(t.author)} · ${replies} ${replies === 1 ? 'reply' : 'replies'}</span>
                `;
                row.addEventListener('click', () => showThread(board, t.id));
                wrap.appendChild(row);
            }
        }
        mountEl.appendChild(wrap);
    }

    function showThread(board, threadId) {
        const t = getThread(packId(), board.id, threadId);
        if (!t) { showBoard(board); return; }
        if (screen) { screen.setTitle(trim(t.title, 24)); screen.setBack(() => showBoard(board)); }
        renderThread(board, t);
    }

    function renderThread(board, t) {
        mountEl.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'nexum-fr-thread';

        const scroll = document.createElement('div');
        scroll.className = 'nexum-fr-posts';

        const title = document.createElement('div');
        title.className = 'nexum-fr-thread-head';
        title.textContent = t.title;
        scroll.appendChild(title);

        scroll.appendChild(postEl({ author: t.author, authorId: t.authorId, body: t.body, ts: t.ts }, true));
        for (const p of (t.posts || [])) scroll.appendChild(postEl(p, false));
        wrap.appendChild(scroll);

        const bar = document.createElement('div');
        bar.className = 'nexum-fr-bar';
        bar.appendChild(actionBtn('Nudge replies', 'comments', async () => {
            await summonReplies(board, t);
            renderThread(board, getThread(packId(), board.id, t.id));
        }));
        wrap.appendChild(bar);

        const composer = document.createElement('div');
        composer.className = 'nexum-fr-reply';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'nexum-fr-reply-input';
        input.placeholder = 'Post a reply…';
        input.autocomplete = 'off';
        const send = document.createElement('button');
        send.type = 'button';
        send.className = 'nexum-fr-reply-send';
        send.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        const doReply = async () => {
            const body = input.value.trim();
            if (!body || busy) return;
            input.value = '';
            addPosts(packId(), board.id, t.id, [userPost(body)]);
            renderThread(board, getThread(packId(), board.id, t.id));
            await summonReplies(board, getThread(packId(), board.id, t.id), true);
            renderThread(board, getThread(packId(), board.id, t.id));
        };
        send.addEventListener('click', doReply);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doReply(); } });
        composer.appendChild(input);
        composer.appendChild(send);
        wrap.appendChild(composer);

        mountEl.appendChild(wrap);
        requestAnimationFrame(() => { scroll.scrollTop = 0; });
    }

    // ---- new-thread composer ----
    function openComposer(board) {
        mountEl.innerHTML = '';
        if (screen) { screen.setTitle('New thread'); screen.setBack(() => showBoard(board)); }
        const form = document.createElement('div');
        form.className = 'nexum-fr-compose';
        const title = document.createElement('input');
        title.type = 'text'; title.className = 'nexum-fr-input'; title.placeholder = 'Thread title';
        const body = document.createElement('textarea');
        body.className = 'nexum-fr-textarea'; body.rows = 5; body.placeholder = 'Say something…';
        const post = actionBtn('Post thread', 'paper-plane', async () => {
            if (!title.value.trim() || !body.value.trim() || busy) return;
            const t = {
                id: uid(), title: title.value.trim(),
                author: userName(), authorId: 'user', body: body.value.trim(),
                ts: Date.now(), posts: [],
            };
            addThread(packId(), board.id, t);
            showThread(board, t.id);
            await summonReplies(board, getThread(packId(), board.id, t.id), true);
            renderThread(board, getThread(packId(), board.id, t.id));
        });
        form.appendChild(title);
        form.appendChild(body);
        form.appendChild(post);
        mountEl.appendChild(form);
    }

    // ---- generation ----
    async function summon(board) {
        if (busy) return;
        const roster = getRoster(pack);
        if (!roster.length) { flash(mountEl, 'Add contacts first — the board needs posters.'); return; }
        busy = true; setBusy(mountEl, true);
        try {
            const raw = await isolatedGenerate(threadsPrompt(board, roster, pack), getSettings().forumTokens || 1800);
            const arr = parseJsonArray(raw);
            for (const item of arr.slice(0, 4)) {
                if (!item || !item.title || !item.body) continue;
                const a = resolveAuthor(roster, item.author);
                addThread(packId(), board.id, {
                    id: uid(), title: String(item.title).slice(0, 120),
                    author: a.name, authorId: a.id, body: String(item.body).slice(0, 2000),
                    ts: Date.now(),
                    posts: (Array.isArray(item.replies) ? item.replies : []).slice(0, 4).map((r) => {
                        const ra = resolveAuthor(roster, r.author);
                        return { id: uid(), author: ra.name, authorId: ra.id, body: String(r.body || '').slice(0, 2000), ts: Date.now() };
                    }),
                });
            }
        } catch (e) {
            flash(mountEl, 'Couldn’t summon activity — try again.');
        } finally {
            busy = false; setBusy(mountEl, false);
        }
    }

    async function summonReplies(board, t, toUser = false) {
        if (busy || !t) return;
        const roster = getRoster(pack);
        if (!roster.length) return;
        busy = true; setBusy(mountEl, true);
        try {
            const raw = await isolatedGenerate(repliesPrompt(t, roster, pack, toUser), getSettings().forumTokens || 1400);
            const arr = parseJsonArray(raw);
            const posts = arr.slice(0, 3).filter((r) => r && r.body).map((r) => {
                const ra = resolveAuthor(roster, r.author);
                return { id: uid(), author: ra.name, authorId: ra.id, body: String(r.body).slice(0, 2000), ts: Date.now() };
            });
            if (posts.length) addPosts(packId(), board.id, t.id, posts);
        } catch (e) {
            /* silent — nudge just yields nothing */
        } finally {
            busy = false; setBusy(mountEl, false);
        }
    }

    // ---- helpers using closures ----
    function postEl(p, isOp) {
        const roster = getRoster(pack);
        const c = roster.find((x) => x.id === p.authorId);
        const el = document.createElement('div');
        el.className = `nexum-fr-post ${isOp ? 'op' : ''} ${p.authorId === 'user' ? 'mine' : ''}`.trim();
        el.innerHTML = `
            <div class="nexum-fr-post-head">
                <span class="nexum-fr-post-author">${esc(p.author)}</span>
                <span class="nexum-fr-post-time">${timeAgo(p.ts)}</span>
            </div>
            <div class="nexum-fr-post-body">${esc(p.body)}</div>
        `;
        const head = el.querySelector('.nexum-fr-post-head');
        head.insertBefore(avatarEl(c, p.author), head.firstChild);
        return el;
    }

    showBoards();
}

// ---- prompts ----
function castBlock(roster) {
    return roster.map((c) => `- ${c.name}${c.handle ? ` (${c.handle})` : ''}: ${(c.persona || '').replace(/\s+/g, ' ').slice(0, 220)}`).join('\n');
}
function threadsPrompt(board, roster, pack) {
    const premise = pack?.forum?.premise || '';
    const sys = `You write posts for an early-2000s-style internet message board called "${board.name}"${board.desc ? ` (${board.desc})` : ''}.\n`
        + `${premise ? `Setting: ${premise}\n` : ''}`
        + `The posters are these characters — write each strictly in their own voice:\n${castBlock(roster)}\n\n`
        + `Return ONLY a JSON array, no prose and no markdown fences. 2-3 threads. Each element:\n`
        + `{"author": a poster's name or handle from the cast, "title": short thread title, "body": the opening post, "replies": [{"author": a cast member, "body": reply text}]}\n`
        + `1-3 replies per thread; posters can bicker or riff on each other. Forum-casual, in character. No narration, no asterisk actions.`;
    return [{ role: 'system', content: sys }, { role: 'user', content: `Generate fresh threads for "${board.name}".` }];
}
function repliesPrompt(t, roster, pack, toUser) {
    const premise = pack?.forum?.premise || '';
    const thread = `THREAD: ${t.title}\n${t.author}: ${t.body}\n` + (t.posts || []).map((p) => `${p.author}: ${p.body}`).join('\n');
    const sys = `You write replies for an early-2000s message board.\n${premise ? `Setting: ${premise}\n` : ''}`
        + `Posters and their voices:\n${castBlock(roster)}\n\n`
        + `Return ONLY a JSON array, no prose or fences: [{"author": a cast member, "body": reply text}]. `
        + `1-2 replies reacting to the thread below${toUser ? ', especially the most recent post' : ''}, in character. No narration.`;
    return [{ role: 'system', content: sys }, { role: 'user', content: thread }];
}

// ---- parsing + attribution ----
function parseJsonArray(raw) {
    let t = stripReasoning(raw || '').replace(/```(?:json)?/gi, '').trim();
    const i = t.indexOf('[');
    const j = t.lastIndexOf(']');
    if (i >= 0 && j > i) t = t.slice(i, j + 1);
    const arr = JSON.parse(t);
    return Array.isArray(arr) ? arr : [];
}
function resolveAuthor(roster, raw) {
    const name = String(raw || '').trim();
    const key = name.replace(/^@/, '').toLowerCase();
    const hit = roster.find((c) => c.name.toLowerCase() === key
        || (c.handle || '').replace(/^@/, '').toLowerCase() === key
        || c.name.toLowerCase() === name.toLowerCase());
    if (hit) return { name: hit.name, id: hit.id };
    // Unknown poster — forums have randos too. Keep the name, generic identity.
    return { name: name || 'anon', id: `guest:${key || 'anon'}` };
}

// ---- small UI ----
function userName() { return stx()?.name1 || 'You'; }
function userPost(body) { return { id: uid(), author: userName(), authorId: 'user', body, ts: Date.now() }; }
function actionBtn(label, icon, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nexum-fr-action';
    b.innerHTML = `<i class="fa-solid fa-${icon}"></i> ${esc(label)}`;
    b.addEventListener('click', fn);
    return b;
}
function avatarEl(contact, name) {
    const a = document.createElement('div');
    a.className = 'nexum-fr-avatar';
    if (contact?.avatar) {
        const img = document.createElement('img');
        img.src = contact.avatar; img.alt = contact.name;
        img.onerror = () => { a.textContent = initial(name); a.classList.add('fallback'); };
        a.appendChild(img);
    } else { a.textContent = initial(name); a.classList.add('fallback'); }
    return a;
}
function setBusy(mountEl, on) {
    let o = mountEl.querySelector('.nexum-fr-busy');
    if (on && !o) {
        o = document.createElement('div');
        o.className = 'nexum-fr-busy';
        o.innerHTML = '<span></span><span></span><span></span> Summoning…';
        mountEl.appendChild(o);
    } else if (!on && o) { o.remove(); }
}
function flash(mountEl, msg) {
    const f = document.createElement('div');
    f.className = 'nexum-fr-flash';
    f.textContent = msg;
    mountEl.appendChild(f);
    setTimeout(() => f.remove(), 2600);
}
function timeAgo(ts) {
    const s = Math.max(0, Math.floor((Date.now() - (ts || Date.now())) / 1000));
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
}
function initial(name) { return (String(name || '?').trim().replace(/^@/, '')[0] || '?').toUpperCase(); }
function trim(s, n) { const t = String(s || ''); return t.length > n ? `${t.slice(0, n)}…` : t; }
function esc(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }
