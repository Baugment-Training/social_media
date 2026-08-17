/* BAUGMENT — Idea Bank
   The front of the pipeline. Everything downstream (Calendar, Planner,
   Campaigns) assumes you already know what you're making; this is where you
   don't yet. Two jobs, in this order:

     1. Make writing an idea down cheaper than losing it — hence the single
        capture line at the top, which needs one keystroke and no decisions.
     2. Give an idea somewhere to mature. raw → developing → ready, then
        "Send to planner", which is the only exit that matters.

   An idea that reaches the planner is marked used and keeps a link back, so
   the bank stays an honest record of what was thought of, not just what got
   made. */

BAUGMENT.views.ideas = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const B = BAUGMENT.bits;
  const store = BAUGMENT.store;
  const icon = BAUGMENT.icon.render;
  const esc = U.esc;

  let layout = 'board';
  let showUsed = false;
  let q = '';
  let sortKey = 'updated';

  /* --- Data ---------------------------------------------------------------- */

  /* The shared filter bar drives this too, minus the date range — an idea has
     no publish date, so windowing it would just hide things. */
  function ideaRows() {
    const f = store.getFilters();
    const needle = (q || f.q || '').toLowerCase();
    return (store.state().ideas || []).filter((i) => {
      if (!showUsed && (i.status === 'used' || i.status === 'parked')) return false;
      if (f.platform !== 'all' && i.platform !== f.platform && i.platform !== 'any') return false;
      if (f.campaign !== 'all' && i.campaign_id !== f.campaign) return false;
      if (f.pillar !== 'all' && i.pillar_id !== f.pillar) return false;
      if (f.author !== 'all' && i.owner !== f.author) return false;
      if (needle) {
        const hay = (i.title + ' ' + i.notes + ' ' + (i.tags || []).join(' ') + ' ' +
          i.origin + ' ' + store.pillarName(i.pillar_id)).toLowerCase();
        if (hay.indexOf(needle) === -1) return false;
      }
      return true;
    });
  }

  const POTENTIAL_RANK = { high: 3, medium: 2, low: 1 };

  function sortRows(list) {
    const by = {
      updated: (a, b) => (b.updated_on || '').localeCompare(a.updated_on || ''),
      created: (a, b) => (b.created_on || '').localeCompare(a.created_on || ''),
      potential: (a, b) => (POTENTIAL_RANK[b.potential] || 0) - (POTENTIAL_RANK[a.potential] || 0),
      title: (a, b) => a.title.localeCompare(b.title)
    }[sortKey] || (() => 0);
    return list.slice().sort(by);
  }

  function blank(title) {
    const db = store.state();
    const today = U.iso(new Date());
    return {
      id: U.uid('idea'),
      title: title || '',
      notes: '',
      status: 'raw',
      potential: 'medium',
      origin: 'Brainstorm',
      platform: 'any',
      pillar_id: db.pillars[0] ? db.pillars[0].id : null,
      campaign_id: null,
      tags: [],
      source_url: '',
      owner: '',
      created_on: today,
      updated_on: today,
      promoted_to: null,
      source: 'manual'
    };
  }

  const parseTags = (v) => String(v || '')
    .split(/[,\n]/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean).slice(0, 8);

  /* --- Promotion ----------------------------------------------------------- */

  /* The whole point of the bank. Copies what the planner can use, leaves the
     idea in place marked used, and links the two so the trail survives. */
  function promote(idea, onDone) {
    if (idea.promoted_to && store.state().planner.some((p) => p.id === idea.promoted_to)) {
      BAUGMENT.ui.toast('Already in the planner', 'This idea was sent through once. Open it from the Content Planner.', 'info');
      return;
    }
    const draft = Object.assign(BAUGMENT.planning.blank(), {
      title: idea.title,
      caption: idea.notes || '',
      platform: idea.platform && idea.platform !== 'any' ? idea.platform : (store.livePlatforms()[0] || {}).id || 'linkedin',
      pillar_id: idea.pillar_id,
      campaign_id: idea.campaign_id,
      owner: idea.owner || '',
      priority: idea.potential === 'high' ? 'high' : idea.potential === 'low' ? 'low' : 'medium',
      status: 'draft',
      notes: 'From the Idea Bank' + (idea.origin ? ' · ' + idea.origin : '') +
        (idea.source_url ? '\n' + idea.source_url : '')
    });

    BAUGMENT.planning.edit(draft, () => {
      /* Only mark it used if the planned post actually got saved. */
      if (!store.state().planner.some((p) => p.id === draft.id)) return;
      store.upsert('ideas', Object.assign({}, idea, {
        status: 'used', promoted_to: draft.id, updated_on: U.iso(new Date())
      }));
      BAUGMENT.ui.toast('Sent to the planner', idea.title);
      if (onDone) onDone();
    });
  }

  /* --- Editor -------------------------------------------------------------- */

  function edit(item, onSaved) {
    const db = store.state();
    const isNew = !(db.ideas || []).some((x) => x.id === item.id);
    const idea = Object.assign({}, item);
    idea.tags = (idea.tags || []).slice();

    const sel = (name, options, value, labelFn) =>
      '<select class="select" data-f="' + name + '">' +
      options.map((o) => {
        const v = typeof o === 'string' ? o : o.id;
        const l = labelFn ? labelFn(o) : (typeof o === 'string' ? o : o.name);
        return '<option value="' + esc(v) + '"' + (String(value) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';
      }).join('') + '</select>';

    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    const body =
      '<label class="field"><span class="field__label">The idea, in one line</span>' +
        '<input class="input" data-f="title" value="' + esc(idea.title) + '" ' +
        'placeholder="Why completion rate is a vanity metric"></label>' +

      '<label class="field"><span class="field__label">Notes &amp; draft thinking</span>' +
        '<textarea class="textarea" data-f="notes" style="min-height:130px" ' +
        'placeholder="Angle, hook, what the data would be, who it is for, why now. Half-formed is fine — that is what this section is for.">' +
        esc(idea.notes) + '</textarea>' +
        '<span class="field__hint">Nothing here is published. Write it the way you would say it out loud.</span></label>' +

      '<div class="grid-3">' +
        '<label class="field"><span class="field__label">Stage</span>' +
          sel('status', S.IDEA_STATUS, idea.status, (o) => S.IDEA_STATUS_LABEL[o]) + '</label>' +
        '<label class="field"><span class="field__label">Potential</span>' +
          sel('potential', S.IDEA_POTENTIAL, idea.potential, cap) + '</label>' +
        '<label class="field"><span class="field__label">Where it came from</span>' +
          sel('origin', S.IDEA_SOURCES, idea.origin) + '</label>' +
      '</div>' +

      '<div class="grid-3">' +
        '<label class="field"><span class="field__label">Likely platform</span>' +
          '<select class="select" data-f="platform"><option value="any"' +
          (idea.platform === 'any' || !idea.platform ? ' selected' : '') + '>Not decided</option>' +
          store.livePlatforms().map((p) => '<option value="' + p.id + '"' +
            (idea.platform === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') +
          '</select></label>' +
        '<label class="field"><span class="field__label">Content pillar</span>' +
          '<select class="select" data-f="pillar_id"><option value="">Unassigned</option>' +
          db.pillars.map((p) => '<option value="' + p.id + '"' +
            (idea.pillar_id === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') +
          '</select></label>' +
        '<label class="field"><span class="field__label">Owner</span>' +
          '<input class="input" data-f="owner" value="' + esc(idea.owner || '') + '" placeholder="Who is chasing it"></label>' +
      '</div>' +

      '<div class="grid-2">' +
        '<label class="field"><span class="field__label">Campaign it could serve</span>' +
          '<select class="select" data-f="campaign_id"><option value="">No campaign</option>' +
          db.campaigns.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) =>
            '<option value="' + c.id + '"' + (idea.campaign_id === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
          '</select></label>' +
        '<label class="field"><span class="field__label">Source link</span>' +
          '<input class="input" data-f="source_url" value="' + esc(idea.source_url || '') + '" ' +
          'placeholder="https://… the article, thread or ticket that sparked it"></label>' +
      '</div>' +

      '<label class="field" style="margin-bottom:0"><span class="field__label">Tags</span>' +
        '<input class="input" data-f="tags" value="' + esc(idea.tags.join(', ')) + '" ' +
        'placeholder="evergreen, carousel, needs-research">' +
        '<span class="field__hint">Comma separated. Tags are how you find the idea again in six months.</span></label>' +

      (idea.promoted_to ? '<p class="tiny mute" style="margin-top:14px">' +
        'Sent to the Content Planner on ' + esc(U.fmt.date(idea.updated_on)) + '.</p>' : '');

    const actions = [{ label: 'Cancel' }];

    if (!isNew) {
      actions.push({
        label: 'Delete', variant: 'danger', keepOpen: true,
        onClick: async (bodyEl, close) => {
          const ok = await BAUGMENT.ui.confirm('Delete this idea?',
            'It disappears from the bank. If it was worth keeping but not now, set it to Parked instead.', 'Delete');
          if (!ok) return false;
          store.remove('ideas', idea.id);
          BAUGMENT.ui.toast('Deleted', idea.title);
          close();
          if (onSaved) onSaved();
          return false;
        }
      });
      actions.push({
        label: 'Send to planner', keepOpen: true,
        onClick: (bodyEl, close) => { harvest(bodyEl); store.upsert('ideas', idea); close(); promote(idea, onSaved); return false; }
      });
    }

    actions.push({
      label: isNew ? 'Save idea' : 'Save changes', variant: 'primary', keepOpen: true,
      onClick: (bodyEl, close) => {
        harvest(bodyEl);
        if (!idea.title.trim()) {
          BAUGMENT.ui.toast('Give it a line', 'Even a rough title beats an untitled card three weeks from now.', 'warn');
          return false;
        }
        store.upsert('ideas', idea);
        BAUGMENT.ui.toast(isNew ? 'Idea saved' : 'Changes saved', idea.title);
        close();
        if (onSaved) onSaved();
        return false;
      }
    });

    function harvest(bodyEl) {
      bodyEl.querySelectorAll('[data-f]').forEach((f) => {
        const k = f.getAttribute('data-f');
        if (k === 'tags') idea.tags = parseTags(f.value);
        else idea[k] = (f.value === '' && (k === 'campaign_id' || k === 'pillar_id')) ? null : f.value;
      });
      idea.updated_on = U.iso(new Date());
    }

    BAUGMENT.ui.modal({ title: isNew ? 'New idea' : 'Edit idea', body, wide: true, actions });
  }

  /* --- Rendering ----------------------------------------------------------- */

  function potentialMark(p) {
    const n = { high: 3, medium: 2, low: 1 }[p] || 1;
    return '<span class="spark-rating" title="' + esc(p) + ' potential">' +
      '●'.repeat(n) + '<span style="opacity:.25">' + '●'.repeat(3 - n) + '</span></span>';
  }

  function card(i, draggable) {
    const pillar = store.pillar(i.pillar_id);
    return '<article class="idea" data-id="' + i.id + '"' + (draggable ? ' draggable="true"' : '') +
      ' style="--idea-accent:' + (pillar ? pillar.color : 'var(--line)') + '">' +
      '<div class="row" style="gap:6px">' +
        B.statusChip(i.status) +
        (i.platform && i.platform !== 'any' ? B.platformChip(i.platform, false) : '') +
        '<span class="spacer"></span>' + potentialMark(i.potential) +
      '</div>' +
      '<div class="idea__title">' + esc(i.title) + '</div>' +
      (i.notes ? '<p class="idea__notes">' + esc(i.notes) + '</p>' : '') +
      '<div class="idea__meta">' +
        (pillar ? '<span class="chip"><span class="chip__dot" style="background:' + pillar.color + '"></span>' + esc(pillar.name) + '</span>' : '') +
        (i.tags || []).slice(0, 2).map((t) => '<span class="tag">#' + esc(t) + '</span>').join('') +
        '<span class="spacer"></span>' +
        '<span class="tiny mute mono">' + esc(U.fmt.relative(i.updated_on + 'T12:00:00')) + '</span>' +
      '</div>' +
      '</article>';
  }

  function board(items) {
    const cols = showUsed ? S.IDEA_STATUS : ['raw', 'developing', 'ready'];
    return '<div class="board">' + cols.map((st) => {
      const list = sortRows(items.filter((i) => i.status === st));
      return '<div class="board__col" data-status="' + st + '">' +
        '<div class="board__head">' + B.statusChip(st) + '<span class="spacer"></span>' +
        '<span class="mono mute">' + list.length + '</span></div>' +
        '<div class="board__body">' +
          (list.length ? list.map((i) => card(i, true)).join('')
            : '<p class="tiny mute" style="padding:10px;text-align:center">Drop a card here to mark it ' +
              esc(S.IDEA_STATUS_LABEL[st].toLowerCase()) + '.</p>') +
        '</div></div>';
    }).join('') + '</div>';
  }

  function grid(items) {
    if (!items.length) {
      return B.card(null, BAUGMENT.ui.empty('Nothing in the bank matches',
        'Clear the filters, or write the next one into the line above.'));
    }
    return '<div class="idea-grid">' + sortRows(items).map((i) => card(i, false)).join('') + '</div>';
  }

  function table(items) {
    const list = sortRows(items);
    return B.card(null,
      '<div class="table-wrap"><table class="table"><thead><tr><th>Idea</th><th>Stage</th><th>Potential</th>' +
      '<th>Pillar</th><th>Platform</th><th>Origin</th><th>Owner</th><th>Tags</th><th>Updated</th></tr></thead><tbody>' +
      (list.length ? list.map((i) => '<tr data-id="' + i.id + '" style="cursor:pointer">' +
        '<td class="clamp" style="font-weight:600">' + esc(i.title) + '</td>' +
        '<td>' + B.statusChip(i.status) + '</td>' +
        '<td>' + potentialMark(i.potential) + '</td>' +
        '<td>' + B.pillarChip(i.pillar_id) + '</td>' +
        '<td>' + (i.platform && i.platform !== 'any' ? B.platformChip(i.platform) : '<span class="mute">—</span>') + '</td>' +
        '<td class="mute">' + esc(i.origin || '—') + '</td>' +
        '<td>' + esc(i.owner || '—') + '</td>' +
        '<td class="clamp" style="max-width:170px">' + ((i.tags || []).length
          ? (i.tags || []).map((t) => '<span class="tag tag--plain">#' + esc(t) + '</span>').join(' ')
          : '<span class="mute">—</span>') + '</td>' +
        '<td class="mono tiny">' + esc(i.updated_on) + '</td>' +
        '</tr>').join('')
        : '<tr><td colspan="9">' + BAUGMENT.ui.empty('Nothing in the bank matches',
            'Clear the filters, or write the next one into the line above.') + '</td></tr>') +
      '</tbody></table></div>', { flush: true });
  }

  function render(el) {
    const all = store.state().ideas || [];
    const items = ideaRows();

    const today = new Date();
    const monthAgo = U.iso(U.addDays(today, -29));
    const ready = all.filter((i) => i.status === 'ready').length;
    const fresh = all.filter((i) => (i.created_on || '') >= monthAgo).length;
    const promoted = all.filter((i) => i.status === 'used').length;
    const stale = all.filter((i) => i.status === 'raw' && (i.updated_on || '') < U.iso(U.addDays(today, -60))).length;

    const kpis = '<div class="kpis">' +
      B.kpi('Ideas in the bank', U.fmt.int(all.length), {
        foot: '<span class="mute">' + U.fmt.int(all.length - promoted) + ' still unmade</span>' }) +
      B.kpi('Ready to plan', U.fmt.int(ready), {
        foot: ready ? '<span class="mute">worked up, waiting on a slot</span>' : '<span class="mute">nothing queued</span>' }) +
      B.kpi('Added this month', U.fmt.int(fresh), { foot: '<span class="mute">last 30 days</span>' }) +
      B.kpi('Sent to planner', U.fmt.int(promoted), {
        foot: '<span class="mute">' + (all.length ? Math.round((promoted / all.length) * 100) : 0) + '% of the bank</span>' }) +
      B.kpi('Going stale', U.fmt.int(stale), {
        foot: stale ? '<span class="mute">raw, untouched 60+ days</span>' : '<span class="mute">nothing forgotten</span>' }) +
      '</div>';

    const capture =
      '<div class="capture no-print">' + icon('bulb', 18) +
      '<input class="input" id="captureInput" placeholder="Capture an idea — type it and press Enter" ' +
      'autocomplete="off" aria-label="Capture an idea">' +
      '<button class="btn btn--primary btn--sm" id="captureAdd">Add</button>' +
      '<button class="btn btn--ghost btn--sm" id="captureFull" title="Open the full editor instead">Details…</button>' +
      '</div>';

    const bar = '<div class="row no-print" style="margin-bottom:16px">' +
      '<div class="segmented" id="ideaLayout">' +
      [['board', 'Board'], ['grid', 'Cards'], ['table', 'Table']].map((m) =>
        '<button data-layout="' + m[0] + '" aria-pressed="' + (layout === m[0]) + '">' + m[1] + '</button>').join('') + '</div>' +
      '<div class="search" style="max-width:260px">' + icon('search', 15) +
        '<input class="input" id="ideaSearch" placeholder="Search ideas, notes, tags" value="' + esc(q) + '"></div>' +
      '<select class="select" id="ideaSort" style="width:auto;height:34px;font-size:var(--step--1)" aria-label="Sort ideas">' +
        [['updated', 'Recently updated'], ['created', 'Newest first'], ['potential', 'Highest potential'], ['title', 'A → Z']]
          .map((o) => '<option value="' + o[0] + '"' + (sortKey === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
      '</select>' +
      '<label class="check"><input type="checkbox" id="ideaShowUsed"' + (showUsed ? ' checked' : '') + '> Show used &amp; parked</label>' +
      '<div class="spacer"></div>' +
      '<span class="tiny mute">' + items.length + ' shown' +
        (layout === 'board' ? ' · drag a card to move it along' : '') + '</span>' +
      '</div>';

    const empty = !all.length
      ? B.card(null, BAUGMENT.ui.empty('The bank is empty',
          'Every post starts as a half-thought someone nearly forgot. Put it in the line above and worry about the shape of it later.',
          '<button class="btn btn--primary" id="ideaEmptyNew">' + icon('plus', 15) + ' Write the first one</button>'))
      : '';

    el.innerHTML = kpis + capture + (empty || (bar +
      (layout === 'board' ? board(items) : layout === 'grid' ? grid(items) : table(items))));

    /* --- Quick capture --- */
    const input = el.querySelector('#captureInput');
    const commit = () => {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      const idea = blank(v);
      store.upsert('ideas', idea);
      input.value = '';
      BAUGMENT.ui.toast('Captured', v.length > 60 ? v.slice(0, 60) + '…' : v);
      render(el);
      const again = document.getElementById('captureInput');
      if (again) again.focus();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
    el.querySelector('#captureAdd').addEventListener('click', commit);
    el.querySelector('#captureFull').addEventListener('click', () =>
      edit(blank(input.value.trim()), () => render(el)));

    const emptyNew = el.querySelector('#ideaEmptyNew');
    if (emptyNew) emptyNew.addEventListener('click', () => edit(blank(), () => render(el)));

    /* --- Controls --- */
    el.querySelectorAll('#ideaLayout button').forEach((b) => b.addEventListener('click', () => {
      layout = b.getAttribute('data-layout'); render(el);
    }));
    const sort = el.querySelector('#ideaSort');
    if (sort) sort.addEventListener('change', () => { sortKey = sort.value; render(el); });
    const used = el.querySelector('#ideaShowUsed');
    if (used) used.addEventListener('change', () => { showUsed = used.checked; render(el); });

    const search = el.querySelector('#ideaSearch');
    if (search) search.addEventListener('input', U.debounce(() => {
      q = search.value;
      render(el);
      const s = document.getElementById('ideaSearch');
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }, 260));

    /* --- Open --- */
    el.querySelectorAll('[data-id]').forEach((node) => node.addEventListener('click', () => {
      const i = store.idea(node.getAttribute('data-id'));
      if (i) edit(i, () => render(el));
    }));

    /* --- Drag between stages --- */
    let dragId = null;
    el.querySelectorAll('.idea[draggable="true"]').forEach((node) => {
      node.addEventListener('dragstart', (e) => {
        dragId = node.getAttribute('data-id');
        node.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragId);
      });
      node.addEventListener('dragend', () => { node.classList.remove('dragging'); dragId = null; });
    });
    el.querySelectorAll('.board__col').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop-on'); });
      col.addEventListener('dragleave', () => col.classList.remove('drop-on'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drop-on');
        const id = dragId || e.dataTransfer.getData('text/plain');
        const status = col.getAttribute('data-status');
        const i = store.idea(id);
        if (!i || i.status === status) return;
        store.upsert('ideas', Object.assign({}, i, { status, updated_on: U.iso(new Date()) }));
        BAUGMENT.ui.toast('Moved to ' + S.IDEA_STATUS_LABEL[status].toLowerCase(), i.title);
        render(el);
      });
    });
  }

  return {
    title: 'Idea Bank',
    eyebrow: 'Before it is a post',
    lede: 'Rough ideas, brainstorm notes and half-drafts. Nothing here is scheduled — it moves to the Content Planner when it is ready.',
    filters: true,
    actions: () =>
      '<button class="btn btn--primary" id="ideaNew">' + icon('plus', 15) + ' New idea</button>',
    wireActions(root) {
      root.querySelector('#ideaNew').addEventListener('click', () =>
        BAUGMENT.views.ideas.edit(BAUGMENT.views.ideas.blank(), () => BAUGMENT.app.render()));
    },
    edit, blank, promote, render
  };
})();
