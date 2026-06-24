// Nexum — apps/knucklebones.js
// A self-contained Knucklebones toy. 100% local: JS owns the dice, the board, the
// scoring, and the opponent. No AI/model is involved anywhere — that's the whole
// point of a toy app. Rules: roll a d6, drop it in one of your three columns.
// Matching dice in a column multiply (value x count^2). Dropping a die destroys
// every matching die in the opponent's mirrored column. A full board ends it;
// higher total wins.

import { notify } from '../notifications.js';

// Pip layouts: which of the 9 cells (0..8) show a dot for each die value.
const PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
};

export function mountKnucklebones(mountEl) {
    const state = {
        player: [[], [], []],
        ai: [[], [], []],
        turn: 'player',
        die: null,
        over: false,
        busy: false,
        result: null,
        scores: { p: 0, a: 0 },
    };

    const root = document.createElement('div');
    root.className = 'nexum-kb';
    mountEl.innerHTML = '';
    mountEl.appendChild(root);

    // ---- scoring ----
    function colScore(col) {
        const counts = {};
        for (const v of col) counts[v] = (counts[v] || 0) + 1;
        let s = 0;
        for (const v in counts) { const k = counts[v]; s += Number(v) * k * k; }
        return s;
    }
    const total = (grid) => grid.reduce((a, c) => a + colScore(c), 0);
    const gridFull = (grid) => grid.every((c) => c.length >= 3);
    const rollDie = () => 1 + Math.floor(Math.random() * 6);

    // ---- die element (pip face) ----
    function dieFace(v, cls = '') {
        const d = document.createElement('div');
        d.className = `nexum-die ${cls}`.trim();
        const on = new Set(PIPS[v] || []);
        for (let i = 0; i < 9; i++) {
            const pip = document.createElement('span');
            pip.className = on.has(i) ? 'nexum-pip on' : 'nexum-pip';
            d.appendChild(pip);
        }
        return d;
    }

    // ---- a single 3-slot column ----
    function columnEl(values, who, colIndex) {
        const col = document.createElement('div');
        col.className = `nexum-kb-col ${who}`;

        const canDrop = who === 'player' && !state.over && !state.busy
            && state.turn === 'player' && state.die != null && values.length < 3;
        if (canDrop) {
            col.classList.add('droppable');
            col.addEventListener('click', () => onPlayerColumn(colIndex));
        }

        // Build 3 slots. Player stacks toward the centre (bottom-up); opponent top-down.
        const slots = [null, null, null];
        if (who === 'player') {
            for (let i = 0; i < values.length; i++) slots[2 - i] = values[values.length - 1 - i];
        } else {
            for (let i = 0; i < values.length; i++) slots[i] = values[i];
        }
        for (const v of slots) {
            const cell = document.createElement('div');
            cell.className = 'nexum-kb-cell';
            if (v != null) cell.appendChild(dieFace(v, 'small'));
            col.appendChild(cell);
        }

        const sub = document.createElement('div');
        sub.className = 'nexum-kb-colscore';
        sub.textContent = colScore(values) || '';
        if (who === 'player') col.appendChild(sub);
        else col.insertBefore(sub, col.firstChild);
        return col;
    }

    function gridEl(grid, who) {
        const g = document.createElement('div');
        g.className = `nexum-kb-grid ${who}`;
        for (let c = 0; c < 3; c++) g.appendChild(columnEl(grid[c], who, c));
        return g;
    }

    // ---- render ----
    function render() {
        root.innerHTML = '';

        // Opponent
        const oppHead = document.createElement('div');
        oppHead.className = 'nexum-kb-head';
        oppHead.innerHTML = `<span>Opponent</span><span class="nexum-kb-total">${total(state.ai)}</span>`;
        root.appendChild(oppHead);
        root.appendChild(gridEl(state.ai, 'ai'));

        // Centre status
        const status = document.createElement('div');
        status.className = 'nexum-kb-status';
        if (state.over) {
            // overlay handles messaging
        } else if (state.turn === 'player' && state.die != null) {
            status.appendChild(document.createTextNode('Your roll — tap a column'));
            status.appendChild(dieFace(state.die, 'roll'));
        } else if (state.turn === 'ai') {
            status.appendChild(document.createTextNode('Opponent rolled'));
            if (state.die != null) status.appendChild(dieFace(state.die, 'roll'));
        }
        root.appendChild(status);

        // Player
        root.appendChild(gridEl(state.player, 'player'));
        const youHead = document.createElement('div');
        youHead.className = 'nexum-kb-head';
        youHead.innerHTML = `<span>You</span><span class="nexum-kb-total">${total(state.player)}</span>`;
        root.appendChild(youHead);

        // New game button
        const bar = document.createElement('div');
        bar.className = 'nexum-kb-bar';
        const ng = document.createElement('button');
        ng.type = 'button';
        ng.className = 'nexum-kb-btn';
        ng.textContent = 'New game';
        ng.addEventListener('click', newGame);
        bar.appendChild(ng);
        root.appendChild(bar);

        if (state.over) renderOverlay();
    }

    function renderOverlay() {
        const ov = document.createElement('div');
        ov.className = 'nexum-kb-overlay';
        const verdict = state.result === 'win' ? 'You win'
            : state.result === 'lose' ? 'You lose' : 'Tie';
        ov.innerHTML = `
            <div class="nexum-kb-verdict">${verdict}</div>
            <div class="nexum-kb-final">${state.scores.p} — ${state.scores.a}</div>
        `;
        const again = document.createElement('button');
        again.type = 'button';
        again.className = 'nexum-kb-btn primary';
        again.textContent = 'Play again';
        again.addEventListener('click', newGame);
        ov.appendChild(again);
        root.appendChild(ov);
    }

    // ---- turn logic ----
    function place(who, c) {
        const own = who === 'player' ? state.player : state.ai;
        const opp = who === 'player' ? state.ai : state.player;
        opp[c] = opp[c].filter((v) => v !== state.die); // destruction
        own[c].push(state.die);
    }

    function afterPlace(placer) {
        const placerGrid = placer === 'player' ? state.player : state.ai;
        state.die = null;
        if (gridFull(placerGrid)) { endGame(); return; }
        state.turn = placer === 'player' ? 'ai' : 'player';
        render();
        startTurn();
    }

    function onPlayerColumn(c) {
        if (state.over || state.busy || state.turn !== 'player' || state.die == null) return;
        if (state.player[c].length >= 3) return;
        place('player', c);
        afterPlace('player');
    }

    // Greedy one-ply AI: own gain + opponent loss, tiny jitter to break ties.
    function aiChoose() {
        const legal = [0, 1, 2].filter((c) => state.ai[c].length < 3);
        let best = legal[0];
        let bestScore = -Infinity;
        for (const c of legal) {
            const gain = colScore([...state.ai[c], state.die]) - colScore(state.ai[c]);
            const oppCol = state.player[c];
            const oppLoss = colScore(oppCol) - colScore(oppCol.filter((v) => v !== state.die));
            const sc = gain + oppLoss + Math.random() * 0.5;
            if (sc > bestScore) { bestScore = sc; best = c; }
        }
        return best;
    }

    function startTurn() {
        if (state.over) return;
        state.die = rollDie();
        if (state.turn === 'ai') {
            state.busy = true;
            render();
            setTimeout(() => {
                const c = aiChoose();
                place('ai', c);
                state.busy = false;
                afterPlace('ai');
            }, 650);
        } else {
            render(); // wait for the player's tap
        }
    }

    function endGame() {
        state.over = true;
        state.die = null;
        const p = total(state.player);
        const a = total(state.ai);
        state.scores = { p, a };
        state.result = p > a ? 'win' : (p < a ? 'lose' : 'tie');
        render();
        const msg = state.result === 'win' ? `You won knucklebones ${p}–${a}`
            : state.result === 'lose' ? `You lost knucklebones ${a}–${p}`
                : `Knucklebones tied ${p}–${p}`;
        try { notify(msg, { app: 'games' }); } catch (_) { /* ignore */ }
    }

    function newGame() {
        state.player = [[], [], []];
        state.ai = [[], [], []];
        state.turn = 'player';
        state.die = null;
        state.over = false;
        state.busy = false;
        state.result = null;
        startTurn();
    }

    newGame();
}
