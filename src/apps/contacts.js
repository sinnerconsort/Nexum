// Nexum — apps/contacts.js
// Manage the roster. Lists pack cast + your added contacts (+ active fallback).
// Add from an ST card or by hand; remove the ones you added (pack/active are fixed).
// Tapping a contact hands off into its Messages thread.

import {
    getRoster, listCards, contactFromCard, addUserContact,
    removeUserContact, makeManualContact,
} from '../contacts.js';
import { openApp } from '../router.js';

function stx() { return window.SillyTavern?.getContext?.() ?? null; }

export function mountContacts(mountEl, ctx) {
    const pack = ctx?.pack || null;
    if (ctx?.screen) { ctx.screen.setTitle('Contacts'); ctx.screen.setBack(null); }

    let adding = false;

    function render() {
        mountEl.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'nexum-ct-wrap';

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'nexum-ct-add';
        addBtn.innerHTML = adding ? '<i class="fa-solid fa-xmark"></i> Cancel' : '<i class="fa-solid fa-plus"></i> Add contact';
        addBtn.addEventListener('click', () => { adding = !adding; render(); });
        wrap.appendChild(addBtn);

        if (adding) wrap.appendChild(buildAddForm());

        const roster = getRoster(pack);
        const list = document.createElement('div');
        list.className = 'nexum-ct-list';
        if (!roster.length) {
            const empty = document.createElement('div');
            empty.className = 'nexum-empty';
            empty.textContent = 'No contacts yet. Add one above.';
            list.appendChild(empty);
        }
        for (const ct of roster) list.appendChild(rowFor(ct));
        wrap.appendChild(list);

        mountEl.appendChild(wrap);
    }

    function rowFor(ct) {
        const row = document.createElement('div');
        row.className = 'nexum-ct-row';

        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'nexum-ct-open';
        open.appendChild(avatarEl(ct));
        const meta = document.createElement('div');
        meta.className = 'nexum-ct-meta';
        const handle = ct.handle ? `<span class="nexum-ct-handle">${esc(ct.handle)}</span>` : '';
        meta.innerHTML = `<span class="nexum-ct-name">${esc(ct.name)}</span>${handle}<span class="nexum-ct-source">${esc(ct.source)}</span>`;
        open.appendChild(meta);
        open.addEventListener('click', () => {
            openApp('messages', { label: 'Messages', startContactId: ct.id });
        });
        row.appendChild(open);

        // Only user-added contacts can be removed.
        if (ct.source === 'card' || ct.source === 'manual') {
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'nexum-ct-del';
            del.innerHTML = '<i class="fa-solid fa-trash"></i>';
            del.title = `Remove ${ct.name}`;
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                removeUserContact(ct.id);
                render();
            });
            row.appendChild(del);
        }
        return row;
    }

    function buildAddForm() {
        const form = document.createElement('div');
        form.className = 'nexum-ct-form';

        let mode = 'card';
        const modes = document.createElement('div');
        modes.className = 'nexum-ct-modes';
        const cardBtn = tab('From a card', () => switchMode('card'));
        const manualBtn = tab('Manual', () => switchMode('manual'));
        modes.appendChild(cardBtn);
        modes.appendChild(manualBtn);
        form.appendChild(modes);

        const fields = document.createElement('div');
        fields.className = 'nexum-ct-fields';
        form.appendChild(fields);

        function tab(label, fn) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'nexum-ct-tab';
            b.textContent = label;
            b.addEventListener('click', fn);
            return b;
        }

        function switchMode(m) {
            mode = m;
            cardBtn.classList.toggle('active', m === 'card');
            manualBtn.classList.toggle('active', m === 'manual');
            renderFields();
        }

        function renderFields() {
            fields.innerHTML = '';
            if (mode === 'card') {
                const cards = listCards();
                if (!cards.length) {
                    fields.innerHTML = '<div class="nexum-empty"><small>No character cards found in ST.</small></div>';
                    return;
                }
                const sel = document.createElement('select');
                sel.className = 'nexum-ct-select';
                for (const c of cards) {
                    const o = document.createElement('option');
                    o.value = c.name;
                    o.textContent = c.name;
                    sel.appendChild(o);
                }
                fields.appendChild(sel);
                fields.appendChild(saveBtn(() => {
                    const c = stx();
                    const card = c?.characters?.find((x) => x.name === sel.value);
                    const contact = contactFromCard(card, { source: 'card' });
                    if (contact && addUserContact(contact)) { adding = false; render(); }
                }));
            } else {
                const name = textInput('Name');
                const handle = textInput('Handle (optional, e.g. @lazybones)');
                const persona = document.createElement('textarea');
                persona.className = 'nexum-ct-textarea';
                persona.placeholder = 'Voice & personality — how they text, who they are.';
                persona.rows = 4;
                fields.appendChild(name);
                fields.appendChild(handle);
                fields.appendChild(persona);
                fields.appendChild(saveBtn(() => {
                    if (!name.value.trim()) return;
                    const contact = makeManualContact({ name: name.value, handle: handle.value, persona: persona.value });
                    if (addUserContact(contact)) { adding = false; render(); }
                }));
            }
        }

        switchMode('card');
        return form;
    }

    function textInput(ph) {
        const i = document.createElement('input');
        i.type = 'text';
        i.className = 'nexum-ct-input';
        i.placeholder = ph;
        i.autocomplete = 'off';
        return i;
    }
    function saveBtn(fn) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nexum-ct-save';
        b.textContent = 'Add';
        b.addEventListener('click', fn);
        return b;
    }

    render();
}

function avatarEl(ct) {
    const a = document.createElement('div');
    a.className = 'nexum-msg-avatar';
    if (ct.avatar) {
        const img = document.createElement('img');
        img.src = ct.avatar; img.alt = ct.name;
        img.onerror = () => { a.textContent = initial(ct.name); a.classList.add('fallback'); };
        a.appendChild(img);
    } else { a.textContent = initial(ct.name); a.classList.add('fallback'); }
    return a;
}
function initial(name) { return (String(name || '?').trim()[0] || '?').toUpperCase(); }
function esc(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }
