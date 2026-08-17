/* BAUGMENT — planning views: Calendar, Planner, Pillars, Campaigns, Media */

BAUGMENT.planning = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const store = BAUGMENT.store;
  const esc = U.esc;

  /* The global filter bar is shared with analytics; only the parts that make
     sense for planned content are applied here, and never the date range —
     the calendar owns its own navigation. */
  function plannerRows() {
    const f = store.getFilters();
    return store.state().planner.filter((p) => {
      if (f.platform !== 'all' && p.platform !== f.platform) return false;
      if (f.campaign !== 'all' && p.campaign_id !== f.campaign) return false;
      if (f.pillar !== 'all' && p.pillar_id !== f.pillar) return false;
      if (f.status !== 'all' && p.status !== f.status) return false;
      if (f.author !== 'all' && p.owner !== f.author && p.reviewer !== f.author) return false;
      if (f.q) {
        const hay = (p.title + ' ' + p.caption + ' ' + p.hashtags + ' ' + p.keywords + ' ' + p.cta).toLowerCase();
        if (hay.indexOf(f.q.toLowerCase()) === -1) return false;
      }
      return true;
    });
  }

  function blank() {
    const today = new Date();
    return {
      id: U.uid('plan'), title: '', caption: '', platform: 'linkedin', media_type: 'Carousel',
      publish_date: U.iso(today), publish_time: '08:00',
      objective: 'Engagement', audience: '', cta: '', hashtags: '#baugment', keywords: '',
      thumbnail_id: null, owner: '', reviewer: '', priority: 'medium', status: 'draft',
      pillar_id: store.state().pillars[0] ? store.state().pillars[0].id : null,
      campaign_id: null, notes: ''
    };
  }

  /* Shared editor for a planned post; used by both Calendar and Planner. */
  function edit(item, onSaved) {
    const db = store.state();
    const isNew = !db.planner.some((p) => p.id === item.id);
    const p = Object.assign({}, item);

    const sel = (name, options, value, labelFn) =>
      '<select class="select" data-f="' + name + '">' +
      options.map((o) => {
        const v = typeof o === 'string' ? o : o.id;
        const l = labelFn ? labelFn(o) : (typeof o === 'string' ? o : o.name);
        return '<option value="' + esc(v) + '"' + (String(value) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';
      }).join('') + '</select>';

    const body =
      '<label class="field"><span class="field__label">Title</span>' +
        '<input class="input" data-f="title" value="' + esc(p.title) + '" placeholder="Carousel: why completion rate is a vanity metric"></label>' +
      '<label class="field"><span class="field__label">Caption</span>' +
        '<textarea class="textarea" data-f="caption" placeholder="Write the caption as it will publish.">' + esc(p.caption) + '</textarea></label>' +
      '<div class="grid-3">' +
        '<label class="field"><span class="field__label">Platform</span>' +
          sel('platform', store.livePlatforms(), p.platform) + '</label>' +
        '<label class="field"><span class="field__label">Media type</span>' +
          sel('media_type', S.MEDIA_TYPES, p.media_type || 'Image') + '</label>' +
        '<label class="field"><span class="field__label">Status</span>' +
          sel('status', S.POST_STATUS, p.status, (o) => o.charAt(0).toUpperCase() + o.slice(1)) + '</label>' +
      '</div>' +
      '<div class="grid-3">' +
        '<label class="field"><span class="field__label">Publish date</span>' +
          '<input class="input" type="date" data-f="publish_date" value="' + esc(p.publish_date) + '"></label>' +
        '<label class="field"><span class="field__label">Publish time</span>' +
          '<input class="input" type="time" data-f="publish_time" value="' + esc(p.publish_time) + '"></label>' +
        '<label class="field"><span class="field__label">Priority</span>' + sel('priority', S.PRIORITIES, p.priority, (o) => o.charAt(0).toUpperCase() + o.slice(1)) + '</label>' +
      '</div>' +
      '<div class="grid-2">' +
        '<label class="field"><span class="field__label">Objective</span>' + sel('objective', S.OBJECTIVES, p.objective) + '</label>' +
        '<label class="field"><span class="field__label">Target audience</span><input class="input" data-f="audience" value="' + esc(p.audience) + '" placeholder="L&amp;D managers, 100+ headcount"></label>' +
      '</div>' +
      '<div class="grid-2">' +
        '<label class="field"><span class="field__label">Content pillar</span>' +
          sel('pillar_id', db.pillars, p.pillar_id) + '</label>' +
        '<label class="field"><span class="field__label">Campaign</span>' +
          '<select class="select" data-f="campaign_id"><option value="">No campaign</option>' +
          db.campaigns.map((c) => '<option value="' + c.id + '"' + (p.campaign_id === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
          '</select></label>' +
      '</div>' +
      '<div class="grid-2">' +
        '<label class="field"><span class="field__label">Owner</span><input class="input" data-f="owner" value="' + esc(p.owner) + '" placeholder="Who makes it"></label>' +
        '<label class="field"><span class="field__label">Reviewer</span><input class="input" data-f="reviewer" value="' + esc(p.reviewer) + '" placeholder="Who signs it off"></label>' +
      '</div>' +
      '<label class="field"><span class="field__label">Call to action</span>' +
        '<input class="input" data-f="cta" value="' + esc(p.cta) + '" placeholder="Register at the link"></label>' +
      '<label class="field"><span class="field__label">Hashtags</span>' +
        '<input class="input" data-f="hashtags" value="' + esc(p.hashtags) + '" placeholder="#baugment #digitallearning"></label>' +
      '<div class="grid-2">' +
        '<label class="field"><span class="field__label">Keywords</span><input class="input" data-f="keywords" value="' + esc(p.keywords) + '"></label>' +
        '<label class="field"><span class="field__label">Thumbnail</span>' +
          '<select class="select" data-f="thumbnail_id"><option value="">None</option>' +
          db.media.filter((m) => m.kind !== 'document').map((m) =>
            '<option value="' + m.id + '"' + (p.thumbnail_id === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('') +
          '</select></label>' +
      '</div>' +
      '<label class="field" style="margin-bottom:0"><span class="field__label">Notes</span>' +
        '<textarea class="textarea" data-f="notes" style="min-height:64px" placeholder="Anything the designer, editor or facilitator needs to know.">' + esc(p.notes) + '</textarea></label>';

    const actions = [{ label: 'Cancel' }];
    if (!isNew) {
      actions.push({
        label: 'Delete', variant: 'danger', keepOpen: true,
        onClick: async (bodyEl, close) => {
          const ok = await BAUGMENT.ui.confirm('Delete this planned post?', 'It will be removed from the calendar and the planner. This can\'t be undone.', 'Delete');
          if (!ok) return false;
          store.remove('planner', p.id);
          BAUGMENT.ui.toast('Deleted', p.title || 'Untitled post');
          close();
          if (onSaved) onSaved();
          return false;
        }
      });
    }
    actions.push({
      label: isNew ? 'Create post' : 'Save changes', variant: 'primary', keepOpen: true,
      onClick: (bodyEl, close) => {
        bodyEl.querySelectorAll('[data-f]').forEach((f) => {
          const k = f.getAttribute('data-f');
          p[k] = f.value === '' && (k === 'campaign_id' || k === 'thumbnail_id') ? null : f.value;
        });
        if (!p.title.trim()) {
          BAUGMENT.ui.toast('Add a title', 'A planned post needs a title so it reads on the calendar.', 'warn');
          return false;
        }
        store.upsert('planner', p);
        BAUGMENT.ui.toast(isNew ? 'Post created' : 'Changes saved', p.title);
        close();
        if (onSaved) onSaved();
        return false;
      }
    });

    BAUGMENT.ui.modal({ title: isNew ? 'New planned post' : 'Edit planned post', body, wide: true, actions });
  }

  function duplicate(item, onDone) {
    const copy = Object.assign({}, item, { id: U.uid('plan'), title: item.title + ' (copy)', status: 'draft' });
    store.upsert('planner', copy);
    BAUGMENT.ui.toast('Duplicated', copy.title);
    if (onDone) onDone();
  }

  return { plannerRows, blank, edit, duplicate };
})();


/* ========================================================================== */
/* Content Calendar                                                           */
/* ========================================================================== */

BAUGMENT.views.calendar = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const B = BAUGMENT.bits;
  const P = BAUGMENT.planning;
  const store = BAUGMENT.store;
  const esc = U.esc;

  let mode = 'month';
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  function label() {
    if (mode === 'month') return cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (mode === 'week') {
      const s = U.startOfWeek(cursor);
      return U.fmt.date(U.iso(s)) + ' → ' + U.fmt.date(U.iso(U.addDays(s, 6)));
    }
    if (mode === 'day') return U.fmt.date(U.iso(cursor), 'long');
    return 'All planned content';
  }

  function shift(dir) {
    if (mode === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
    else if (mode === 'week') cursor = U.addDays(cursor, 7 * dir);
    else if (mode === 'day') cursor = U.addDays(cursor, dir);
  }

  function chip(p) {
    return '<div class="evt" draggable="true" data-id="' + p.id + '" style="--pf:var(--pf-' + p.platform + ')" title="' + esc(p.title) + '">' +
      '<span class="evt__time">' + esc(U.fmt.time(p.publish_time)) + '</span>' +
      '<span class="evt__title">' + esc(p.title) + '</span></div>';
  }

  function monthGrid(items) {
    const first = U.startOfMonth(cursor);
    const start = U.startOfWeek(first);
    const todayIso = U.iso(new Date());
    const byDate = U.groupBy(items, (p) => p.publish_date);

    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = U.addDays(start, i);
      const key = U.iso(d);
      const out = d.getMonth() !== cursor.getMonth();
      const list = (byDate.get(key) || []).sort((a, b) => a.publish_time.localeCompare(b.publish_time));
      cells += '<div class="cal__day' + (out ? ' is-out' : '') + (key === todayIso ? ' is-today' : '') + '" data-date="' + key + '">' +
        '<span class="cal__daynum">' + d.getDate() + '</span>' +
        list.slice(0, 3).map(chip).join('') +
        (list.length > 3 ? '<div class="cal__more">+' + (list.length - 3) + ' more</div>' : '') +
        '</div>';
    }
    return '<div class="cal"><div class="cal__dow">' + U.DOW.map((d) => '<span>' + d + '</span>').join('') + '</div>' +
      '<div class="cal__grid">' + cells + '</div></div>';
  }

  function weekGrid(items) {
    const start = U.startOfWeek(cursor);
    const todayIso = U.iso(new Date());
    const byDate = U.groupBy(items, (p) => p.publish_date);
    let cells = '';
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(start, i);
      const key = U.iso(d);
      const list = (byDate.get(key) || []).sort((a, b) => a.publish_time.localeCompare(b.publish_time));
      cells += '<div class="cal__day' + (key === todayIso ? ' is-today' : '') + '" data-date="' + key + '" style="min-height:340px">' +
        '<span class="cal__daynum">' + d.getDate() + '</span>' + list.map(chip).join('') + '</div>';
    }
    return '<div class="cal"><div class="cal__dow">' + U.DOW.map((d) => '<span>' + d + '</span>').join('') + '</div>' +
      '<div class="cal__grid">' + cells + '</div></div>';
  }

  function dayList(items) {
    const key = U.iso(cursor);
    const list = items.filter((p) => p.publish_date === key).sort((a, b) => a.publish_time.localeCompare(b.publish_time));
    if (!list.length) {
      return B.card(null, BAUGMENT.ui.empty('Nothing scheduled for ' + U.fmt.date(key, 'long'),
        'Add a post for this day, or drag one here from another date.',
        '<button class="btn btn--primary" data-newon="' + key + '">Add a post</button>'));
    }
    return B.card(null, '<div class="cal__day" data-date="' + key + '" style="border:0;min-height:auto">' +
      list.map((p) =>
        '<div class="pcard" draggable="true" data-id="' + p.id + '" style="margin-bottom:8px">' +
          '<div class="row" style="margin-bottom:6px"><span class="mono mute">' + esc(U.fmt.time(p.publish_time)) + '</span>' +
          B.platformChip(p.platform) + B.statusChip(p.status) + '<span class="spacer"></span>' +
          '<span class="priority priority--' + p.priority + '">' + esc(p.priority) + '</span></div>' +
          '<div class="pcard__title">' + esc(p.title) + '</div>' +
          '<p class="tiny mute" style="line-height:1.55">' + esc(p.caption.slice(0, 160)) + '</p>' +
        '</div>').join('') + '</div>');
  }

  function listView(items) {
    const sorted = items.slice().sort((a, b) => (a.publish_date + a.publish_time).localeCompare(b.publish_date + b.publish_time));
    return B.card(null,
      '<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Title</th><th>Platform</th>' +
      '<th>Media</th><th>Pillar</th><th>Status</th><th>Owner</th><th></th></tr></thead><tbody>' +
      (sorted.length ? sorted.map((p) => '<tr data-id="' + p.id + '" style="cursor:pointer">' +
        '<td class="mono">' + esc(p.publish_date) + ' ' + esc(U.fmt.time(p.publish_time)) + '</td>' +
        '<td class="clamp">' + esc(p.title) + '</td>' +
        '<td>' + B.platformChip(p.platform) + '</td>' +
        '<td>' + (p.media_type ? '<span class="chip">' + esc(p.media_type) + '</span>' : '<span class="mute">—</span>') + '</td>' +
        '<td>' + B.pillarChip(p.pillar_id) + '</td>' +
        '<td>' + B.statusChip(p.status) + '</td>' +
        '<td>' + esc(p.owner || '—') + '</td>' +
        '<td><button class="btn btn--ghost btn--sm" data-dupe="' + p.id + '" title="Duplicate">' + BAUGMENT.icon.render('copy', 14) + '</button></td>' +
        '</tr>').join('')
        : '<tr><td colspan="8">' + BAUGMENT.ui.empty('Nothing planned yet', 'Create a post and it shows up here and on the calendar.') + '</td></tr>') +
      '</tbody></table></div>', { flush: true });
  }

  function render(el) {
    const items = P.plannerRows();

    const nav = '<div class="row no-print" style="margin-bottom:16px">' +
      '<div class="segmented" id="calMode">' +
      [['month', 'Month'], ['week', 'Week'], ['day', 'Day'], ['list', 'List']].map((m) =>
        '<button data-mode="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '">' + m[1] + '</button>').join('') + '</div>' +
      (mode === 'list' ? '' :
        '<button class="btn btn--icon btn--sm" id="calPrev" aria-label="Previous">' + BAUGMENT.icon.render('chevronL', 15) + '</button>' +
        '<button class="btn btn--sm" id="calToday">Today</button>' +
        '<button class="btn btn--icon btn--sm" id="calNext" aria-label="Next">' + BAUGMENT.icon.render('chevronR', 15) + '</button>') +
      '<span class="chip mono" style="height:29px">' + esc(label()) + '</span>' +
      '<div class="spacer"></div>' +
      '<span class="tiny mute">' + items.length + ' item' + (items.length === 1 ? '' : 's') + ' · drag a card to reschedule</span>' +
      '</div>';

    el.innerHTML = nav + (mode === 'month' ? monthGrid(items) : mode === 'week' ? weekGrid(items)
      : mode === 'day' ? dayList(items) : listView(items));

    /* Mode + navigation */
    el.querySelectorAll('#calMode button').forEach((b) => b.addEventListener('click', () => {
      mode = b.getAttribute('data-mode'); render(el);
    }));
    const wire = (id, fn) => { const n = el.querySelector(id); if (n) n.addEventListener('click', () => { fn(); render(el); }); };
    wire('#calPrev', () => shift(-1));
    wire('#calNext', () => shift(1));
    wire('#calToday', () => { cursor = new Date(); cursor.setHours(0, 0, 0, 0); });

    /* Open the editor */
    el.querySelectorAll('[data-id]').forEach((node) => node.addEventListener('click', (e) => {
      if (e.target.closest('[data-dupe]')) return;
      const item = store.state().planner.find((p) => p.id === node.getAttribute('data-id'));
      if (item) P.edit(item, () => render(el));
    }));
    el.querySelectorAll('[data-dupe]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = store.state().planner.find((p) => p.id === b.getAttribute('data-dupe'));
      if (item) P.duplicate(item, () => render(el));
    }));
    el.querySelectorAll('[data-newon]').forEach((b) => b.addEventListener('click', () => {
      const item = P.blank();
      item.publish_date = b.getAttribute('data-newon');
      P.edit(item, () => render(el));
    }));

    /* Drag to reschedule */
    let dragId = null;
    el.querySelectorAll('[draggable="true"]').forEach((node) => {
      node.addEventListener('dragstart', (e) => {
        dragId = node.getAttribute('data-id');
        node.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragId);
      });
      node.addEventListener('dragend', () => { node.classList.remove('dragging'); dragId = null; });
    });
    el.querySelectorAll('.cal__day').forEach((cell) => {
      cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drop-on'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('drop-on'));
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('drop-on');
        const id = dragId || e.dataTransfer.getData('text/plain');
        const date = cell.getAttribute('data-date');
        const item = store.state().planner.find((p) => p.id === id);
        if (!item || item.publish_date === date) return;
        const was = item.publish_date;
        store.upsert('planner', Object.assign({}, item, { publish_date: date }));
        BAUGMENT.ui.toast('Rescheduled', item.title + ' moved from ' + U.fmt.date(was) + ' to ' + U.fmt.date(date));
        render(el);
      });
    });
  }

  return {
    title: 'Content Calendar',
    eyebrow: 'What goes out, and when',
    lede: 'Scheduled, drafted and published content on one grid. Drag a card to a different day to reschedule it.',
    filters: true,
    actions: () => '<button class="btn btn--primary" id="calNew">' + BAUGMENT.icon.render('plus', 15) + ' New post</button>',
    wireActions(root) {
      root.querySelector('#calNew').addEventListener('click', () =>
        BAUGMENT.planning.edit(BAUGMENT.planning.blank(), () => BAUGMENT.app.render()));
    },
    render
  };
})();


/* ========================================================================== */
/* Content Planner                                                            */
/* ========================================================================== */

BAUGMENT.views.planner = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const B = BAUGMENT.bits;
  const P = BAUGMENT.planning;
  const store = BAUGMENT.store;
  const esc = U.esc;

  let layout = 'board';

  function card(p) {
    return '<div class="pcard" draggable="true" data-id="' + p.id + '">' +
      '<div class="pcard__title">' + esc(p.title) + '</div>' +
      '<div class="pcard__meta">' + B.platformChip(p.platform, false) +
        (p.media_type ? '<span class="chip">' + esc(p.media_type) + '</span>' : '') +
        '<span class="mono mute tiny">' + esc(p.publish_date.slice(5)) + ' ' + esc(U.fmt.time(p.publish_time)) + '</span>' +
        '<span class="spacer"></span>' +
        '<span class="priority priority--' + p.priority + '">' + esc(p.priority.charAt(0).toUpperCase()) + '</span></div>' +
      '<div class="pcard__meta" style="margin-top:6px">' + B.pillarChip(p.pillar_id) + '</div>' +
      '</div>';
  }

  function board(items) {
    const cols = S.POST_STATUS;
    return '<div class="board">' + cols.map((st) => {
      const list = items.filter((p) => p.status === st)
        .sort((a, b) => (a.publish_date + a.publish_time).localeCompare(b.publish_date + b.publish_time));
      return '<div class="board__col" data-status="' + st + '">' +
        '<div class="board__head">' + B.statusChip(st) + '<span class="spacer"></span>' +
        '<span class="mono mute">' + list.length + '</span></div>' +
        '<div class="board__body">' + (list.length ? list.map(card).join('')
          : '<p class="tiny mute" style="padding:10px;text-align:center">Drop a card here to set it ' + esc(st) + '.</p>') + '</div></div>';
    }).join('') + '</div>';
  }

  function table(items) {
    const sorted = items.slice().sort((a, b) => (a.publish_date + a.publish_time).localeCompare(b.publish_date + b.publish_time));
    return B.card(null,
      '<div class="table-wrap"><table class="table"><thead><tr><th>Publish</th><th>Title</th><th>Platform</th>' +
      '<th>Media</th><th>Pillar</th><th>Campaign</th><th>Objective</th><th>Owner</th><th>Reviewer</th><th>Priority</th><th>Status</th></tr></thead><tbody>' +
      sorted.map((p) => '<tr data-id="' + p.id + '" style="cursor:pointer">' +
        '<td class="mono">' + esc(p.publish_date) + ' ' + esc(U.fmt.time(p.publish_time)) + '</td>' +
        '<td class="clamp">' + esc(p.title) + '</td>' +
        '<td>' + B.platformChip(p.platform) + '</td>' +
        '<td>' + (p.media_type ? '<span class="chip">' + esc(p.media_type) + '</span>' : '<span class="mute">—</span>') + '</td>' +
        '<td>' + B.pillarChip(p.pillar_id) + '</td>' +
        '<td class="clamp" style="max-width:150px">' + esc(p.campaign_id ? store.campaignName(p.campaign_id) : '—') + '</td>' +
        '<td>' + esc(p.objective) + '</td><td>' + esc(p.owner || '—') + '</td><td>' + esc(p.reviewer || '—') + '</td>' +
        '<td><span class="priority priority--' + p.priority + '">' + esc(p.priority) + '</span></td>' +
        '<td>' + B.statusChip(p.status) + '</td></tr>').join('') +
      '</tbody></table></div>', { flush: true });
  }

  function render(el) {
    const items = P.plannerRows();
    const upcoming = items.filter((p) => p.publish_date >= U.iso(new Date()) && p.status !== 'archived');
    const needsReview = items.filter((p) => p.status === 'review');
    const overdue = items.filter((p) => p.publish_date < U.iso(new Date()) && (p.status === 'draft' || p.status === 'review'));

    const kpis = '<div class="kpis">' +
      B.kpi('Planned items', U.fmt.int(items.length), {}) +
      B.kpi('Upcoming', U.fmt.int(upcoming.length), { foot: '<span class="mute">today onward</span>' }) +
      B.kpi('Waiting on review', U.fmt.int(needsReview.length), {}) +
      B.kpi('Past due', U.fmt.int(overdue.length), { foot: overdue.length ? '<span class="mute">still draft or in review</span>' : '<span class="mute">nothing slipped</span>' }) +
      '</div>';

    const nav = '<div class="row no-print" style="margin-bottom:16px">' +
      '<div class="segmented" id="planLayout">' +
      [['board', 'Board'], ['table', 'Table']].map((m) =>
        '<button data-layout="' + m[0] + '" aria-pressed="' + (layout === m[0]) + '">' + m[1] + '</button>').join('') + '</div>' +
      '<div class="spacer"></div>' +
      (layout === 'board' ? '<span class="tiny mute">Drag a card between columns to change its status</span>' : '') +
      '</div>';

    el.innerHTML = kpis + nav + (layout === 'board' ? board(items) : table(items));

    el.querySelectorAll('#planLayout button').forEach((b) => b.addEventListener('click', () => {
      layout = b.getAttribute('data-layout'); render(el);
    }));
    el.querySelectorAll('[data-id]').forEach((node) => node.addEventListener('click', () => {
      const item = store.state().planner.find((p) => p.id === node.getAttribute('data-id'));
      if (item) P.edit(item, () => render(el));
    }));

    let dragId = null;
    el.querySelectorAll('.pcard[draggable="true"]').forEach((node) => {
      node.addEventListener('dragstart', (e) => {
        dragId = node.getAttribute('data-id');
        node.classList.add('dragging');
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
        const item = store.state().planner.find((p) => p.id === id);
        if (!item || item.status === status) return;
        store.upsert('planner', Object.assign({}, item, { status }));
        BAUGMENT.ui.toast('Moved to ' + status, item.title);
        render(el);
      });
    });
  }

  return {
    title: 'Content Planner',
    eyebrow: 'From idea to sign-off',
    lede: 'The brief behind each post — objective, audience, CTA, owner and reviewer. Move cards to change status.',
    filters: true,
    actions: () => '<button class="btn btn--primary" id="planNew">' + BAUGMENT.icon.render('plus', 15) + ' New post</button>',
    wireActions(root) {
      root.querySelector('#planNew').addEventListener('click', () =>
        BAUGMENT.planning.edit(BAUGMENT.planning.blank(), () => BAUGMENT.app.render()));
    },
    render
  };
})();


/* ========================================================================== */
/* Content Pillars                                                            */
/* ========================================================================== */

BAUGMENT.views.pillars = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const B = BAUGMENT.bits;
  const store = BAUGMENT.store;
  const C = BAUGMENT.charts;
  const esc = U.esc;

  function editPillar(item) {
    const db = store.state();
    const isNew = !db.pillars.some((p) => p.id === item.id);
    const p = Object.assign({}, item);
    const body =
      '<label class="field"><span class="field__label">Name</span><input class="input" data-f="name" value="' + esc(p.name) + '"></label>' +
      '<label class="field"><span class="field__label">What belongs in this pillar</span>' +
        '<textarea class="textarea" data-f="description">' + esc(p.description) + '</textarea></label>' +
      '<div class="grid-2"><label class="field"><span class="field__label">Colour</span>' +
        '<select class="select" data-f="color">' + C.PALETTE.map((c) =>
          '<option value="' + c + '"' + (p.color === c ? ' selected' : '') + '>' + c.replace('var(--', '').replace(')', '') + '</option>').join('') +
        '</select></label>' +
      '<label class="field"><span class="field__label">Target share of output (%)</span>' +
        '<input class="input" type="number" min="0" max="100" step="0.5" data-f="target_share" value="' + esc(p.target_share) + '"></label></div>';

    const actions = [{ label: 'Cancel' }];
    if (!isNew) actions.push({
      label: 'Delete', variant: 'danger', keepOpen: true,
      onClick: async (bodyEl, close) => {
        const used = db.analytics.filter((r) => r.pillar_id === p.id).length;
        const ok = await BAUGMENT.ui.confirm('Delete "' + p.name + '"?',
          used ? used + ' published posts reference this pillar. They\'ll show as unassigned.' : 'Nothing references this pillar yet.', 'Delete');
        if (!ok) return false;
        store.remove('pillars', p.id);
        BAUGMENT.ui.toast('Pillar deleted', p.name);
        close(); BAUGMENT.app.render();
        return false;
      }
    });
    actions.push({
      label: isNew ? 'Create pillar' : 'Save changes', variant: 'primary', keepOpen: true,
      onClick: (bodyEl, close) => {
        bodyEl.querySelectorAll('[data-f]').forEach((f) => { p[f.getAttribute('data-f')] = f.value; });
        p.target_share = parseFloat(p.target_share) || 0;
        if (!p.name.trim()) { BAUGMENT.ui.toast('Name required', 'Give the pillar a name.', 'warn'); return false; }
        store.upsert('pillars', p);
        BAUGMENT.ui.toast(isNew ? 'Pillar created' : 'Changes saved', p.name);
        close(); BAUGMENT.app.render();
        return false;
      }
    });
    BAUGMENT.ui.modal({ title: isNew ? 'New content pillar' : 'Edit pillar', body, actions });
  }

  function render(el) {
    const rows = store.rows();
    const prevRows = store.previousRows();
    const db = store.state();

    if (!db.pillars.length) {
      el.innerHTML = B.card(null, BAUGMENT.ui.empty('No content pillars yet',
        'Pillars are the promise your feed makes about what it covers — Learning Insight, Case Study, Measurement. Create the first one and posts can be filed against it.',
        '<button class="btn btn--primary" id="pillarEmptyNew">' + BAUGMENT.icon.render('plus', 15) + ' Create a pillar</button>'));
      el.querySelector('#pillarEmptyNew').addEventListener('click', () => editPillar({
        id: U.uid('pil'), name: '', description: '', color: C.PALETTE[0], target_share: 5
      }));
      return;
    }

    const totalReach = S.rollup(rows, 'reach') || 1;

    const stats = db.pillars.map((p) => {
      const list = rows.filter((r) => r.pillar_id === p.id);
      const prev = prevRows.filter((r) => r.pillar_id === p.id);
      const reach = S.rollup(list, 'reach');
      const best = list.slice().sort((a, b) => S.engagementRate(b) - S.engagementRate(a))[0] || null;
      return {
        p, list, reach,
        eng: S.rollup(list, 'engagements'),
        er: S.rollup(list, 'engagement_rate'),
        avgReach: list.length ? reach / list.length : 0,
        growth: store.delta(reach, S.rollup(prev, 'reach')),
        share: (reach / totalReach) * 100,
        best
      };
    }).sort((a, b) => b.reach - a.reach);

    const mix = B.card('Share of reach against target',
      C.hbars(stats.filter((s) => s.list.length).map((s) => ({
        html: esc(s.p.name) + ' <span class="mute mono tiny">target ' + s.p.target_share + '%</span>',
        label: s.p.name, value: s.share, color: s.p.color
      })), { format: (v) => v.toFixed(1) + '%' }));

    const erChart = B.card('Engagement rate by pillar',
      C.bars(stats.filter((s) => s.list.length).slice(0, 10).map((s) => s.p.name.split(' ')[0]),
        [{ name: 'Engagement rate', values: stats.filter((s) => s.list.length).slice(0, 10).map((s) => s.er), color: 'var(--accent)' }],
        { height: 230, format: (v) => U.fmt.pct(v, 1) }));

    const cards = stats.map((s) =>
      '<section class="card" data-pillar="' + s.p.id + '" style="cursor:pointer">' +
        '<div class="card__body">' +
          '<div class="row" style="margin-bottom:10px">' +
            '<span class="chip__dot" style="background:' + s.p.color + ';width:10px;height:10px"></span>' +
            '<span style="font-weight:650">' + esc(s.p.name) + '</span>' +
            '<span class="spacer"></span>' + BAUGMENT.ui.delta(s.growth) + '</div>' +
          '<p class="tiny mute" style="line-height:1.55;margin-bottom:14px;min-height:36px">' + esc(s.p.description) + '</p>' +
          '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">' +
            ['Posts|' + U.fmt.int(s.list.length), 'Reach|' + U.fmt.compact(s.reach),
             'Eng.|' + U.fmt.compact(s.eng), 'Rate|' + U.fmt.pct(s.er, 1)].map((x) => {
              const parts = x.split('|');
              return '<div><div class="tiny mute">' + parts[0] + '</div><div class="num" style="font-weight:650">' + parts[1] + '</div></div>';
            }).join('') +
          '</div>' +
          (s.best ? '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line-soft)">' +
            '<div class="eyebrow" style="margin-bottom:4px">Best post</div>' +
            '<div class="tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.best.caption) + '</div>' +
            '<div class="tiny mute mono" style="margin-top:3px">' + U.fmt.pct(S.engagementRate(s.best), 1) + ' · ' + U.fmt.compact(s.best.reach) + ' reach</div></div>'
            : '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line-soft)"><span class="tiny mute">No posts in this window.</span></div>') +
        '</div></section>').join('');

    el.innerHTML = '<div class="grid-2" style="margin-bottom:16px">' + mix + erChart + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">' + cards + '</div>';

    el.querySelectorAll('[data-pillar]').forEach((n) => n.addEventListener('click', () => {
      const p = store.pillar(n.getAttribute('data-pillar'));
      if (p) editPillar(p);
    }));
    BAUGMENT.charts.bind(el);
  }

  return {
    title: 'Content Pillars',
    eyebrow: 'What Baugment talks about',
    lede: 'Each pillar is a promise about what the feed covers. Compare intended share against what actually landed.',
    filters: true,
    actions: () => '<button class="btn btn--primary" id="pillarNew">' + BAUGMENT.icon.render('plus', 15) + ' New pillar</button>',
    wireActions(root) {
      root.querySelector('#pillarNew').addEventListener('click', () => {
        BAUGMENT.views.pillars.edit({
          id: BAUGMENT.util.uid('pil'), name: '', description: '',
          color: BAUGMENT.charts.PALETTE[0], target_share: 5
        });
      });
    },
    edit: editPillar,
    render
  };
})();


/* ========================================================================== */
/* Campaigns                                                                  */
/* ========================================================================== */

BAUGMENT.views.campaigns = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const B = BAUGMENT.bits;
  const store = BAUGMENT.store;
  const C = BAUGMENT.charts;
  const esc = U.esc;

  function editCampaign(item) {
    const db = store.state();
    const isNew = !db.campaigns.some((c) => c.id === item.id);
    const c = Object.assign({}, item);
    const metrics = store.allMetrics();

    const body =
      '<label class="field"><span class="field__label">Campaign name</span>' +
        '<input class="input" data-f="name" value="' + esc(c.name) + '" placeholder="E-Learning Masterclass Q1"></label>' +
      '<div class="grid-3">' +
        '<label class="field"><span class="field__label">Objective</span><select class="select" data-f="objective">' +
          S.OBJECTIVES.map((o) => '<option' + (c.objective === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></label>' +
        '<label class="field"><span class="field__label">Starts</span><input class="input" type="date" data-f="start" value="' + esc(c.start) + '"></label>' +
        '<label class="field"><span class="field__label">Ends</span><input class="input" type="date" data-f="end" value="' + esc(c.end) + '"></label>' +
      '</div>' +
      '<div class="grid-3">' +
        '<label class="field"><span class="field__label">Status</span><select class="select" data-f="status">' +
          S.CAMPAIGN_STATUS.map((s) => '<option value="' + s + '"' + (c.status === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>').join('') + '</select></label>' +
        '<label class="field"><span class="field__label">Owner</span><input class="input" data-f="owner" value="' + esc(c.owner || '') + '"></label>' +
        '<label class="field"><span class="field__label">Budget (IDR, optional)</span>' +
          '<input class="input" type="number" min="0" step="50000" data-f="budget" value="' + esc(c.budget == null ? '' : c.budget) + '"></label>' +
      '</div>' +
      '<div class="field"><span class="field__label">Platforms</span><div class="row">' +
        store.livePlatforms().map((p) => '<label class="check"><input type="checkbox" data-pf="' + p.id + '"' +
          (c.platforms.indexOf(p.id) !== -1 ? ' checked' : '') + '>' + esc(p.name) + '</label>').join('') + '</div></div>' +
      '<div class="grid-2">' +
        '<label class="field"><span class="field__label">KPI metric</span><select class="select" data-f="kpi_metric">' +
          metrics.map((m) => '<option value="' + m.key + '"' + (c.kpi_metric === m.key ? ' selected' : '') + '>' + esc(m.label) + '</option>').join('') + '</select></label>' +
        '<label class="field"><span class="field__label">KPI target</span>' +
          '<input class="input" type="number" min="0" data-f="kpi_target" value="' + esc(c.kpi_target) + '"></label>' +
      '</div>' +
      '<label class="field" style="margin-bottom:0"><span class="field__label">Notes</span>' +
        '<textarea class="textarea" data-f="notes" style="min-height:64px">' + esc(c.notes || '') + '</textarea></label>';

    const actions = [{ label: 'Cancel' }];
    if (!isNew) actions.push({
      label: 'Delete', variant: 'danger', keepOpen: true,
      onClick: async (bodyEl, close) => {
        const used = db.analytics.filter((r) => r.campaign_id === c.id).length;
        const ok = await BAUGMENT.ui.confirm('Delete "' + c.name + '"?',
          used ? used + ' posts are tagged to this campaign and will become untagged.' : 'No posts are tagged to it.', 'Delete');
        if (!ok) return false;
        store.remove('campaigns', c.id);
        BAUGMENT.ui.toast('Campaign deleted', c.name);
        close(); BAUGMENT.app.render();
        return false;
      }
    });
    actions.push({
      label: isNew ? 'Create campaign' : 'Save changes', variant: 'primary', keepOpen: true,
      onClick: (bodyEl, close) => {
        bodyEl.querySelectorAll('[data-f]').forEach((f) => { c[f.getAttribute('data-f')] = f.value; });
        c.platforms = Array.from(bodyEl.querySelectorAll('[data-pf]')).filter((x) => x.checked).map((x) => x.getAttribute('data-pf'));
        c.budget = c.budget === '' ? null : Number(c.budget);
        c.kpi_target = Number(c.kpi_target) || 0;
        if (!c.name.trim()) { BAUGMENT.ui.toast('Name required', 'Give the campaign a name.', 'warn'); return false; }
        if (c.end < c.start) { BAUGMENT.ui.toast('Check the dates', 'The end date falls before the start date.', 'warn'); return false; }
        store.upsert('campaigns', c);
        BAUGMENT.ui.toast(isNew ? 'Campaign created' : 'Changes saved', c.name);
        close(); BAUGMENT.app.render();
        return false;
      }
    });

    BAUGMENT.ui.modal({ title: isNew ? 'New campaign' : 'Edit campaign', body, wide: true, actions });
  }

  function render(el) {
    const db = store.state();
    const f = store.getFilters();
    let list = db.campaigns.slice();
    if (f.status !== 'all' && S.CAMPAIGN_STATUS.indexOf(f.status) !== -1) list = list.filter((c) => c.status === f.status);
    if (f.platform !== 'all') list = list.filter((c) => c.platforms.indexOf(f.platform) !== -1);
    if (f.q) list = list.filter((c) => (c.name + ' ' + c.objective).toLowerCase().indexOf(f.q.toLowerCase()) !== -1);

    const rows = list.map((c) => {
      const posts = db.analytics.filter((r) => r.campaign_id === c.id);
      const actual = S.rollup(posts, c.kpi_metric);
      return { c, posts, actual, attain: c.kpi_target ? (actual / c.kpi_target) * 100 : 0 };
    }).sort((a, b) => (a.c.start < b.c.start ? 1 : -1));

    const active = rows.filter((r) => r.c.status === 'active');
    const hit = rows.filter((r) => r.attain >= 100).length;
    const totalBudget = rows.reduce((a, r) => a + (r.c.budget || 0), 0);

    const kpis = '<div class="kpis">' +
      B.kpi('Campaigns', U.fmt.int(rows.length), {}) +
      B.kpi('Active now', U.fmt.int(active.length), {}) +
      B.kpi('KPI met', U.fmt.int(hit), { foot: '<span class="mute">of ' + rows.length + '</span>' }) +
      B.kpi('Committed budget', U.fmt.idr(totalBudget), { foot: '<span class="mute">where a budget is set</span>' }) +
      '</div>';

    const attainChart = B.card('KPI attainment — active campaigns',
      active.length
        ? C.hbars(active.map((r) => ({
            html: esc(r.c.name) + ' <span class="mute mono tiny">' + esc(store.metricLabel(r.c.kpi_metric)) + '</span>',
            label: r.c.name, value: Math.min(200, r.attain),
            color: r.attain >= 100 ? 'var(--accent)' : r.attain >= 60 ? 'var(--gold)' : 'var(--rose)'
          })), { format: (v) => v.toFixed(0) + '%' })
        : '<p class="tiny mute">No campaigns are active right now.</p>');

    const objectives = S.OBJECTIVES.map((o) => ({ label: o, value: rows.filter((r) => r.c.objective === o).length })).filter((x) => x.value);
    const objectiveChart = B.card('Campaigns by objective',
      C.donut(objectives, { size: 210, centerLabel: 'Campaigns', centerValue: String(rows.length) }));

    const table = B.card('All campaigns',
      '<div class="table-wrap"><table class="table"><thead><tr><th>Campaign</th><th>Objective</th><th>Runs</th>' +
      '<th>Platforms</th><th>Status</th><th class="n">Posts</th><th class="n">Target</th><th class="n">Actual</th>' +
      '<th class="n">Attainment</th><th class="n">Budget</th></tr></thead><tbody>' +
      (rows.length ? rows.map((r) => '<tr data-id="' + r.c.id + '" style="cursor:pointer">' +
        '<td style="font-weight:600">' + esc(r.c.name) + '</td>' +
        '<td class="mute">' + esc(r.c.objective) + '</td>' +
        '<td class="mono tiny">' + esc(r.c.start) + ' → ' + esc(r.c.end) + '</td>' +
        '<td><span class="row" style="gap:4px">' + r.c.platforms.map((p) => B.platformChip(p, false)).join('') + '</span></td>' +
        '<td>' + B.statusChip(r.c.status) + '</td>' +
        '<td class="n">' + r.posts.length + '</td>' +
        '<td class="n">' + U.fmt.compact(r.c.kpi_target) + '</td>' +
        '<td class="n">' + U.fmt.compact(r.actual) + '</td>' +
        '<td class="n" style="color:' + (r.attain >= 100 ? 'var(--accent)' : r.attain >= 60 ? 'var(--gold)' : 'var(--rose)') + '">' + r.attain.toFixed(0) + '%</td>' +
        '<td class="n">' + (r.c.budget ? U.fmt.idr(r.c.budget) : '—') + '</td></tr>').join('')
        : '<tr><td colspan="10">' + BAUGMENT.ui.empty('No campaigns match', 'Clear the filters or create one.') + '</td></tr>') +
      '</tbody></table></div>', { flush: true });

    el.innerHTML = kpis + '<div class="grid-2" style="margin-bottom:16px">' + attainChart + objectiveChart + '</div>' + table;

    el.querySelectorAll('tbody tr[data-id]').forEach((tr) => tr.addEventListener('click', () => {
      const c = store.campaign(tr.getAttribute('data-id'));
      if (c) editCampaign(c);
    }));
    BAUGMENT.charts.bind(el);
  }

  return {
    title: 'Campaigns',
    eyebrow: 'Time-boxed pushes',
    lede: 'Each campaign carries one KPI target. Attainment is measured against the posts tagged to it.',
    filters: true,
    actions: () => '<button class="btn btn--primary" id="cmpNew">' + BAUGMENT.icon.render('plus', 15) + ' New campaign</button>',
    wireActions(root) {
      root.querySelector('#cmpNew').addEventListener('click', () => {
        const today = BAUGMENT.util.iso(new Date());
        BAUGMENT.views.campaigns.edit({
          id: BAUGMENT.util.uid('cmp'), name: '', objective: 'Awareness', start: today,
          end: BAUGMENT.util.iso(BAUGMENT.util.addDays(new Date(), 30)), budget: null,
          platforms: ['linkedin'], kpi_metric: 'reach', kpi_target: 25000,
          status: 'planned', owner: '', notes: ''
        });
      });
    },
    edit: editCampaign,
    render
  };
})();


/* ========================================================================== */
/* Media Library                                                              */
/* ========================================================================== */
/* ========================================================================== */
/* Media Library                                                              */
/* ========================================================================== */

BAUGMENT.views.media = (function () {
  const U = BAUGMENT.util;
  const B = BAUGMENT.bits;
  const store = BAUGMENT.store;
  const files = BAUGMENT.mediaFiles;
  const icon = BAUGMENT.icon.render;
  const esc = U.esc;

  let kindFilter = 'all';
  let q = '';

  /* --- Thumbnails ---------------------------------------------------------- */

  /* Drawn from the record, not from a file: a royal-blue gradient keyed to the
     stored hue with four modules on it, the same motif as the sign-in stage.
     This is what a seeded item shows, and what anything without bytes falls
     back to. */
  function fallbackTile(m) {
    const h = m.hue || 218;
    return '<svg viewBox="0 0 120 90" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><linearGradient id="g' + esc(m.id) + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="hsl(' + h + ' 62% 44%)"/><stop offset="100%" stop-color="hsl(' + (h - 8) + ' 68% 24%)"/>' +
      '</linearGradient></defs><rect width="120" height="90" fill="url(#g' + esc(m.id) + ')"/>' +
      [0, 1].map((r) => [0, 1].map((c) =>
        '<rect x="' + (26 + c * 36) + '" y="' + (20 + r * 28) + '" width="32" height="24" rx="5" fill="rgba(255,255,255,.12)"/>').join('')).join('') +
      '</svg>';
  }

  /* Rendering stays synchronous — the view paints the fallback immediately and
     a second async pass swaps in the real picture as each one resolves. A
     signed URL is a network round trip; blocking the whole grid on it would
     make the section feel broken on a slow connection. */
  function thumbSlot(m) {
    return '<div class="media__img" data-thumb="' + esc(m.id) + '">' + fallbackTile(m) + '</div>';
  }

  function paintThumbs(root) {
    const slots = Array.from(root.querySelectorAll('[data-thumb]'));
    slots.forEach(async (slot) => {
      const m = store.media(slot.getAttribute('data-thumb'));
      if (!m) return;
      const src = await files.url(m);
      if (!document.body.contains(slot)) return;          /* re-rendered meanwhile */

      if (src && m.kind === 'video') {
        /* In the grid a video is a poster frame; in the preview it's playable. */
        const full = slot.classList.contains('media__preview');
        slot.innerHTML = '<video src="' + esc(src) + '"' + (full ? ' controls' : ' muted playsinline') +
          ' preload="metadata"></video>';
        return;
      }
      if (src && m.kind !== 'document') {
        slot.innerHTML = '<img src="' + esc(src) + '" alt="' + esc(m.name) + '" loading="lazy">';
        return;
      }
      /* No bytes. Seeded records never had any and that is by design; anything
         the team actually uploaded is a file that went missing, and saying so
         is more useful than a tile that looks like a thumbnail. */
      if (!src && !store.isDemo(m)) {
        slot.insertAdjacentHTML('beforeend',
          '<span class="media__missing" title="The record is here but the file is not. Open it to attach one.">' +
          icon('alert', 11) + ' No file</span>');
      }
    });
  }

  /* --- Preview ------------------------------------------------------------- */

  function preview(m) {
    const meta = [['Kind', m.kind], ['Category', m.category],
      ['Size', m.size ? (m.size / 1048576).toFixed(2) + ' MB' : '—'],
      ['Dimensions', m.width && m.height ? m.width + '×' + m.height : '—'],
      ['Uploaded', U.fmt.date(m.uploaded)], ['Tags', (m.tags || []).join(', ') || '—'],
      ['Shared', m.storage_path ? 'Yes — in Supabase Storage' : 'No — this device only']];

    const modal = BAUGMENT.ui.modal({
      title: m.name,
      body:
        '<div class="media__preview" id="previewStage" data-thumb="' + esc(m.id) + '">' + fallbackTile(m) + '</div>' +
        '<div id="previewNote"></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px">' +
        meta.map((f) => '<div><div class="tiny mute">' + esc(f[0]) + '</div><div class="tiny">' + esc(f[1]) + '</div></div>').join('') +
        '</div>' +
        '<input type="file" id="replaceFile" hidden>',
      wide: true,
      actions: [
        { label: 'Remove', variant: 'danger', keepOpen: true, onClick: async (b, close) => {
            const ok = await BAUGMENT.ui.confirm('Remove ' + m.name + '?',
              'The record and the stored file are both deleted, and it disappears from any post that used it as a thumbnail.', 'Remove');
            if (!ok) return false;
            await files.remove(m);
            store.remove('media', m.id);
            BAUGMENT.ui.toast('Removed', m.name);
            close(); BAUGMENT.app.render();
            return false;
          } },
        { label: m.storage_path || m.dataUrl ? 'Replace file…' : 'Attach a file…', keepOpen: true,
          onClick: (b) => { b.querySelector('#replaceFile').click(); return false; } },
        { label: 'Close', variant: 'primary' }
      ]
    });

    paintThumbs(modal.body);

    files.has(m).then((yes) => {
      if (yes || !modal.body.querySelector('#previewNote')) return;
      modal.body.querySelector('#previewNote').innerHTML =
        '<p class="tiny" style="color:var(--gold);line-height:1.6;margin:0 0 16px">' +
        'This record has no file behind it. If it was uploaded before media storage was switched on, ' +
        'the bytes were only ever held in that browser session — attach the file again and it will be kept properly this time.</p>';
    });

    const input = modal.body.querySelector('#replaceFile');
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      BAUGMENT.ui.toast('Uploading', file.name, 'info');
      try {
        const path = await files.upload(m, file);
        const dims = await dimensions(file);
        store.upsert('media', Object.assign({}, m, {
          name: file.name, size: file.size, storage_path: path,
          kind: kindOf(file), width: dims.width, height: dims.height,
          uploaded: U.iso(new Date()), dataUrl: null
        }));
        BAUGMENT.ui.toast('File attached', path ? 'Stored and shared with every device.' : 'Stored on this device.', 'success');
        modal.close();
        BAUGMENT.app.render();
      } catch (err) {
        BAUGMENT.ui.toast('Upload failed', err.message, 'error', 9000);
      }
    });
  }

  /* --- Ingest -------------------------------------------------------------- */

  function kindOf(file) {
    if (String(file.type).indexOf('video') === 0) return 'video';
    if (String(file.type).indexOf('image') === 0) return 'image';
    return 'document';
  }

  /* Reads an image's real pixel size so the library shows something truer than
     0×0. Videos and documents return zeros and that is fine. */
  function dimensions(file) {
    return new Promise((resolve) => {
      if (String(file.type).indexOf('image') !== 0) { resolve({ width: 0, height: 0 }); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { resolve({ width: 0, height: 0 }); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }

  async function ingest(fileList) {
    const list = Array.from(fileList);
    if (!list.length) return;

    const note = BAUGMENT.ui.toast('Uploading', list.length + ' file' + (list.length === 1 ? '' : 's') + '…', 'info', 60000);
    let added = 0;
    const failures = [];

    for (const file of list) {
      const record = {
        id: U.uid('med'),
        name: file.name,
        kind: kindOf(file),
        tags: ['uploaded'],
        category: 'Uncategorised',
        size: file.size,
        width: 0, height: 0,
        hue: 218,
        uploaded: U.iso(new Date()),
        storage_path: null,
        source: 'manual'
      };
      try {
        const dims = await dimensions(file);
        record.width = dims.width;
        record.height = dims.height;
        record.storage_path = await files.upload(record, file);
        store.upsert('media', record);
        added++;
      } catch (err) {
        failures.push(file.name + ' — ' + err.message);
      }
    }

    note.remove();

    if (added) {
      BAUGMENT.ui.toast('Added to library',
        added + ' file' + (added === 1 ? '' : 's') +
        (files.shared() ? ' — stored in Supabase and available on every device.' : ' — stored on this device.'),
        'success', 6000);
    }
    failures.forEach((f) => BAUGMENT.ui.toast('Upload failed', f, 'error', 9000));
    BAUGMENT.app.render();
  }

  /* --- Render -------------------------------------------------------------- */

  function render(el) {
    const all = store.state().media;
    const items = all.filter((m) => {
      if (kindFilter !== 'all' && m.kind !== kindFilter) return false;
      if (q && (m.name + ' ' + (m.tags || []).join(' ') + ' ' + m.category).toLowerCase().indexOf(q.toLowerCase()) === -1) return false;
      return true;
    });

    const bar = '<div class="row no-print" style="margin-bottom:16px">' +
      '<div class="segmented" id="mediaKind">' +
      [['all', 'All'], ['image', 'Images'], ['video', 'Videos'], ['document', 'Documents']].map((k) =>
        '<button data-kind="' + k[0] + '" aria-pressed="' + (kindFilter === k[0]) + '">' + k[1] + '</button>').join('') + '</div>' +
      '<div class="search" style="max-width:280px">' + icon('search', 15) +
        '<input class="input" id="mediaSearch" placeholder="Search name, tag, category" value="' + esc(q) + '"></div>' +
      '<div class="spacer"></div><span class="tiny mute">' + items.length + ' of ' + all.length + '</span></div>';

    const where = files.shared()
      ? 'Files upload to Supabase Storage, so they are there on every device, and are cached locally so previews work offline.'
      : 'No Supabase project is connected, so files are kept in this browser. They survive a refresh, but a colleague on another machine will not see them.';

    const zone = '<div class="dropzone no-print" id="mediaDrop" style="margin-bottom:16px;padding:26px">' +
      '<div class="dropzone__icon">' + icon('upload', 34) + '</div>' +
      '<div style="font-weight:600">Drop images, videos or documents here</div>' +
      '<p class="tiny mute" style="margin-top:6px;max-width:60ch;margin-left:auto;margin-right:auto;line-height:1.6">' +
      'Or click to browse. ' + esc(where) + ' Up to ' + (files.MAX_BYTES / 1048576) + ' MB per file.</p>' +
      '<input type="file" id="mediaFile" multiple accept="image/*,video/*,.pdf,.doc,.docx" hidden></div>';

    const grid = items.length
      ? '<div class="media-grid">' + items.map((m) =>
          '<article class="media" data-id="' + m.id + '">' +
            '<div class="media__thumb">' + thumbSlot(m) +
              '<span class="media__kind">' + esc(m.kind) + '</span></div>' +
            '<div class="media__body"><div class="media__name" title="' + esc(m.name) + '">' + esc(m.name) + '</div>' +
            '<div class="tiny mute mono">' + (m.size / 1048576).toFixed(1) + ' MB · ' + esc(m.category) + '</div></div>' +
          '</article>').join('') + '</div>'
      : B.card(null, BAUGMENT.ui.empty('Nothing in the library matches',
          'Clear the search, or drop a file above to add one.'));

    el.innerHTML = bar + zone + grid;

    el.querySelectorAll('#mediaKind button').forEach((b) => b.addEventListener('click', () => {
      kindFilter = b.getAttribute('data-kind'); render(el);
    }));
    const search = el.querySelector('#mediaSearch');
    search.addEventListener('input', U.debounce(() => {
      q = search.value; render(el);
      const s = document.getElementById('mediaSearch');
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }, 260));

    el.querySelectorAll('.media').forEach((n) => n.addEventListener('click', () => {
      const m = store.media(n.getAttribute('data-id'));
      if (m) preview(m);
    }));

    const drop = el.querySelector('#mediaDrop');
    const input = el.querySelector('#mediaFile');
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files.length) ingest(input.files); });
    BAUGMENT.ui.dropTarget(drop, ingest);

    paintThumbs(el);
  }

  return {
    title: 'Media Library',
    eyebrow: 'Shots, cuts and decks',
    lede: 'Everything the team produces, in one place, tagged so it can be found again three months later.',
    filters: false,
    render,
    ingest,
    thumbSlot,
    paintThumbs
  };
})();
