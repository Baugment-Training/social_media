/* BAUGMENT — measurement views: Dashboard, Analytics, Reports */

/* --- Shared render bits, used by every view ------------------------------- */
BAUGMENT.bits = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const esc = U.esc;

  function platformChip(id, withName) {
    const p = S.platform(id);
    return '<span class="pf pf--' + esc(id) + '"><span class="pf__mark">' + BAUGMENT.icon.brand(id, 12) + '</span>' +
      (withName === false ? '' : '<span>' + esc(p.name) + '</span>') + '</span>';
  }

  function statusChip(status) {
    return '<span class="chip status status--' + esc(status) + '">' + esc(status.charAt(0).toUpperCase() + status.slice(1)) + '</span>';
  }

  function pillarChip(id) {
    const p = BAUGMENT.store.pillar(id);
    if (!p) return '<span class="mute">—</span>';
    return '<span class="chip"><span class="chip__dot" style="background:' + p.color + '"></span>' + esc(p.name) + '</span>';
  }

  function kpi(label, value, opts) {
    opts = opts || {};
    return '<div class="kpi">' +
      '<div class="kpi__label">' + esc(label) + '</div>' +
      '<div class="kpi__value num">' + value + (opts.unit ? ' <small>' + esc(opts.unit) + '</small>' : '') + '</div>' +
      (opts.foot ? '<div class="kpi__foot">' + opts.foot + '</div>' : '') +
      (opts.spark ? '<div class="kpi__spark">' + opts.spark + '</div>' : '') +
      '</div>';
  }

  function card(title, bodyHtml, opts) {
    opts = opts || {};
    return '<section class="card"' + (opts.id ? ' id="' + opts.id + '"' : '') + ' style="' + (opts.style || '') + '">' +
      (title ? '<div class="card__head"><h2 class="card__title">' + esc(title) + '</h2>' +
        (opts.tools ? '<div class="spacer"></div>' + opts.tools : '') + '</div>' : '') +
      '<div class="card__body' + (opts.flush ? ' card__body--flush' : '') + '">' + bodyHtml + '</div></section>';
  }

  function platformColor(id) { return 'var(--pf-' + id + ')'; }

  return { platformChip, statusChip, pillarChip, kpi, card, platformColor };
})();


/* ========================================================================== */
/* Dashboard                                                                  */
/* ========================================================================== */

BAUGMENT.views.dashboard = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const B = BAUGMENT.bits;
  const store = BAUGMENT.store;
  const C = BAUGMENT.charts;
  const esc = U.esc;

  function bestPostCard(rows, worst) {
    if (!rows.length) return BAUGMENT.ui.empty('No posts in this window', 'Widen the date range or clear a filter to see performance.');
    const sorted = rows.slice().sort((a, b) => S.engagementRate(b) - S.engagementRate(a));
    const r = worst ? sorted[sorted.length - 1] : sorted[0];
    return '<div class="row" style="margin-bottom:10px">' + B.platformChip(r.platform) +
      '<span class="chip">' + esc(r.media_type) + '</span>' + B.pillarChip(r.pillar_id) +
      '<span class="spacer"></span><span class="mono mute">' + U.fmt.date(r.published_date) + ' · ' + U.fmt.time(r.published_time) + '</span></div>' +
      '<p style="font-size:var(--step--1);line-height:1.6;color:var(--text-dim);margin-bottom:14px">' + esc(r.caption) + '</p>' +
      '<div class="row" style="gap:20px">' +
        stat('Reach', U.fmt.compact(r.reach || r.views)) +
        stat('Engagements', U.fmt.compact(S.engagements(r))) +
        stat('Eng. rate', U.fmt.pct(S.engagementRate(r))) +
        stat('Saves', U.fmt.compact(r.saves)) +
      '</div>';
  }

  function stat(label, value) {
    return '<div><div class="eyebrow">' + esc(label) + '</div>' +
      '<div class="num" style="font-size:var(--step-1);font-weight:650;margin-top:2px">' + value + '</div></div>';
  }

  function render(el) {
    const rows = store.rows();
    const prev = store.previousRows();
    const t = store.totals(rows);
    const p = store.totals(prev);
    const db = store.state();
    const grain = store.grainFor(rows);

    const totalFollowers = store.totalFollowers();

    /* Growth comes from the dated readings when they exist; otherwise it falls
       back to summing per-post follower deltas, which is a rougher proxy. */
    const rec30 = store.followerGrowth(30);
    const rec7 = store.followerGrowth(7);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const monthRows = db.analytics.filter((r) => r.published_date >= U.iso(U.addDays(today, -29)));
    const prevMonthRows = db.analytics.filter((r) => r.published_date >= U.iso(U.addDays(today, -59)) && r.published_date < U.iso(U.addDays(today, -29)));
    const weekRows = db.analytics.filter((r) => r.published_date >= U.iso(U.addDays(today, -6)));
    const prevWeekRows = db.analytics.filter((r) => r.published_date >= U.iso(U.addDays(today, -13)) && r.published_date < U.iso(U.addDays(today, -6)));
    const monthGrowth = rec30 && rec30.pct != null ? rec30.pct
      : store.delta(S.rollup(monthRows, 'net_followers'), S.rollup(prevMonthRows, 'net_followers'));
    const weekGrowth = rec7 && rec7.pct != null ? rec7.pct
      : store.delta(S.rollup(weekRows, 'net_followers'), S.rollup(prevWeekRows, 'net_followers'));
    const growthNote = rec30 ? 'from recorded readings' : 'net follows vs prior period';

    /* Best platform by engagement rate, with a floor so a single lucky post
       doesn't win the title. */
    const byPlatform = U.groupBy(rows, (r) => r.platform);
    let best = null;
    byPlatform.forEach((list, id) => {
      if (list.length < 3) return;
      const er = S.rollup(list, 'engagement_rate');
      if (!best || er > best.er) best = { id, er, posts: list.length };
    });

    const activeCampaigns = db.campaigns.filter((c) => c.status === 'active').length;
    const reachSeries = store.series(rows, 'reach', grain);
    const engSeries = store.series(rows, 'engagements', grain);
    const postSeries = store.series(rows, 'engagements', grain).buckets.map((b) => b.rows.length);

    /* --- KPI strip --- */
    const kpis = '<div class="kpis">' +
      B.kpi('Posts published', U.fmt.int(t.posts), { foot: BAUGMENT.ui.delta(store.delta(t.posts, p.posts)) + '<span class="mute">vs prior period</span>' }) +
      B.kpi('Total reach', U.fmt.compact(t.reach), { foot: BAUGMENT.ui.delta(store.delta(t.reach, p.reach)), spark: C.spark(reachSeries.values) }) +
      B.kpi('Impressions', U.fmt.compact(t.impressions), { foot: BAUGMENT.ui.delta(store.delta(t.impressions, p.impressions)) }) +
      B.kpi('Engagements', U.fmt.compact(t.engagements), { foot: BAUGMENT.ui.delta(store.delta(t.engagements, p.engagements)), spark: C.spark(engSeries.values, 'var(--gold)') }) +
      B.kpi('Engagement rate', U.fmt.pct(t.engagement_rate), { foot: BAUGMENT.ui.delta(store.delta(t.engagement_rate, p.engagement_rate)) }) +
      B.kpi('Link clicks', U.fmt.compact(t.link_clicks), { foot: BAUGMENT.ui.delta(store.delta(t.link_clicks, p.link_clicks)) }) +
      B.kpi('Followers', U.fmt.compact(totalFollowers), {
        foot: '<span class="mute">across ' + db.accounts.length + ' account' + (db.accounts.length === 1 ? '' : 's') + '</span>' }) +
      B.kpi('Net followers', U.fmt.int(rec30 ? rec30.change : t.net_followers), {
        foot: '<span class="mute">' + (rec30 ? 'last 30 days, recorded' : 'in this window') + '</span>' }) +
      B.kpi('30-day growth', U.fmt.signed(monthGrowth), { foot: '<span class="mute">' + growthNote + '</span>' }) +
      B.kpi('7-day growth', U.fmt.signed(weekGrowth), { foot: '<span class="mute">' + growthNote + '</span>' }) +
      B.kpi('Best platform', best ? S.platform(best.id).name : '—', { foot: best ? '<span class="mute">' + U.fmt.pct(best.er) + ' eng. rate</span>' : '<span class="mute">needs 3+ posts</span>' }) +
      B.kpi('Active campaigns', U.fmt.int(activeCampaigns), { foot: '<span class="mute">of ' + db.campaigns.length + ' total</span>' }) +
      '</div>';

    /* --- Trend --- */
    const trend = B.card('Reach and engagement over time',
      C.line(reachSeries.labels, [
        { name: 'Reach', values: reachSeries.values, color: 'var(--accent)' },
        { name: 'Engagements', values: engSeries.values, color: 'var(--gold)' }
      ], { area: true, height: 268 }),
      { tools: '<span class="chip mono">' + grain + 'ly</span>' });

    /* --- Platform comparison --- */
    const pfIds = store.livePlatforms().map((x) => x.id);
    const pfRows = pfIds.map((id) => byPlatform.get(id) || []);
    const platformCompare = B.card('Platform comparison',
      C.bars(pfIds.map((id) => S.platform(id).name), [
        { name: 'Reach', values: pfRows.map((l) => S.rollup(l, 'reach')), color: 'var(--accent)' },
        { name: 'Engagements', values: pfRows.map((l) => S.rollup(l, 'engagements')), color: 'var(--gold)' }
      ], { height: 236 }));

    /* --- Pillar mix --- */
    const pillarSlices = db.pillars.map((pl) => ({
      label: pl.name, color: pl.color,
      value: S.rollup(rows.filter((r) => r.pillar_id === pl.id), 'reach')
    })).filter((s) => s.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);
    const pillarMix = B.card('Reach by content pillar',
      C.donut(pillarSlices, { size: 220, centerLabel: 'Total reach', centerValue: U.fmt.compact(t.reach) }));

    /* --- Best posting time --- */
    const hours = [];
    for (let h = 8; h <= 23; h++) hours.push(h);
    const matrix = U.DOW.map((_, di) => hours.map((h) => {
      const set = rows.filter((r) => {
        const d = U.parse(r.published_date);
        return d && (d.getDay() + 6) % 7 === di && parseInt(r.published_time, 10) === h;
      });
      return set.length ? S.rollup(set, 'engagement_rate') : 0;
    }));
    const heat = B.card('Best posting time',
      '<p class="tiny mute" style="margin-bottom:12px">Engagement rate by day and hour. This is a working audience, so the weekend columns are thin by design.</p>' +
      '<div style="overflow-x:auto">' + C.heatmap(matrix, U.DOW, hours.map((h) => U.pad(h)), { cell: 21, format: (v) => U.fmt.pct(v, 1) }) + '</div>');

    /* --- Posting frequency --- */
    const freq = B.card('Posting frequency',
      C.bars(reachSeries.labels, [{ name: 'Posts', values: postSeries, color: 'var(--sky)' }], { height: 196, format: U.fmt.int }));

    /* --- Top / bottom post --- */
    const bestPost = B.card('Best performing post', bestPostCard(rows, false));
    const worstPost = B.card('Lowest performing post', bestPostCard(rows, true));

    /* --- Top posts table --- */
    const top = rows.slice().sort((a, b) => (b.reach || b.views) - (a.reach || a.views)).slice(0, 8);
    const topTable = B.card('Top posts by reach',
      '<div class="table-wrap"><table class="table"><thead><tr>' +
      '<th>Platform</th><th>Caption</th><th>Pillar</th><th class="n">Reach</th><th class="n">Eng.</th><th class="n">Rate</th></tr></thead><tbody>' +
      top.map((r) => '<tr>' +
        '<td>' + B.platformChip(r.platform, false) + '</td>' +
        '<td class="clamp" title="' + esc(r.caption) + '">' + esc(r.caption) + '</td>' +
        '<td>' + B.pillarChip(r.pillar_id) + '</td>' +
        '<td class="n">' + U.fmt.compact(r.reach || r.views) + '</td>' +
        '<td class="n">' + U.fmt.compact(S.engagements(r)) + '</td>' +
        '<td class="n">' + U.fmt.pct(S.engagementRate(r), 1) + '</td></tr>').join('') +
      '</tbody></table></div>', { flush: true });

    el.innerHTML = kpis +
      '<div style="display:grid;gap:16px;margin-bottom:16px">' + trend + '</div>' +
      '<div class="grid-2" style="margin-bottom:16px">' + platformCompare + pillarMix + '</div>' +
      '<div class="grid-2" style="margin-bottom:16px">' + bestPost + worstPost + '</div>' +
      '<div class="grid-2" style="margin-bottom:16px">' + heat + freq + '</div>' +
      topTable;
  }

  return {
    title: 'Dashboard',
    eyebrow: 'Baugment · Jakarta Selatan',
    lede: 'Everything Baugment published, and what it did. Filters below apply to every number on this page.',
    filters: true,
    render
  };
})();


/* ========================================================================== */
/* Analytics                                                                  */
/* ========================================================================== */

BAUGMENT.views.analytics = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const B = BAUGMENT.bits;
  const store = BAUGMENT.store;
  const C = BAUGMENT.charts;
  const esc = U.esc;

  let sortKey = 'published_date';
  let sortDir = -1;
  let page = 0;
  const PER = 25;
  let metric = 'reach';
  let chartMode = 'line';

  const COLUMNS = [
    { key: 'published_date', label: 'Date', cell: (r) => U.fmt.date(r.published_date) + ' <span class="mute mono">' + U.fmt.time(r.published_time) + '</span>' },
    { key: 'platform', label: 'Platform', cell: (r) => B.platformChip(r.platform) },
    { key: 'caption', label: 'Caption', cell: (r) => '<span class="clamp" title="' + esc(r.caption) + '">' + esc(r.caption) + '</span>' },
    { key: 'media_type', label: 'Media', cell: (r) => '<span class="chip">' + esc(r.media_type) + '</span>' },
    { key: 'pillar_id', label: 'Pillar', cell: (r) => B.pillarChip(r.pillar_id), sortVal: (r) => store.pillarName(r.pillar_id) },
    { key: 'campaign_id', label: 'Campaign', cell: (r) => (r.campaign_id ? '<span class="clamp" style="max-width:150px">' + esc(store.campaignName(r.campaign_id)) + '</span>' : '<span class="mute">—</span>'), sortVal: (r) => store.campaignName(r.campaign_id) },
    { key: 'reach', label: 'Reach', num: true },
    { key: 'impressions', label: 'Impr.', num: true },
    { key: 'engagements', label: 'Eng.', num: true },
    { key: 'engagement_rate', label: 'Eng. rate', num: true, fmt: (v) => U.fmt.pct(v, 1) },
    { key: 'link_clicks', label: 'Clicks', num: true },
    { key: 'saves', label: 'Saves', num: true }
  ];

  function sorted(rows) {
    const col = COLUMNS.find((c) => c.key === sortKey);
    return rows.slice().sort((a, b) => {
      let va, vb;
      if (col && col.sortVal) { va = col.sortVal(a); vb = col.sortVal(b); }
      else if (col && col.num) { va = S.metricValue(a, sortKey); vb = S.metricValue(b, sortKey); }
      else { va = a[sortKey]; vb = b[sortKey]; }
      if (va == null) va = '';
      if (vb == null) vb = '';
      if (typeof va === 'string') return va.localeCompare(vb) * sortDir;
      return (va - vb) * sortDir;
    });
  }

  /* A new, empty published post. Metrics start at zero and are typed in. */
  function blankPost() {
    const db = store.state();
    const now = new Date();
    const live = store.livePlatforms()[0];
    return {
      id: U.uid('ana'),
      platform: live ? live.id : 'instagram',
      account_id: null, account: '', post_id: '', post_url: '', caption: '',
      media_type: 'Image', content_type: 'Organic', status: 'published',
      published_date: U.iso(now), published_time: U.pad(now.getHours()) + ':' + U.pad(now.getMinutes()),
      pillar_id: db.pillars[0] ? db.pillars[0].id : null, campaign_id: null, author: '',
      impressions: 0, reach: 0, views: 0, video_views: 0, watch_time: 0, avg_watch_time: 0,
      likes: 0, comments: 0, shares: 0, saves: 0, reactions: 0, replies: 0, bookmarks: 0,
      link_clicks: 0, profile_visits: 0, followers_gained: 0, followers_lost: 0,
      utm_source: '', utm_medium: 'social', utm_campaign: '', hashtags: '', mentions: '',
      location: 'Baugment, Graha Mampang Lt.3, Jakarta Selatan', notes: '',
      custom: {}, source: 'manual', imported_at: null
    };
  }

  /* The metric fields worth showing, in the order someone reading a platform's
     own insights screen would meet them. Derived values (engagement rate, CTR)
     are computed, never typed. */
  const METRIC_FIELDS = [
    { group: 'Reach', keys: ['impressions', 'reach', 'views', 'video_views'] },
    { group: 'Engagement', keys: ['likes', 'comments', 'shares', 'saves', 'reactions', 'replies', 'bookmarks'] },
    { group: 'Video', keys: ['watch_time', 'avg_watch_time'] },
    { group: 'Traffic', keys: ['link_clicks', 'profile_visits'] },
    { group: 'Audience', keys: ['followers_gained', 'followers_lost'] }
  ];

  function editPost(record, onSaved) {
    const db = store.state();
    const isNew = !db.analytics.some((x) => x.id === record.id);
    const r = Object.assign({}, record);
    r.custom = Object.assign({}, r.custom || {});

    const opts = (list, value, labelFn) => list.map((o) => {
      const v = typeof o === 'string' ? o : o.id;
      const l = labelFn ? labelFn(o) : (typeof o === 'string' ? o : o.name);
      return '<option value="' + esc(v) + '"' + (String(value) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');

    const numField = (key, label) =>
      '<label class="field" style="margin-bottom:0"><span class="field__label">' + esc(label) + '</span>' +
      '<input class="input num" type="number" min="0" step="any" data-m="' + esc(key) + '" ' +
      'value="' + esc(S.metricValue(r, key)) + '" style="text-align:right"></label>';

    /* Only offer what the platform actually reports, so nobody types a Saves
       figure for a LinkedIn post that never had one. */
    const supported = S.platform(r.platform).metrics || [];
    const relevant = (k) => supported.indexOf(k) !== -1;

    const metricsHtml = METRIC_FIELDS.map((g) => {
      const keys = g.keys.filter(relevant);
      if (!keys.length) return '';
      return '<div style="margin-bottom:16px"><div class="eyebrow" style="margin-bottom:8px">' + esc(g.group) + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">' +
        keys.map((k) => numField(k, store.metricLabel(k))).join('') + '</div></div>';
    }).join('');

    const customHtml = db.customMetrics.length
      ? '<div style="margin-bottom:16px"><div class="eyebrow" style="margin-bottom:8px">Custom</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">' +
        db.customMetrics.map((m) => numField(m.key, m.label)).join('') + '</div></div>'
      : '';

    const body =
      '<div class="eyebrow" style="margin-bottom:10px">The post</div>' +
      '<div class="grid-3">' +
        '<label class="field"><span class="field__label">Platform</span>' +
          '<select class="select" data-f="platform">' + opts(store.livePlatforms(), r.platform) + '</select></label>' +
        '<label class="field"><span class="field__label">Media type</span>' +
          '<select class="select" data-f="media_type">' + opts(S.MEDIA_TYPES, r.media_type) + '</select></label>' +
        '<label class="field"><span class="field__label">Content type</span>' +
          '<select class="select" data-f="content_type">' + opts(S.CONTENT_TYPES, r.content_type) + '</select></label>' +
      '</div>' +
      '<label class="field"><span class="field__label">Caption</span>' +
        '<textarea class="textarea" data-f="caption" placeholder="The caption as it published.">' + esc(r.caption) + '</textarea></label>' +
      '<div class="grid-3">' +
        '<label class="field"><span class="field__label">Published date</span>' +
          '<input class="input" type="date" data-f="published_date" value="' + esc(r.published_date) + '"></label>' +
        '<label class="field"><span class="field__label">Published time</span>' +
          '<input class="input" type="time" data-f="published_time" value="' + esc(r.published_time) + '"></label>' +
        '<label class="field"><span class="field__label">Author</span>' +
          '<input class="input" data-f="author" value="' + esc(r.author || '') + '" placeholder="Who posted it"></label>' +
      '</div>' +
      '<div class="grid-3">' +
        '<label class="field"><span class="field__label">Content pillar</span>' +
          '<select class="select" data-f="pillar_id"><option value="">Unassigned</option>' + opts(db.pillars, r.pillar_id) + '</select></label>' +
        '<label class="field"><span class="field__label">Campaign</span>' +
          '<select class="select" data-f="campaign_id"><option value="">No campaign</option>' + opts(db.campaigns, r.campaign_id) + '</select></label>' +
        '<label class="field"><span class="field__label">Account handle</span>' +
          '<input class="input" data-f="account" value="' + esc(r.account || '') + '" placeholder="@baugmentinstitute"></label>' +
      '</div>' +

      '<div class="eyebrow" style="margin:20px 0 10px">Numbers</div>' +
      '<p class="tiny mute" style="margin-bottom:14px;line-height:1.6">Copy these straight from the platform\'s own insights. ' +
      'Engagement rate and CTR are worked out from what you enter, so leave anything you don\'t have at zero.</p>' +
      '<div id="metricFields">' + metricsHtml + customHtml + '</div>' +
      '<div class="card" style="padding:12px 14px;margin-bottom:18px;background:var(--surface-2)">' +
        '<div class="row" style="gap:22px">' +
          '<div><div class="tiny mute">Engagements</div><div class="num" id="calcEng" style="font-weight:650">—</div></div>' +
          '<div><div class="tiny mute">Engagement rate</div><div class="num" id="calcEr" style="font-weight:650">—</div></div>' +
          '<div><div class="tiny mute">CTR</div><div class="num" id="calcCtr" style="font-weight:650">—</div></div>' +
          '<div><div class="tiny mute">Net followers</div><div class="num" id="calcNet" style="font-weight:650">—</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="eyebrow" style="margin-bottom:10px">Optional</div>' +
      '<div class="grid-2">' +
        '<label class="field"><span class="field__label">Post URL</span>' +
          '<input class="input" data-f="post_url" value="' + esc(r.post_url || '') + '" placeholder="https://instagram.com/p/…"></label>' +
        '<label class="field"><span class="field__label">Post ID</span>' +
          '<input class="input" data-f="post_id" value="' + esc(r.post_id || '') + '" placeholder="Used to spot duplicates on import"></label>' +
      '</div>' +
      '<label class="field"><span class="field__label">Hashtags</span>' +
        '<input class="input" data-f="hashtags" value="' + esc(r.hashtags || '') + '" placeholder="#baugment #digitallearning"></label>' +
      '<label class="field" style="margin-bottom:0"><span class="field__label">Notes</span>' +
        '<textarea class="textarea" data-f="notes" style="min-height:60px">' + esc(r.notes || '') + '</textarea></label>';

    const actions = [{ label: 'Cancel' }];
    if (!isNew) actions.push({
      label: 'Delete', variant: 'danger', keepOpen: true,
      onClick: async (bodyEl, close) => {
        const ok = await BAUGMENT.ui.confirm('Delete this post?',
          'Its numbers come out of every dashboard and report. This can\'t be undone.', 'Delete');
        if (!ok) return false;
        store.remove('analytics', r.id);
        BAUGMENT.ui.toast('Post deleted');
        close();
        if (onSaved) onSaved();
        return false;
      }
    });
    actions.push({
      label: isNew ? 'Add post' : 'Save changes', variant: 'primary', keepOpen: true,
      onClick: (bodyEl, close) => {
        harvest(bodyEl);
        if (!r.published_date) { BAUGMENT.ui.toast('A date is required', 'Every post needs a published date.', 'warn'); return false; }
        if (!r.caption.trim() && !r.post_url.trim()) {
          BAUGMENT.ui.toast('Add a caption or a URL', 'Otherwise the row is impossible to recognise later.', 'warn');
          return false;
        }
        const acc = store.state().accounts.find((a) => a.platform === r.platform);
        if (acc && !r.account) { r.account = acc.handle; r.account_id = acc.id; }
        else if (acc) r.account_id = acc.id;
        store.upsert('analytics', r);
        BAUGMENT.ui.toast(isNew ? 'Post added' : 'Changes saved',
          S.platform(r.platform).name + ' · ' + U.fmt.date(r.published_date));
        close();
        if (onSaved) onSaved();
        return false;
      }
    });

    function harvest(bodyEl) {
      bodyEl.querySelectorAll('[data-f]').forEach((f) => {
        const k = f.getAttribute('data-f');
        r[k] = (f.value === '' && (k === 'campaign_id' || k === 'pillar_id')) ? null : f.value;
      });
      bodyEl.querySelectorAll('[data-m]').forEach((f) => {
        const k = f.getAttribute('data-m');
        const v = Number(f.value) || 0;
        if (db.customMetrics.some((m) => m.key === k)) r.custom[k] = v;
        else r[k] = v;
      });
    }

    const m = BAUGMENT.ui.modal({ title: isNew ? 'Add a post' : 'Edit post', body, wide: true, actions });

    /* Live derived figures, so a typo in Reach is obvious before saving. */
    function recalc() {
      harvest(m.body);
      m.body.querySelector('#calcEng').textContent = U.fmt.int(S.engagements(r));
      m.body.querySelector('#calcEr').textContent = U.fmt.pct(S.engagementRate(r));
      m.body.querySelector('#calcCtr').textContent = U.fmt.pct(S.ctr(r));
      m.body.querySelector('#calcNet').textContent = U.fmt.int(S.netFollowers(r));
    }
    m.body.addEventListener('input', recalc);

    /* Switching platform changes which metrics exist, so redraw that block. */
    m.body.querySelector('[data-f="platform"]').addEventListener('change', () => {
      harvest(m.body);
      m.close();
      editPost(r, onSaved);
    });

    recalc();
    return m;
  }

  function detail(r) {
    const fields = [
      ['Post ID', r.post_id], ['Account', r.account], ['Status', r.status],
      ['Media type', r.media_type], ['Content type', r.content_type], ['Author', r.author],
      ['Pillar', store.pillarName(r.pillar_id)], ['Campaign', r.campaign_id ? store.campaignName(r.campaign_id) : '—'],
      ['UTM source', r.utm_source || '—'], ['UTM medium', r.utm_medium || '—'], ['UTM campaign', r.utm_campaign || '—'],
      ['Location', r.location || '—'], ['Mentions', r.mentions || '—']
    ];
    const metrics = store.allMetrics().map((m) => [m.label, store.formatMetric(m.key, S.metricValue(r, m.key))]);

    const body =
      '<div class="row" style="margin-bottom:14px">' + B.platformChip(r.platform) + B.statusChip(r.status) +
        '<span class="chip">' + esc(r.media_type) + '</span>' + B.pillarChip(r.pillar_id) +
        '<span class="spacer"></span><span class="mono mute">' + U.fmt.date(r.published_date, 'long') + ' · ' + U.fmt.time(r.published_time) + ' WIB</span></div>' +
      '<p style="line-height:1.65;margin-bottom:8px">' + esc(r.caption) + '</p>' +
      '<p class="tiny" style="color:var(--sky);margin-bottom:18px">' + esc(r.hashtags) + '</p>' +
      '<div class="eyebrow" style="margin-bottom:8px">Metrics</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:20px">' +
        metrics.map((m) => '<div><div class="tiny mute">' + esc(m[0]) + '</div><div class="num" style="font-weight:600">' + m[1] + '</div></div>').join('') +
      '</div>' +
      '<div class="eyebrow" style="margin-bottom:8px">Details</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">' +
        fields.map((f) => '<div><div class="tiny mute">' + esc(f[0]) + '</div><div class="tiny">' + esc(f[1] || '—') + '</div></div>').join('') +
      '</div>';

    BAUGMENT.ui.modal({
      title: 'Post detail', body, wide: true,
      actions: [
        { label: 'Open post', onClick: () => {
            if (r.post_url) window.open(r.post_url, '_blank', 'noopener');
            else BAUGMENT.ui.toast('No URL on this post', 'Add one when you edit it.', 'info');
            return false;
          }, keepOpen: true },
        { label: 'Edit numbers', variant: 'primary', onClick: (b, close) => {
            close();
            editPost(r, () => BAUGMENT.app.render());
            return false;
          }, keepOpen: true }
      ]
    });
  }

  function render(el) {
    const all = store.rows();
    const t = store.totals(all);
    const prev = store.totals(store.previousRows());
    const grain = store.grainFor(all);
    const metricDefs = store.allMetrics();

    const headline = '<div class="kpis">' +
      B.kpi('Posts', U.fmt.int(t.posts), { foot: BAUGMENT.ui.delta(store.delta(t.posts, prev.posts)) }) +
      B.kpi(store.metricLabel(metric), store.formatMetric(metric, t[metric]), { foot: BAUGMENT.ui.delta(store.delta(t[metric], prev[metric])) }) +
      B.kpi('Avg per post', store.formatMetric(metric, t.posts ? t[metric] / t.posts : 0), {}) +
      B.kpi('Engagement rate', U.fmt.pct(t.engagement_rate), { foot: BAUGMENT.ui.delta(store.delta(t.engagement_rate, prev.engagement_rate)) }) +
      B.kpi('CTR', U.fmt.pct(t.ctr), { foot: BAUGMENT.ui.delta(store.delta(t.ctr, prev.ctr)) }) +
      B.kpi('Net followers', U.fmt.int(t.net_followers), { foot: BAUGMENT.ui.delta(store.delta(t.net_followers, prev.net_followers)) }) +
      '</div>';

    const metricPicker = '<select class="select" id="metricPick" style="width:auto;height:30px;font-size:var(--step--1)" aria-label="Metric">' +
      Object.keys(S.GROUPS).map((g) => {
        const items = metricDefs.filter((m) => m.group === g);
        if (!items.length) return '';
        return '<optgroup label="' + esc(S.GROUPS[g]) + '">' +
          items.map((m) => '<option value="' + m.key + '"' + (metric === m.key ? ' selected' : '') + '>' + esc(m.label) + '</option>').join('') +
          '</optgroup>';
      }).join('') + '</select>' +
      '<div class="segmented" id="chartMode">' +
      ['line', 'area', 'bar', 'stacked'].map((m) =>
        '<button data-mode="' + m + '" aria-pressed="' + (chartMode === m) + '">' + m.charAt(0).toUpperCase() + m.slice(1) + '</button>').join('') + '</div>';

    /* Series split by platform so the comparison is legible in every mode. */
    const pfIds = store.livePlatforms().map((x) => x.id).filter((id) => all.some((r) => r.platform === id));
    const base = store.series(all, metric, grain);
    const series = pfIds.map((id) => {
      const rowsFor = all.filter((r) => r.platform === id);
      const s = store.series(rowsFor, metric, grain);
      const byKey = new Map(s.buckets.map((b, i) => [b.key, s.values[i]]));
      return { name: S.platform(id).name, color: B.platformColor(id), values: base.buckets.map((b) => byKey.get(b.key) || 0) };
    });

    const fmtV = (v) => store.formatMetric(metric, v);
    const chartHtml = chartMode === 'bar' ? C.bars(base.labels, series, { height: 280, format: fmtV })
      : chartMode === 'stacked' ? C.bars(base.labels, series, { height: 280, stacked: true, format: fmtV })
      : C.line(base.labels, series, { height: 280, area: chartMode === 'area', format: fmtV });

    const chartCard = B.card(store.metricLabel(metric) + ' by platform', chartHtml, { tools: metricPicker });

    /* Radar — each platform scored against the best performer on each axis. */
    const axes = ['Reach', 'Engagements', 'Saves', 'Clicks', 'Comments', 'Followers'];
    const axisKeys = ['reach', 'engagements', 'saves', 'link_clicks', 'comments', 'followers_gained'];
    const perPf = pfIds.map((id) => all.filter((r) => r.platform === id));
    const peaks = axisKeys.map((k) => Math.max(1, ...perPf.map((list) => S.rollup(list, k))));
    const radar = B.card('Where each platform earns its place',
      C.radar(axes, pfIds.map((id, i) => ({
        name: S.platform(id).name, color: B.platformColor(id),
        values: axisKeys.map((k, ai) => S.rollup(perPf[i], k) / peaks[ai])
      })), { size: 300 }));

    /* Media type split */
    const byMedia = S.MEDIA_TYPES.map((m) => ({
      label: m, value: S.rollup(all.filter((r) => r.media_type === m), 'engagement_rate'),
      count: all.filter((r) => r.media_type === m).length
    })).filter((x) => x.count);
    const mediaCard = B.card('Engagement rate by media type',
      C.hbars(byMedia.sort((a, b) => b.value - a.value).map((x) => ({
        label: x.label + '  (' + x.count + ')', value: x.value
      })), { format: (v) => U.fmt.pct(v, 1) }));

    /* Table */
    const rowsSorted = sorted(all);
    const pages = Math.max(1, Math.ceil(rowsSorted.length / PER));
    if (page >= pages) page = pages - 1;
    const slice = rowsSorted.slice(page * PER, page * PER + PER);

    const table = B.card('All posts',
      '<div class="table-wrap"><table class="table"><thead><tr>' +
      COLUMNS.map((c) => '<th class="sortable' + (c.num ? ' n' : '') + '" data-sort="' + c.key + '">' + esc(c.label) +
        (sortKey === c.key ? '<span class="sort-arrow">' + (sortDir === 1 ? '↑' : '↓') + '</span>' : '') + '</th>').join('') +
      '</tr></thead><tbody>' +
      (slice.length ? slice.map((r) => '<tr data-id="' + r.id + '" style="cursor:pointer">' +
        COLUMNS.map((c) => '<td' + (c.num ? ' class="n"' : '') + '>' +
          (c.cell ? c.cell(r) : (c.fmt ? c.fmt(S.metricValue(r, c.key)) : U.fmt.int(S.metricValue(r, c.key)))) +
          '</td>').join('') + '</tr>').join('')
        : '<tr><td colspan="' + COLUMNS.length + '">' + BAUGMENT.ui.empty('No posts match these filters', 'Clear a filter or widen the date range.') + '</td></tr>') +
      '</tbody></table></div>' +
      '<div class="pager"><span>' + (rowsSorted.length ? (page * PER + 1) + '–' + Math.min(rowsSorted.length, page * PER + PER) : 0) +
        ' of ' + U.fmt.int(rowsSorted.length) + '</span><div class="spacer"></div>' +
        '<button class="btn btn--sm" id="prevPage"' + (page === 0 ? ' disabled' : '') + '>Previous</button>' +
        '<span class="mono">' + (page + 1) + ' / ' + pages + '</span>' +
        '<button class="btn btn--sm" id="nextPage"' + (page >= pages - 1 ? ' disabled' : '') + '>Next</button></div>',
      { flush: true });

    el.innerHTML = headline + chartCard +
      '<div class="grid-2" style="margin:16px 0">' + radar + mediaCard + '</div>' + table;

    /* Wiring */
    el.querySelector('#metricPick').addEventListener('change', (e) => { metric = e.target.value; render(el); });
    el.querySelectorAll('#chartMode button').forEach((b) => b.addEventListener('click', () => {
      chartMode = b.getAttribute('data-mode'); render(el);
    }));
    el.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
      const k = th.getAttribute('data-sort');
      if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = -1; }
      page = 0; render(el);
    }));
    el.querySelectorAll('tbody tr[data-id]').forEach((tr) => tr.addEventListener('click', () => {
      const r = store.state().analytics.find((x) => x.id === tr.getAttribute('data-id'));
      if (r) detail(r);
    }));
    const pp = el.querySelector('#prevPage'), np = el.querySelector('#nextPage');
    if (pp) pp.addEventListener('click', () => { page = Math.max(0, page - 1); render(el); });
    if (np) np.addEventListener('click', () => { page = page + 1; render(el); });
    BAUGMENT.charts.bind(el);
  }

  return {
    title: 'Analytics',
    eyebrow: 'Post-level performance',
    lede: 'Every published post with its full metric set. Click any row for the detail.',
    filters: true,
    actions: () =>
      '<button class="btn" id="jumpExport">' + BAUGMENT.icon.render('download', 15) + ' Export this view</button>' +
      '<button class="btn btn--primary" id="addPost">' + BAUGMENT.icon.render('plus', 15) + ' Add post</button>',
    wireActions(root) {
      root.querySelector('#jumpExport').addEventListener('click', () => BAUGMENT.app.go('export'));
      root.querySelector('#addPost').addEventListener('click', () =>
        editPost(blankPost(), () => BAUGMENT.app.render()));
    },
    edit: editPost,
    blank: blankPost,
    render
  };
})();


/* ========================================================================== */
/* Reports                                                                    */
/* ========================================================================== */

BAUGMENT.views.reports = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const B = BAUGMENT.bits;
  const store = BAUGMENT.store;
  const C = BAUGMENT.charts;
  const esc = U.esc;

  let period = 'month';
  let anchor = null;      /* ISO date inside the reported period */

  function windowFor(kind, date) {
    const d = date ? U.parse(date) : new Date();
    d.setHours(0, 0, 0, 0);
    if (kind === 'week') {
      const s = U.startOfWeek(d);
      return { from: U.iso(s), to: U.iso(U.addDays(s, 6)), label: 'Week of ' + U.fmt.date(U.iso(s), 'long') };
    }
    if (kind === 'quarter') {
      const q = U.quarterOf(d);
      const s = new Date(d.getFullYear(), (q - 1) * 3, 1);
      return { from: U.iso(s), to: U.iso(new Date(d.getFullYear(), q * 3, 0)), label: 'Q' + q + ' ' + d.getFullYear() };
    }
    if (kind === 'year') {
      return { from: U.iso(new Date(d.getFullYear(), 0, 1)), to: U.iso(new Date(d.getFullYear(), 11, 31)), label: String(d.getFullYear()) };
    }
    return { from: U.iso(U.startOfMonth(d)), to: U.iso(U.endOfMonth(d)),
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
  }

  function shiftAnchor(kind, date, dir) {
    const d = date ? U.parse(date) : new Date();
    if (kind === 'week') return U.iso(U.addDays(d, 7 * dir));
    if (kind === 'quarter') return U.iso(new Date(d.getFullYear(), d.getMonth() + 3 * dir, 1));
    if (kind === 'year') return U.iso(new Date(d.getFullYear() + dir, d.getMonth(), 1));
    return U.iso(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  }

  function inWindow(w) {
    return store.state().analytics.filter((r) => r.published_date >= w.from && r.published_date <= w.to);
  }

  function priorWindow(kind, w) {
    const from = U.parse(w.from);
    return windowFor(kind, shiftAnchor(kind, U.iso(from), -1));
  }

  function narrative(t, p, best, rows) {
    const parts = [];
    const d = store.delta(t.reach, p.reach);
    if (rows.length === 0) return 'Nothing was published in this period.';
    parts.push(rows.length + (rows.length === 1 ? ' post' : ' posts') + ' reached ' + U.fmt.compact(t.reach) +
      ' accounts and earned ' + U.fmt.compact(t.engagements) + ' engagements, an engagement rate of ' + U.fmt.pct(t.engagement_rate) + '.');
    if (d != null && p.reach) {
      parts.push('Reach ' + (d >= 0 ? 'rose' : 'fell') + ' ' + Math.abs(d).toFixed(1) + '% against the period before.');
    }
    if (best) parts.push(S.platform(best.id).name + ' led on engagement rate at ' + U.fmt.pct(best.er) + ' across ' + best.posts + ' posts.');
    parts.push('Net follower change was ' + (t.net_followers >= 0 ? '+' : '') + U.fmt.int(t.net_followers) + '.');
    return parts.join(' ');
  }

  function render(el) {
    const w = windowFor(period, anchor);
    const rows = inWindow(w);
    const pw = priorWindow(period, w);
    const prevRows = inWindow(pw);
    const t = store.totals(rows);
    const p = store.totals(prevRows);
    const db = store.state();

    const byPlatform = U.groupBy(rows, (r) => r.platform);
    let best = null;
    byPlatform.forEach((list, id) => {
      if (list.length < 2) return;
      const er = S.rollup(list, 'engagement_rate');
      if (!best || er > best.er) best = { id, er, posts: list.length };
    });

    const grain = period === 'week' ? 'day' : period === 'month' ? 'day' : period === 'quarter' ? 'week' : 'month';
    const reach = store.series(rows, 'reach', grain);
    const eng = store.series(rows, 'engagements', grain);

    const nav = '<div class="row no-print" style="margin-bottom:18px">' +
      '<div class="segmented" id="periodPick">' +
      [['week', 'Weekly'], ['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly']].map((x) =>
        '<button data-period="' + x[0] + '" aria-pressed="' + (period === x[0]) + '">' + x[1] + '</button>').join('') + '</div>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn--icon btn--sm" id="periodPrev" aria-label="Previous period">' + BAUGMENT.icon.render('chevronL', 15) + '</button>' +
      '<span class="chip mono" style="height:29px">' + esc(w.label) + '</span>' +
      '<button class="btn btn--icon btn--sm" id="periodNext" aria-label="Next period">' + BAUGMENT.icon.render('chevronR', 15) + '</button>' +
      '</div>';

    const summary = B.card('Summary',
      '<p style="line-height:1.7;font-size:var(--step-1);max-width:70ch">' + esc(narrative(t, p, best, rows)) + '</p>' +
      '<div class="mono mute tiny" style="margin-top:14px">' + esc(w.from) + ' → ' + esc(w.to) +
      ' · compared against ' + esc(pw.from) + ' → ' + esc(pw.to) + '</div>');

    const kpis = '<div class="kpis">' +
      B.kpi('Posts', U.fmt.int(t.posts), { foot: BAUGMENT.ui.delta(store.delta(t.posts, p.posts)) }) +
      B.kpi('Reach', U.fmt.compact(t.reach), { foot: BAUGMENT.ui.delta(store.delta(t.reach, p.reach)) }) +
      B.kpi('Impressions', U.fmt.compact(t.impressions), { foot: BAUGMENT.ui.delta(store.delta(t.impressions, p.impressions)) }) +
      B.kpi('Engagements', U.fmt.compact(t.engagements), { foot: BAUGMENT.ui.delta(store.delta(t.engagements, p.engagements)) }) +
      B.kpi('Engagement rate', U.fmt.pct(t.engagement_rate), { foot: BAUGMENT.ui.delta(store.delta(t.engagement_rate, p.engagement_rate)) }) +
      B.kpi('Link clicks', U.fmt.compact(t.link_clicks), { foot: BAUGMENT.ui.delta(store.delta(t.link_clicks, p.link_clicks)) }) +
      B.kpi('Saves', U.fmt.compact(t.saves), { foot: BAUGMENT.ui.delta(store.delta(t.saves, p.saves)) }) +
      B.kpi('Net followers', U.fmt.int(t.net_followers), { foot: BAUGMENT.ui.delta(store.delta(t.net_followers, p.net_followers)) }) +
      '</div>';

    const trend = B.card('Reach and engagement',
      C.line(reach.labels, [
        { name: 'Reach', values: reach.values, color: 'var(--accent)' },
        { name: 'Engagements', values: eng.values, color: 'var(--gold)' }
      ], { area: true, height: 250 }));

    const pfIds = store.livePlatforms().map((x) => x.id);
    const platformTable = B.card('Platform breakdown',
      '<div class="table-wrap"><table class="table"><thead><tr><th>Platform</th><th class="n">Posts</th><th class="n">Reach</th>' +
      '<th class="n">Engagements</th><th class="n">Eng. rate</th><th class="n">Clicks</th><th class="n">Net followers</th></tr></thead><tbody>' +
      pfIds.map((id) => {
        const list = byPlatform.get(id) || [];
        return '<tr><td>' + B.platformChip(id) + '</td><td class="n">' + list.length + '</td>' +
          '<td class="n">' + U.fmt.compact(S.rollup(list, 'reach')) + '</td>' +
          '<td class="n">' + U.fmt.compact(S.rollup(list, 'engagements')) + '</td>' +
          '<td class="n">' + U.fmt.pct(S.rollup(list, 'engagement_rate'), 1) + '</td>' +
          '<td class="n">' + U.fmt.int(S.rollup(list, 'link_clicks')) + '</td>' +
          '<td class="n">' + U.fmt.int(S.rollup(list, 'net_followers')) + '</td></tr>';
      }).join('') + '</tbody></table></div>', { flush: true });

    const pillarRows = db.pillars.map((pl) => {
      const list = rows.filter((r) => r.pillar_id === pl.id);
      return { pl, list, reach: S.rollup(list, 'reach'), er: S.rollup(list, 'engagement_rate') };
    }).filter((x) => x.list.length).sort((a, b) => b.reach - a.reach);

    const pillarCard = B.card('Content pillars',
      C.hbars(pillarRows.slice(0, 10).map((x) => ({
        label: x.pl.name + '  (' + x.list.length + ')', value: x.reach, color: x.pl.color
      })), { format: U.fmt.compact }));

    const topTen = rows.slice().sort((a, b) => S.engagements(b) - S.engagements(a)).slice(0, 10);
    const topCard = B.card('Top ten posts',
      '<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Platform</th><th>Caption</th>' +
      '<th class="n">Reach</th><th class="n">Eng.</th><th class="n">Rate</th></tr></thead><tbody>' +
      (topTen.length ? topTen.map((r, i) => '<tr><td class="mono mute">' + U.pad(i + 1) + '</td>' +
        '<td>' + B.platformChip(r.platform, false) + '</td>' +
        '<td class="clamp" title="' + esc(r.caption) + '">' + esc(r.caption) + '</td>' +
        '<td class="n">' + U.fmt.compact(r.reach || r.views) + '</td>' +
        '<td class="n">' + U.fmt.compact(S.engagements(r)) + '</td>' +
        '<td class="n">' + U.fmt.pct(S.engagementRate(r), 1) + '</td></tr>').join('')
        : '<tr><td colspan="6" class="mute" style="text-align:center;padding:24px">Nothing published in this period.</td></tr>') +
      '</tbody></table></div>', { flush: true });

    const campaignsInWindow = db.campaigns.filter((c) => c.start <= w.to && c.end >= w.from);
    const campaignCard = B.card('Campaigns running in this period',
      campaignsInWindow.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>Campaign</th><th>Objective</th><th>Status</th>' +
          '<th class="n">Posts</th><th class="n">Target</th><th class="n">Actual</th><th class="n">Attainment</th></tr></thead><tbody>' +
          campaignsInWindow.map((c) => {
            const list = rows.filter((r) => r.campaign_id === c.id);
            const actual = S.rollup(list, c.kpi_metric);
            const pctv = c.kpi_target ? (actual / c.kpi_target) * 100 : 0;
            return '<tr><td>' + esc(c.name) + '</td><td class="mute">' + esc(c.objective) + '</td>' +
              '<td>' + B.statusChip(c.status) + '</td><td class="n">' + list.length + '</td>' +
              '<td class="n">' + U.fmt.compact(c.kpi_target) + '</td><td class="n">' + U.fmt.compact(actual) + '</td>' +
              '<td class="n" style="color:' + (pctv >= 100 ? 'var(--accent)' : pctv >= 60 ? 'var(--gold)' : 'var(--rose)') + '">' +
              pctv.toFixed(0) + '%</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<p class="mute tiny">No campaigns overlapped this period.</p>', { flush: campaignsInWindow.length > 0 });

    el.innerHTML = nav + summary +
      '<div style="height:16px"></div>' + kpis + trend +
      '<div class="grid-2" style="margin:16px 0">' + platformTable + pillarCard + '</div>' +
      topCard + '<div style="height:16px"></div>' + campaignCard;

    el.querySelectorAll('#periodPick button').forEach((b) => b.addEventListener('click', () => {
      period = b.getAttribute('data-period'); render(el);
    }));
    el.querySelector('#periodPrev').addEventListener('click', () => { anchor = shiftAnchor(period, anchor, -1); render(el); });
    el.querySelector('#periodNext').addEventListener('click', () => { anchor = shiftAnchor(period, anchor, 1); render(el); });
    BAUGMENT.charts.bind(el);

    /* Expose the current window so the toolbar buttons can act on it. */
    BAUGMENT.views.reports._window = w;
    BAUGMENT.views.reports._rows = rows;
  }

  function exportCurrent(kind) {
    const w = BAUGMENT.views.reports._window;
    const rows = BAUGMENT.views.reports._rows || [];
    const name = 'baugment-report-' + U.slug(w.label);
    if (kind === 'csv') BAUGMENT.exporter.toCSV(rows, name);
    if (kind === 'json') BAUGMENT.exporter.toJSON(rows, name, { period: w.label, from: w.from, to: w.to });
    if (kind === 'xlsx') BAUGMENT.exporter.toXLSX(rows, name);
  }

  return {
    title: 'Reports',
    eyebrow: 'Periodic review',
    lede: 'A fixed-period report you can step through, print, or hand to someone who wasn\'t in the room.',
    filters: false,
    actions: () =>
      '<button class="btn" id="repCsv">' + BAUGMENT.icon.render('download', 15) + ' CSV</button>' +
      '<button class="btn" id="repXlsx">' + BAUGMENT.icon.render('download', 15) + ' Excel</button>' +
      '<button class="btn btn--primary" id="repPrint">' + BAUGMENT.icon.render('print', 15) + ' Print / PDF</button>',
    wireActions(root) {
      root.querySelector('#repCsv').addEventListener('click', () => exportCurrent('csv'));
      root.querySelector('#repXlsx').addEventListener('click', () => exportCurrent('xlsx'));
      root.querySelector('#repPrint').addEventListener('click', () => window.print());
    },
    render
  };
})();
