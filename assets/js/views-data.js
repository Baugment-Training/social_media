/* BAUGMENT — data views: Import, Export, Settings
   Plus the CSV parser and the exporter both of them depend on. */

/* ========================================================================== */
/* Parsing                                                                    */
/* ========================================================================== */

BAUGMENT.parse = (function () {

  /* RFC-4180-ish: quoted fields, escaped quotes, CR/LF inside quotes. */
  function csv(text, delimiter) {
    const d = delimiter || sniffDelimiter(text);
    const rows = [];
    let row = [], field = '', inQuotes = false;

    /* Strip a UTF-8 BOM — Excel writes one and it poisons the first header. */
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
        continue;
      }
      if (c === '"') { inQuotes = true; continue; }
      if (c === d) { row.push(field); field = ''; continue; }
      if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        continue;
      }
      field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return { headers: [], records: [], delimiter: d };

    const headers = rows[0].map((h, i) => (h || '').trim() || 'Column ' + (i + 1));
    const records = rows.slice(1)
      .filter((r) => r.some((c) => String(c).trim() !== ''))
      .map((r) => {
        const o = {};
        headers.forEach((h, i) => { o[h] = r[i] == null ? '' : String(r[i]).trim(); });
        return o;
      });
    return { headers, records, delimiter: d };
  }

  function sniffDelimiter(text) {
    const line = text.split(/\r?\n/)[0] || '';
    const counts = [[',', 0], [';', 0], ['\t', 0], ['|', 0]];
    let inQ = false;
    for (const c of line) {
      if (c === '"') inQ = !inQ;
      if (inQ) continue;
      const hit = counts.find((x) => x[0] === c);
      if (hit) hit[1]++;
    }
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] ? counts[0][0] : ',';
  }

  /* SheetJS is only fetched when someone actually drops a workbook, so a CSV
     workflow stays fully offline. */
  let sheetJsPromise = null;
  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (sheetJsPromise) return sheetJsPromise;
    sheetJsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => reject(new Error('offline'));
      document.head.appendChild(s);
    });
    return sheetJsPromise;
  }

  async function xlsx(arrayBuffer) {
    const XLSX = await loadSheetJS();
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
    if (!grid.length) return { headers: [], records: [], sheets: wb.SheetNames };
    const headers = grid[0].map((h, i) => String(h || '').trim() || 'Column ' + (i + 1));
    const records = grid.slice(1)
      .filter((r) => r.some((c) => String(c).trim() !== ''))
      .map((r) => {
        const o = {};
        headers.forEach((h, i) => {
          const v = r[i];
          o[h] = v instanceof Date ? BAUGMENT.util.iso(v) : (v == null ? '' : v);
        });
        return o;
      });
    return { headers, records, sheets: wb.SheetNames };
  }

  function readFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('That file couldn\'t be read.'));
      if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') {
        reader.onload = () => xlsx(reader.result).then((r) => resolve(Object.assign({ format: 'xlsx' }, r))).catch(reject);
        reader.readAsArrayBuffer(file);
      } else if (ext === 'json') {
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            const records = Array.isArray(data) ? data : (data.records || data.rows || data.data || []);
            const headers = records.length ? Object.keys(records[0]) : [];
            resolve({ format: 'json', headers, records });
          } catch (e) { reject(new Error('That JSON couldn\'t be parsed.')); }
        };
        reader.readAsText(file);
      } else {
        reader.onload = () => resolve(Object.assign({ format: 'csv' }, csv(reader.result)));
        reader.readAsText(file);
      }
    });
  }

  return { csv, xlsx, readFile, loadSheetJS, sniffDelimiter };
})();


/* ========================================================================== */
/* Export                                                                     */
/* ========================================================================== */

BAUGMENT.exporter = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const store = BAUGMENT.store;

  function columns(includeDerived) {
    const base = ['published_date', 'published_time', 'platform', 'account', 'post_id', 'post_url', 'caption',
      'media_type', 'content_type', 'status', 'author'];
    const metrics = ['impressions', 'reach', 'views', 'video_views', 'watch_time', 'avg_watch_time',
      'likes', 'comments', 'shares', 'saves', 'reactions', 'replies', 'bookmarks',
      'link_clicks', 'profile_visits', 'followers_gained', 'followers_lost'];
    const derived = ['engagements', 'engagement_rate', 'ctr', 'net_followers'];
    const tail = ['utm_source', 'utm_medium', 'utm_campaign', 'hashtags', 'mentions', 'location', 'notes'];
    const custom = store.state().customMetrics.map((m) => m.key);
    return base.concat(['pillar', 'campaign'], metrics, includeDerived === false ? [] : derived, custom, tail);
  }

  const HEADER_LABEL = {
    published_date: 'Published Date', published_time: 'Published Time', platform: 'Platform',
    account: 'Social Account', post_id: 'Post ID', post_url: 'Post URL', caption: 'Caption',
    media_type: 'Media Type', content_type: 'Content Type', status: 'Status', author: 'Author',
    pillar: 'Content Pillar', campaign: 'Campaign', engagement_rate: 'Engagement Rate', ctr: 'CTR',
    net_followers: 'Net Followers', utm_source: 'UTM Source', utm_medium: 'UTM Medium',
    utm_campaign: 'UTM Campaign', hashtags: 'Hashtags', mentions: 'Mentions', location: 'Location', notes: 'Notes'
  };

  function header(key) {
    if (HEADER_LABEL[key]) return HEADER_LABEL[key];
    const m = store.allMetrics().find((x) => x.key === key);
    if (m) return m.label;
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function value(r, key) {
    if (key === 'pillar') return store.pillarName(r.pillar_id);
    if (key === 'campaign') return r.campaign_id ? store.campaignName(r.campaign_id) : '';
    if (key === 'engagement_rate') return S.engagementRate(r).toFixed(4);
    if (key === 'ctr') return S.ctr(r).toFixed(4);
    if (key === 'engagements') return S.engagements(r);
    if (key === 'net_followers') return S.netFollowers(r);
    if (r.custom && r.custom[key] != null) return r.custom[key];
    return r[key] == null ? '' : r[key];
  }

  function toMatrix(rows, opts) {
    opts = opts || {};
    const cols = opts.columns || columns(store.state().settings.exportIncludeDerived);
    return {
      cols,
      head: cols.map(header),
      body: rows.map((r) => cols.map((c) => value(r, c)))
    };
  }

  function csvCell(v, d) {
    const s = v == null ? '' : String(v);
    return /["\n\r]|^\s|\s$/.test(s) || s.indexOf(d) !== -1 ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(rows, filename, opts) {
    const d = (opts && opts.delimiter) || store.state().settings.exportDelimiter || ',';
    const m = toMatrix(rows, opts);
    const lines = [m.head.map((h) => csvCell(h, d)).join(d)]
      .concat(m.body.map((r) => r.map((c) => csvCell(c, d)).join(d)));
    /* BOM so Excel opens Indonesian and accented characters correctly. */
    U.download((filename || 'baugment-analytics') + '.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    BAUGMENT.ui.toast('CSV downloaded', rows.length + ' rows');
  }

  function toJSON(rows, filename, meta) {
    const payload = {
      exported_at: new Date().toISOString(),
      source: 'BAUGMENT — Baugment',
      meta: meta || null,
      count: rows.length,
      records: rows.map((r) => {
        const o = {};
        columns(true).forEach((c) => { o[c] = value(r, c); });
        return o;
      })
    };
    U.download((filename || 'baugment-analytics') + '.json', JSON.stringify(payload, null, 2), 'application/json');
    BAUGMENT.ui.toast('JSON downloaded', rows.length + ' rows');
  }

  async function toXLSX(rows, filename, opts) {
    try {
      const XLSX = await BAUGMENT.parse.loadSheetJS();
      const m = toMatrix(rows, opts);
      const ws = XLSX.utils.aoa_to_sheet([m.head].concat(m.body));
      ws['!cols'] = m.head.map((h) => ({ wch: Math.min(42, Math.max(11, h.length + 3)) }));
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Analytics');
      XLSX.writeFile(wb, (filename || 'baugment-analytics') + '.xlsx');
      BAUGMENT.ui.toast('Excel downloaded', rows.length + ' rows');
    } catch (e) {
      BAUGMENT.ui.toast('Excel export needs a connection', 'The spreadsheet writer loads from a CDN. Downloading CSV instead.', 'warn');
      toCSV(rows, filename, opts);
    }
  }

  return { toCSV, toJSON, toXLSX, columns, header, value, toMatrix };
})();


/* ========================================================================== */
/* Import                                                                     */
/* ========================================================================== */

BAUGMENT.views.import = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const B = BAUGMENT.bits;
  const B2 = BAUGMENT.buffer;
  const store = BAUGMENT.store;
  const esc = U.esc;

  /* Working state for the current file, cleared when the view is re-entered
     from the nav. */
  let staged = null;   /* { file, headers, records, map, format } */
  let strategy = 'skip';
  let errors = [];

  function reset() { staged = null; errors = []; }

  function stageFile(file) {
    const el = document.getElementById('content');
    if (!el) return;
    el.innerHTML =
      '<div class="card"><div class="card__body">' +
      '<div class="row" style="margin-bottom:14px">' + BAUGMENT.icon.render('file', 16) +
      '<span style="font-weight:600">' + esc(file.name) + '</span>' +
      '<span class="spacer"></span><span class="mono mute tiny">Reading ' +
      (file.size > 1048576 ? (file.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(file.size / 1024)) + ' KB') +
      '…</span></div>' +
      BAUGMENT.ui.skeleton(4) + '</div></div>';

    return BAUGMENT.parse.readFile(file).then((parsed) => {
      if (!parsed.records.length) {
        BAUGMENT.ui.toast('Nothing to import', 'That file has headers but no data rows.', 'warn');
        reset(); render(el);
        return;
      }
      const customKeys = store.state().customMetrics.map((m) => B2.norm(m.label));
      staged = {
        file, format: parsed.format,
        headers: parsed.headers,
        records: parsed.records,
        map: B2.autoMap(parsed.headers, customKeys)
      };
      const mapped = Object.values(staged.map).filter(Boolean).length;
      BAUGMENT.ui.toast('File read', mapped + ' of ' + parsed.headers.length + ' columns matched automatically');
      render(el);
    }).catch((err) => {
      if (err && err.message === 'offline') {
        BAUGMENT.ui.toast('Excel reader unavailable', 'The .xlsx reader loads from a CDN and this browser can\'t reach it. Export the sheet as CSV and drop that instead.', 'error', 9000);
      } else {
        BAUGMENT.ui.toast('Couldn\'t read that file', err.message || 'Try CSV, XLSX or JSON.', 'error');
      }
      reset(); render(el);
    });
  }

  /* Turn one staged row into an analytics record, collecting problems. */
  function buildRecord(raw, index) {
    const rec = {
      id: U.uid('ana'), platform: '', account: '', post_id: '', post_url: '', caption: '',
      media_type: 'Image', content_type: 'Organic', status: 'published',
      published_date: '', published_time: '12:00',
      pillar_id: null, campaign_id: null, author: '',
      impressions: 0, reach: 0, views: 0, video_views: 0, watch_time: 0, avg_watch_time: 0,
      likes: 0, comments: 0, shares: 0, saves: 0, reactions: 0, replies: 0, bookmarks: 0,
      link_clicks: 0, profile_visits: 0, followers_gained: 0, followers_lost: 0,
      utm_source: '', utm_medium: '', utm_campaign: '', hashtags: '', mentions: '',
      location: '', notes: '', custom: {}, source: 'import', imported_at: new Date().toISOString()
    };
    const problems = [];
    let pillarName = '', campaignName = '';

    Object.keys(staged.map).forEach((header) => {
      const target = staged.map[header];
      if (!target) return;
      const raw_v = raw[header];
      if (target.indexOf('custom:') === 0) {
        rec.custom[target.slice(7)] = B2.parseNumber(raw_v);
        return;
      }
      const def = B2.TARGETS.find((t) => t.key === target);
      if (!def) return;
      if (def.kind === 'number') {
        const n = B2.parseNumber(raw_v);
        if (raw_v !== '' && raw_v != null && n == null) problems.push(def.label + ' isn\'t a number ("' + raw_v + '")');
        rec[target] = n == null ? 0 : n;
      } else if (def.kind === 'date') {
        const d = B2.parseDate(raw_v);
        if (!d) problems.push('Published Date couldn\'t be read from "' + raw_v + '"');
        else rec.published_date = d;
        const t = B2.parseTime(raw_v);
        if (t) rec.published_time = t;
      } else if (def.kind === 'time') {
        const t = B2.parseTime(raw_v);
        if (t) rec.published_time = t;
      } else if (target === 'platform') {
        const p = B2.normalisePlatform(raw_v);
        if (!p) problems.push('Platform is empty');
        else if (!S.PLATFORMS.some((x) => x.id === p)) problems.push('Unknown platform "' + raw_v + '"');
        rec.platform = p;
      } else if (target === 'pillar') { pillarName = String(raw_v || '').trim(); }
      else if (target === 'campaign') { campaignName = String(raw_v || '').trim(); }
      else { rec[target] = raw_v == null ? '' : String(raw_v).trim(); }
    });

    /* Resolve pillar and campaign by name; create the campaign if it's new,
       because Buffer tags routinely arrive before anyone sets one up here. */
    if (pillarName) {
      const p = store.state().pillars.find((x) => x.name.toLowerCase() === pillarName.toLowerCase());
      if (p) rec.pillar_id = p.id;
      else problems.push('No pillar named "' + pillarName + '" — left unassigned');
    }
    if (campaignName) {
      let c = store.state().campaigns.find((x) => x.name.toLowerCase() === campaignName.toLowerCase());
      if (!c) {
        c = {
          id: U.uid('cmp'), name: campaignName, objective: 'Awareness',
          start: rec.published_date || U.iso(new Date()), end: rec.published_date || U.iso(new Date()),
          budget: null, platforms: rec.platform ? [rec.platform] : ['instagram'],
          kpi_metric: 'reach', kpi_target: 0, status: 'completed', owner: '', notes: 'Created during import'
        };
        store.upsert('campaigns', c);
      }
      rec.campaign_id = c.id;
    }

    if (!rec.published_date) problems.push('Row skipped: no usable date');
    if (!rec.platform) problems.push('Row skipped: no platform');
    if (!rec.account) rec.account = rec.platform ? '@baugmentinstitute' : '';
    if (!rec.location) rec.location = 'Baugment, Graha Mampang Lt.3, Jakarta Selatan';

    return { rec, problems, fatal: !rec.published_date || !rec.platform, index };
  }

  function runImport() {
    const el = document.getElementById('content');
    if (!staged || !el) return;
    const bar = el.querySelector('#importProgress');
    const fill = el.querySelector('#importProgressFill');
    const note = el.querySelector('#importProgressNote');
    /* The progress readout is cosmetic — never let a missing node stop a run. */
    const setProgress = (pct, text) => {
      if (fill) fill.style.width = pct + '%';
      if (note) note.textContent = text;
    };
    if (bar) bar.style.display = 'block';

    const existing = store.fingerprintIndex();
    const seenInFile = new Set();
    const accepted = [];
    const replaced = [];
    errors = [];
    let skipped = 0, i = 0;
    const total = staged.records.length;
    const CHUNK = 60;

    function step() {
      const end = Math.min(total, i + CHUNK);
      for (; i < end; i++) {
        const built = buildRecord(staged.records[i], i + 2);   /* +2 = header row + 1-based */
        if (built.problems.length) {
          errors.push({ row: built.index, problems: built.problems.slice(), fatal: built.fatal });
        }
        if (built.fatal) { skipped++; continue; }

        const fp = store.fingerprint(built.rec);
        const isDupe = existing.has(fp) || seenInFile.has(fp);
        if (isDupe) {
          if (strategy === 'skip') { skipped++; continue; }
          if (strategy === 'replace') {
            const targetId = existing.get(fp);
            if (targetId) replaced.push({ id: targetId, rec: built.rec });
            else accepted.push(built.rec);
            seenInFile.add(fp);
            continue;
          }
          /* append: keep both copies */
        }
        seenInFile.add(fp);
        accepted.push(built.rec);
      }

      setProgress(Math.round((i / total) * 100), i + ' of ' + total + ' rows processed');

      if (i < total) { setTimeout(step, 0); return; }

      replaced.forEach((r) => store.replaceAnalytics(r.id, r.rec));
      if (accepted.length) store.addAnalytics(accepted);
      else store.commit();

      store.logImport({
        id: U.uid('imp'), at: new Date().toISOString(),
        file: staged.file.name, format: staged.format,
        total, added: accepted.length, replaced: replaced.length, skipped,
        warnings: errors.length, strategy
      });

      BAUGMENT.ui.toast('Import finished',
        accepted.length + ' added · ' + replaced.length + ' replaced · ' + skipped + ' skipped', 'success', 6000);

      /* `errors` stays populated so the warning card renders in this pass. */
      staged = null;
      render(el);
    }

    setTimeout(step, 60);
  }

  function downloadErrorLog() {
    const lines = ['row,severity,problem'];
    errors.forEach((e) => e.problems.forEach((p) =>
      lines.push([e.row, e.fatal ? 'skipped' : 'warning', '"' + String(p).replace(/"/g, '""') + '"'].join(','))));
    U.download('baugment-import-errors-' + U.iso(new Date()) + '.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  function sampleTemplate() {
    const cols = ['Date', 'Channel', 'Service', 'Post URL', 'Text', 'Type', 'Impressions', 'Reach',
      'Engagements', 'Likes', 'Comments', 'Shares', 'Saves', 'Clicks', 'Video Views', 'Campaign', 'Content Pillar'];
    const rows = [
      ['2026-07-18', 'baugment', 'LinkedIn', 'https://linkedin.com/feed/update/example1', 'Why completion rate is a vanity metric.', 'Carousel', '24800', '19400', '1420', '0', '96', '118', '0', '620', '0', 'LinkedIn Thought Leadership', 'Measurement'],
      ['2026-07-19', '@baugmentinstitute', 'Instagram', 'https://instagram.com/p/example2', 'Storyboarding a module in 60 seconds.', 'Reel', '18100', '15600', '940', '760', '58', '64', '148', '190', '16200', 'Storyboarding Shorts', 'Instructional Design'],
      ['2026-07-20', '@baugment', 'YouTube', 'https://youtube.com/watch?v=example3', 'Building a learning analytics dashboard from scratch.', 'Video', '9400', '7800', '520', '410', '38', '26', '0', '210', '7600', '', 'Measurement']
    ];
    const body = [cols.join(',')].concat(rows.map((r) => r.map((c) => (c.indexOf(',') !== -1 ? '"' + c + '"' : c)).join(','))).join('\r\n');
    U.download('baugment-import-template.csv', '\uFEFF' + body, 'text/csv;charset=utf-8');
    BAUGMENT.ui.toast('Template downloaded', 'Buffer-style headers, three example rows');
  }

  function mappingUI() {
    const customMetrics = store.state().customMetrics;
    const options = (selected) =>
      '<option value="">Ignore this column</option>' +
      B2.TARGETS.map((t) => '<option value="' + t.key + '"' + (selected === t.key ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') +
      (customMetrics.length ? '<optgroup label="Custom metrics">' + customMetrics.map((m) =>
        '<option value="custom:' + esc(B2.norm(m.label)) + '"' + (selected === 'custom:' + B2.norm(m.label) ? ' selected' : '') + '>' +
        esc(m.label) + '</option>').join('') + '</optgroup>' : '');

    return staged.headers.map((h) => {
      const sample = staged.records.slice(0, 3).map((r) => r[h]).filter((v) => v !== '' && v != null)[0];
      return '<div class="maprow">' +
        '<div><div class="maprow__src">' + esc(h) + '</div>' +
        '<div class="tiny mute" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        (sample == null || sample === '' ? 'no sample value' : esc(String(sample).slice(0, 48))) + '</div></div>' +
        '<div class="maprow__arrow">→</div>' +
        '<select class="select" data-map="' + esc(h) + '">' + options(staged.map[h]) + '</select>' +
        '</div>';
    }).join('');
  }

  function previewTable() {
    const cols = staged.headers.slice(0, 9);
    return '<div class="table-wrap"><table class="table"><thead><tr>' +
      cols.map((c) => '<th>' + esc(c) + (staged.map[c] ? '' : ' <span class="mute">·ignored</span>') + '</th>').join('') +
      (staged.headers.length > 9 ? '<th class="mute">+' + (staged.headers.length - 9) + ' more</th>' : '') +
      '</tr></thead><tbody>' +
      staged.records.slice(0, 6).map((r) => '<tr>' + cols.map((c) =>
        '<td class="clamp" style="max-width:180px">' + esc(String(r[c] == null ? '' : r[c])) + '</td>').join('') +
        (staged.headers.length > 9 ? '<td class="mute">…</td>' : '') + '</tr>').join('') +
      '</tbody></table></div>';
  }

  function render(el) {
    const db = store.state();
    const mappedCount = staged ? Object.values(staged.map).filter(Boolean).length : 0;
    const hasDate = staged ? Object.values(staged.map).indexOf('published_date') !== -1 : false;
    const hasPlatform = staged ? Object.values(staged.map).indexOf('platform') !== -1 : false;

    const zone = staged ? '' :
      '<div class="dropzone" id="dropzone">' +
        '<div class="dropzone__icon">' + BAUGMENT.icon.render('upload', 38) + '</div>' +
        '<div style="font-size:var(--step-1);font-weight:600">Drop a Buffer export here</div>' +
        '<p class="tiny mute" style="max-width:46ch;margin:8px auto 0;line-height:1.6">' +
        'CSV, Excel or JSON. Columns are matched against Buffer\'s field names automatically — you only touch the ones it can\'t place.</p>' +
        '<input type="file" id="fileInput" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.json" hidden>' +
      '</div>';

    const stage = staged ?
      '<div class="card" style="margin-bottom:16px"><div class="card__head">' +
        BAUGMENT.icon.render('file', 16) +
        '<div><div class="card__title">' + esc(staged.file.name) + '</div>' +
        '<div class="tiny mute mono">' + staged.format.toUpperCase() + ' · ' + U.fmt.int(staged.records.length) +
        ' rows · ' + staged.headers.length + ' columns · ' + mappedCount + ' mapped</div></div>' +
        '<div class="spacer"></div>' +
        '<button class="btn btn--ghost btn--sm" id="cancelImport">Cancel</button></div>' +
        '<div class="card__body card__body--flush">' + previewTable() + '</div></div>' +

      '<div class="grid-2" style="margin-bottom:16px">' +
        B.card('Column mapping',
          '<p class="tiny mute" style="margin-bottom:12px">Matched columns are pre-filled. Change anything that landed wrong.</p>' +
          '<div style="max-height:420px;overflow-y:auto">' + mappingUI() + '</div>',
          { tools: '<button class="btn btn--ghost btn--sm" id="remap">Re-detect</button>' }) +
        B.card('Duplicates and validation',
          '<div class="field"><span class="field__label">When a post is already in BAUGMENT</span>' +
          '<div style="display:flex;flex-direction:column;gap:8px">' +
          [['skip', 'Skip it', 'Keep what\'s stored and ignore the incoming row.'],
           ['replace', 'Replace it', 'Overwrite the stored metrics with the incoming ones. Use this for refreshed exports.'],
           ['append', 'Add anyway', 'Keep both copies. Only useful when the same post genuinely appears twice.']]
            .map((o) => '<label class="check" style="align-items:flex-start;gap:10px;padding:10px;border:1px solid ' +
              (strategy === o[0] ? 'var(--accent)' : 'var(--line)') + ';border-radius:10px;cursor:pointer">' +
              '<input type="radio" name="dupe" value="' + o[0] + '"' + (strategy === o[0] ? ' checked' : '') + ' style="margin-top:2px">' +
              '<span><span style="font-weight:600;display:block">' + o[1] + '</span>' +
              '<span class="tiny mute">' + o[2] + '</span></span></label>').join('') +
          '</div></div>' +
          '<div class="tiny" style="line-height:1.9">' +
            '<div>' + (hasDate ? '<span style="color:var(--accent)">✓</span>' : '<span style="color:var(--rose)">✗</span>') + ' A column is mapped to Published Date</div>' +
            '<div>' + (hasPlatform ? '<span style="color:var(--accent)">✓</span>' : '<span style="color:var(--rose)">✗</span>') + ' A column is mapped to Platform</div>' +
            '<div class="mute">Rows missing either are skipped and listed in the error log.</div>' +
          '</div>' +
          '<div id="importProgress" style="display:none;margin-top:16px">' +
            '<div class="progress"><div class="progress__fill" id="importProgressFill" style="width:0"></div></div>' +
            '<div class="tiny mute mono" id="importProgressNote" style="margin-top:6px">Starting…</div>' +
          '</div>' +
          '<div style="margin-top:18px;display:flex;gap:8px">' +
            '<button class="btn btn--primary" id="runImport"' + (hasDate && hasPlatform ? '' : ' disabled') + '>' +
            BAUGMENT.icon.render('check', 15) + ' Import ' + U.fmt.int(staged.records.length) + ' rows</button>' +
          '</div>') +
      '</div>' : '';

    const errorCard = errors.length ?
      B.card('Import warnings',
        '<p class="tiny mute" style="margin-bottom:12px">' + errors.length + ' row' + (errors.length === 1 ? '' : 's') +
        ' had something worth looking at. Rows marked skipped were not imported.</p>' +
        '<div class="table-wrap" style="max-height:300px;overflow-y:auto"><table class="table"><thead><tr>' +
        '<th>Row</th><th>Severity</th><th>Problem</th></tr></thead><tbody>' +
        errors.slice(0, 200).map((e) => e.problems.map((p) =>
          '<tr><td class="mono">' + e.row + '</td>' +
          '<td><span class="chip status status--' + (e.fatal ? 'draft' : 'review') + '">' + (e.fatal ? 'Skipped' : 'Warning') + '</span></td>' +
          '<td>' + esc(p) + '</td></tr>').join('')).join('') +
        '</tbody></table></div>',
        { tools: '<button class="btn btn--sm" id="dlErrors">' + BAUGMENT.icon.render('download', 14) + ' Download log</button>' }) : '';

    const history = db.importHistory.length ?
      B.card('Import history',
        '<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>File</th><th>Strategy</th>' +
        '<th class="n">Rows</th><th class="n">Added</th><th class="n">Replaced</th><th class="n">Skipped</th><th class="n">Warnings</th></tr></thead><tbody>' +
        db.importHistory.slice(0, 12).map((h) => '<tr>' +
          '<td class="mono tiny">' + esc(U.fmt.relative(h.at)) + '</td>' +
          '<td class="clamp">' + esc(h.file) + '</td>' +
          '<td class="mute">' + esc(h.strategy) + '</td>' +
          '<td class="n">' + U.fmt.int(h.total) + '</td>' +
          '<td class="n" style="color:var(--accent)">' + U.fmt.int(h.added) + '</td>' +
          '<td class="n">' + U.fmt.int(h.replaced) + '</td>' +
          '<td class="n">' + U.fmt.int(h.skipped) + '</td>' +
          '<td class="n">' + U.fmt.int(h.warnings) + '</td></tr>').join('') +
        '</tbody></table></div>', { flush: true }) :
      B.card('Import history', '<p class="tiny mute">Nothing imported yet. Every run is logged here with its counts.</p>');

    const guide = staged ? '' : B.card('What BAUGMENT expects',
      '<p class="tiny" style="line-height:1.8;color:var(--text-dim);max-width:70ch">' +
      'Buffer\'s analytics export has shifted between their Publish and Analyze products, so BAUGMENT matches on a list of alternative header names per field rather than one exact spelling. ' +
      '<b>Date</b>, <b>Channel</b>, <b>Service</b>, <b>Text</b>, <b>Impressions</b>, <b>Reach</b>, <b>Engagements</b>, <b>Clicks</b> and the rest land without you touching anything. ' +
      'Only two fields are mandatory: a date and a platform. Everything else is optional and defaults sensibly.</p>' +
      '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn--sm" id="dlTemplate">' + BAUGMENT.icon.render('download', 14) + ' Download template CSV</button>' +
      '<button class="btn btn--sm" id="showFields">' + BAUGMENT.icon.render('list', 14) + ' See recognised headers</button>' +
      '</div>');

    el.innerHTML = zone + stage + (errorCard ? errorCard + '<div style="height:16px"></div>' : '') +
      (guide ? guide + '<div style="height:16px"></div>' : '') + history;

    /* Wiring */
    const dz = el.querySelector('#dropzone');
    if (dz) {
      const input = el.querySelector('#fileInput');
      dz.addEventListener('click', () => input.click());
      input.addEventListener('change', () => { if (input.files[0]) stageFile(input.files[0]); });
      BAUGMENT.ui.dropTarget(dz, (files) => stageFile(files[0]));
      /* Let the whole page accept a drop, not just the box. */
      BAUGMENT.ui.dropTarget(el, (files) => stageFile(files[0]));
    }

    const cancel = el.querySelector('#cancelImport');
    if (cancel) cancel.addEventListener('click', () => { reset(); render(el); });

    el.querySelectorAll('[data-map]').forEach((s) => s.addEventListener('change', () => {
      staged.map[s.getAttribute('data-map')] = s.value;
      render(el);
    }));
    const remap = el.querySelector('#remap');
    if (remap) remap.addEventListener('click', () => {
      staged.map = B2.autoMap(staged.headers, store.state().customMetrics.map((m) => B2.norm(m.label)));
      BAUGMENT.ui.toast('Columns re-detected', Object.values(staged.map).filter(Boolean).length + ' matched');
      render(el);
    });
    el.querySelectorAll('input[name="dupe"]').forEach((rb) => rb.addEventListener('change', () => {
      strategy = rb.value; render(el);
    }));
    const run = el.querySelector('#runImport');
    if (run) run.addEventListener('click', runImport);

    const dl = el.querySelector('#dlErrors');
    if (dl) dl.addEventListener('click', downloadErrorLog);
    const tpl = el.querySelector('#dlTemplate');
    if (tpl) tpl.addEventListener('click', sampleTemplate);
    const sf = el.querySelector('#showFields');
    if (sf) sf.addEventListener('click', () => {
      const body = '<div class="table-wrap" style="max-height:56vh;overflow-y:auto"><table class="table"><thead><tr>' +
        '<th>BAUGMENT field</th><th>Headers it recognises</th></tr></thead><tbody>' +
        Object.keys(B2.ALIASES).map((k) => {
          const t = B2.TARGETS.find((x) => x.key === k);
          return '<tr><td style="font-weight:600">' + esc(t ? t.label : k) + '</td>' +
            '<td class="tiny mute">' + esc(B2.ALIASES[k].join(', ')) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      BAUGMENT.ui.modal({ title: 'Recognised column headers', body, wide: true, actions: [{ label: 'Close', variant: 'primary' }] });
    });
  }

  return {
    title: 'Import Data',
    eyebrow: 'Buffer exports in, cleanly',
    lede: 'Drop the file Buffer gives you. BAUGMENT matches the columns, shows you what it found, and only then writes anything.',
    filters: false,
    actions: () => '<button class="btn" id="impTemplate">' + BAUGMENT.icon.render('download', 15) + ' Template CSV</button>',
    wireActions(root) { root.querySelector('#impTemplate').addEventListener('click', sampleTemplate); },
    render,
    /* Exposed so a file can be handed in from outside the dropzone. */
    stage: stageFile,
    run: runImport,
    setStrategy(s) { strategy = s; }
  };
})();


/* ========================================================================== */
/* Export                                                                     */
/* ========================================================================== */

BAUGMENT.views.export = (function () {
  const U = BAUGMENT.util;
  const B = BAUGMENT.bits;
  const store = BAUGMENT.store;
  const X = BAUGMENT.exporter;
  const esc = U.esc;

  let selected = null;   /* null = the default column set */

  function currentColumns() {
    return selected || X.columns(store.state().settings.exportIncludeDerived);
  }

  function render(el) {
    const rows = store.rows();
    const cols = currentColumns();
    const w = store.dateWindow();
    const f = store.getFilters();

    const activeFilters = [];
    if (f.platform !== 'all') activeFilters.push('Platform: ' + BAUGMENT.schema.platform(f.platform).name);
    if (f.campaign !== 'all') activeFilters.push('Campaign: ' + store.campaignName(f.campaign));
    if (f.pillar !== 'all') activeFilters.push('Pillar: ' + store.pillarName(f.pillar));
    if (f.mediaType !== 'all') activeFilters.push('Media: ' + f.mediaType);
    if (f.contentType !== 'all') activeFilters.push('Content: ' + f.contentType);
    if (f.author !== 'all') activeFilters.push('Author: ' + f.author);
    if (f.q) activeFilters.push('Search: "' + f.q + '"');

    const summary = B.card('What will be exported',
      '<div class="kpis" style="margin-bottom:0">' +
        B.kpi('Rows', U.fmt.int(rows.length), {}) +
        B.kpi('Columns', U.fmt.int(cols.length), {}) +
        B.kpi('From', U.fmt.date(w.from === '0000-01-01' ? (rows.length ? rows[rows.length - 1].published_date : U.iso(new Date())) : w.from), {}) +
        B.kpi('To', U.fmt.date(w.to === '9999-12-31' ? (rows.length ? rows[0].published_date : U.iso(new Date())) : w.to), {}) +
      '</div>' +
      '<div class="row" style="margin-top:14px">' +
        (activeFilters.length
          ? activeFilters.map((x) => '<span class="chip">' + esc(x) + '</span>').join('')
          : '<span class="tiny mute">No filters beyond the date range — this is everything in the window.</span>') +
      '</div>');

    const formats = [
      ['csv', 'CSV', 'Comma-separated, UTF-8 with a BOM so Excel reads Indonesian characters correctly.'],
      ['xlsx', 'Excel', 'A single Analytics sheet with a frozen header row and sized columns.'],
      ['json', 'JSON', 'Full records with an export timestamp, for feeding another system.'],
      ['pdf', 'PDF', 'Opens the print dialogue with the report layout. Choose "Save as PDF".']
    ];

    const formatCards = '<div class="grid-2" style="margin:16px 0">' +
      formats.map((fm) =>
        '<section class="card"><div class="card__body">' +
          '<div class="row" style="margin-bottom:8px">' + BAUGMENT.icon.render('download', 16) +
          '<span style="font-weight:650;font-size:var(--step-1)">' + fm[1] + '</span></div>' +
          '<p class="tiny mute" style="line-height:1.6;min-height:42px">' + esc(fm[2]) + '</p>' +
          '<button class="btn btn--primary" data-fmt="' + fm[0] + '" style="margin-top:10px;width:100%">' +
          'Download ' + fm[1] + '</button>' +
        '</div></section>').join('') + '</div>';

    const allCols = X.columns(true);
    const columnPicker = B.card('Columns',
      '<p class="tiny mute" style="margin-bottom:12px">Untick anything you don\'t want in the file. This choice applies to CSV, Excel and JSON.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px">' +
      allCols.map((c) => '<label class="check"><input type="checkbox" data-col="' + esc(c) + '"' +
        (cols.indexOf(c) !== -1 ? ' checked' : '') + '>' + esc(X.header(c)) + '</label>').join('') +
      '</div>',
      { tools: '<button class="btn btn--ghost btn--sm" id="colAll">All</button>' +
               '<button class="btn btn--ghost btn--sm" id="colNone">None</button>' +
               '<button class="btn btn--ghost btn--sm" id="colDefault">Reset</button>' });

    const preview = B.card('Preview — first five rows',
      rows.length
        ? '<div class="table-wrap"><table class="table"><thead><tr>' +
          cols.slice(0, 8).map((c) => '<th>' + esc(X.header(c)) + '</th>').join('') +
          (cols.length > 8 ? '<th class="mute">+' + (cols.length - 8) + '</th>' : '') + '</tr></thead><tbody>' +
          rows.slice(0, 5).map((r) => '<tr>' + cols.slice(0, 8).map((c) =>
            '<td class="clamp" style="max-width:170px">' + esc(String(X.value(r, c))) + '</td>').join('') +
            (cols.length > 8 ? '<td class="mute">…</td>' : '') + '</tr>').join('') +
          '</tbody></table></div>'
        : '<p class="tiny mute">No rows match the current filters.</p>', { flush: rows.length > 0 });

    const other = B.card('Other exports',
      '<div class="row">' +
      '<button class="btn btn--sm" data-other="planner">Planned content (CSV)</button>' +
      '<button class="btn btn--sm" data-other="ideas">Idea bank (CSV)</button>' +
      '<button class="btn btn--sm" data-other="campaigns">Campaigns (CSV)</button>' +
      '<button class="btn btn--sm" data-other="pillars">Pillars (CSV)</button>' +
      '<button class="btn btn--sm" data-other="backup">Full backup (JSON)</button>' +
      '</div><p class="tiny mute" style="margin-top:10px">The backup contains every record BAUGMENT holds and can be restored from Settings.</p>');

    el.innerHTML = summary + formatCards + columnPicker + '<div style="height:16px"></div>' + preview +
      '<div style="height:16px"></div>' + other;

    /* Wiring */
    el.querySelectorAll('[data-fmt]').forEach((b) => b.addEventListener('click', () => {
      const fmt = b.getAttribute('data-fmt');
      if (!rows.length) { BAUGMENT.ui.toast('Nothing to export', 'No rows match the current filters.', 'warn'); return; }
      const name = 'baugment-analytics-' + U.iso(new Date());
      if (fmt === 'csv') X.toCSV(rows, name, { columns: cols });
      if (fmt === 'xlsx') X.toXLSX(rows, name, { columns: cols });
      if (fmt === 'json') X.toJSON(rows, name, { filters: store.getFilters() });
      if (fmt === 'pdf') { BAUGMENT.ui.toast('Opening print dialogue', 'Choose "Save as PDF" as the destination.', 'info'); setTimeout(() => window.print(), 400); }
    }));

    el.querySelectorAll('[data-col]').forEach((cb) => cb.addEventListener('change', () => {
      selected = Array.from(el.querySelectorAll('[data-col]')).filter((x) => x.checked).map((x) => x.getAttribute('data-col'));
      render(el);
    }));
    el.querySelector('#colAll').addEventListener('click', () => { selected = allCols.slice(); render(el); });
    el.querySelector('#colNone').addEventListener('click', () => { selected = ['published_date', 'platform']; render(el); });
    el.querySelector('#colDefault').addEventListener('click', () => { selected = null; render(el); });

    el.querySelectorAll('[data-other]').forEach((b) => b.addEventListener('click', () => {
      const kind = b.getAttribute('data-other');
      const db = store.state();
      const dump = (name, list, keys) => {
        const lines = [keys.join(',')].concat(list.map((r) => keys.map((k) => {
          const v = typeof r[k] === 'object' && r[k] ? JSON.stringify(r[k]) : r[k];
          const s = v == null ? '' : String(v);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',')));
        U.download(name + '.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
        BAUGMENT.ui.toast('Downloaded', list.length + ' rows');
      };
      if (kind === 'planner') dump('baugment-planned-content', db.planner,
        ['publish_date', 'publish_time', 'title', 'platform', 'status', 'priority', 'objective', 'audience', 'cta', 'owner', 'reviewer', 'hashtags', 'caption']);
      if (kind === 'ideas') dump('baugment-idea-bank', db.ideas || [],
        ['title', 'status', 'potential', 'origin', 'platform', 'owner', 'tags', 'source_url', 'created_on', 'updated_on', 'notes']);
      if (kind === 'campaigns') dump('baugment-campaigns', db.campaigns,
        ['name', 'objective', 'start', 'end', 'status', 'owner', 'budget', 'kpi_metric', 'kpi_target', 'platforms']);
      if (kind === 'pillars') dump('baugment-content-pillars', db.pillars, ['name', 'description', 'target_share']);
      if (kind === 'backup') {
        U.download('baugment-backup-' + U.iso(new Date()) + '.json', JSON.stringify(db, null, 2), 'application/json');
        BAUGMENT.ui.toast('Backup downloaded', 'Restore it from Settings → Data');
      }
    }));
  }

  return {
    title: 'Export Data',
    eyebrow: 'Take it elsewhere',
    lede: 'Exports follow the filters below, so set the window first and what you download is exactly what you see.',
    filters: true,
    render
  };
})();


/* ========================================================================== */
/* Settings                                                                   */
/* ========================================================================== */

BAUGMENT.views.settings = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const B = BAUGMENT.bits;
  const store = BAUGMENT.store;
  const esc = U.esc;

  let tab = 'account';

  function passwordCard() {
    return B.card('Change password',
      '<p class="tiny mute" style="margin-bottom:16px;max-width:60ch">' +
      'The starting password is documented in the README, so change it before BAUGMENT goes on a shared machine.</p>' +
      '<div style="max-width:420px">' +
      '<label class="field"><span class="field__label">Current password</span>' +
        '<input class="input" type="password" id="pwCurrent" autocomplete="current-password"></label>' +
      '<label class="field"><span class="field__label">New password</span>' +
        '<input class="input" type="password" id="pwNew" autocomplete="new-password">' +
        '<span class="field__hint">At least 8 characters, with a lowercase letter and a number.</span></label>' +
      '<div id="pwMeter" style="display:flex;gap:4px;margin:-6px 0 16px">' +
        [0, 1, 2, 3].map(() => '<span style="flex:1;height:3px;border-radius:2px;background:var(--surface-3)"></span>').join('') +
      '</div>' +
      '<label class="field"><span class="field__label">Confirm new password</span>' +
        '<input class="input" type="password" id="pwConfirm" autocomplete="new-password"></label>' +
      '<div id="pwError" class="field__error" style="margin-bottom:12px"></div>' +
      '<button class="btn btn--primary" id="pwSave">' + BAUGMENT.icon.render('lock', 15) + ' Save new password</button>' +
      '</div>');
  }

  function accountTab() {
    const s = BAUGMENT.auth.session();
    return passwordCard() + '<div style="height:16px"></div>' +
      B.card('Signed in as',
        '<div class="row" style="gap:14px">' +
        '<span class="avatar" style="width:44px;height:44px;border-radius:12px;font-size:var(--step-0)">' +
        esc((s.displayName || 'A').slice(0, 1).toUpperCase()) + '</span>' +
        '<div><div style="font-weight:650">' + esc(s.displayName) + '</div>' +
        '<div class="tiny mute mono">' + esc(s.username) + ' · ' + esc(s.role) + '</div></div>' +
        '<div class="spacer"></div>' +
        '<div style="text-align:right"><div class="tiny mute">Session expires</div>' +
        '<div class="tiny mono">' + esc(new Date(s.expires).toLocaleString('en-GB')) + '</div></div></div>' +
        '<p class="tiny mute" style="margin-top:16px;line-height:1.7;max-width:70ch">' +
        'BAUGMENT runs entirely in this browser, so this sign-in controls who can open the screen — it isn\'t a server-side security boundary. ' +
        'Anyone with access to the device and developer tools can read the stored data. Treat it accordingly, and put BAUGMENT behind your own login if it ever leaves Baugment\'s own machines.</p>');
  }

  function preferencesTab() {
    const st = store.state().settings;
    const opt = (v, l, sel) => '<option value="' + esc(v) + '"' + (sel === v ? ' selected' : '') + '>' + esc(l) + '</option>';
    return B.card('Appearance and locale',
      '<div class="grid-2">' +
      '<label class="field"><span class="field__label">Theme</span><select class="select" data-s="theme">' +
        opt('dark', 'Dark', st.theme) + opt('light', 'Light', st.theme) + '</select></label>' +
      '<label class="field"><span class="field__label">Language</span><select class="select" data-s="language">' +
        opt('en', 'English', st.language) + opt('id', 'Bahasa Indonesia', st.language) +
        '</select><span class="field__hint">Indonesian labels are on the roadmap; the setting is stored now so the switch is a data change later.</span></label>' +
      '<label class="field"><span class="field__label">Time zone</span><select class="select" data-s="timezone">' +
        ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'UTC'].map((z) => opt(z, z, st.timezone)).join('') + '</select></label>' +
      '<label class="field"><span class="field__label">Date format</span><select class="select" data-s="dateFormat">' +
        ['DD MMM YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY'].map((z) => opt(z, z, st.dateFormat)).join('') + '</select></label>' +
      '</div>') + '<div style="height:16px"></div>' +
      B.card('Import and export defaults',
        '<div class="grid-2">' +
        '<label class="field"><span class="field__label">Default duplicate handling</span><select class="select" data-s="duplicateStrategy">' +
          opt('skip', 'Skip duplicates', st.duplicateStrategy) + opt('replace', 'Replace duplicates', st.duplicateStrategy) +
          opt('append', 'Add anyway', st.duplicateStrategy) + '</select></label>' +
        '<label class="field"><span class="field__label">CSV delimiter</span><select class="select" data-s="exportDelimiter">' +
          opt(',', 'Comma  ( , )', st.exportDelimiter) + opt(';', 'Semicolon  ( ; )', st.exportDelimiter) +
          opt('\t', 'Tab', st.exportDelimiter) + '</select></label>' +
        '</div>' +
        '<label class="check"><input type="checkbox" data-s="exportIncludeDerived"' + (st.exportIncludeDerived ? ' checked' : '') + '>' +
        'Include derived metrics (engagement rate, CTR, net followers) in exports</label>');
  }

  /* --- Accounts ------------------------------------------------------------ */

  function editAccount(item) {
    const db = store.state();
    const isNew = !db.accounts.some((a) => a.id === item.id);
    const a = Object.assign({}, item);

    const body =
      '<div class="grid-2">' +
        '<label class="field"><span class="field__label">Platform</span>' +
          '<select class="select" data-f="platform">' +
          S.PLATFORMS.map((p) => '<option value="' + p.id + '"' + (a.platform === p.id ? ' selected' : '') + '>' +
            esc(p.name) + (p.live ? '' : ' (not live)') + '</option>').join('') + '</select></label>' +
        '<label class="field"><span class="field__label">Handle</span>' +
          '<input class="input" data-f="handle" value="' + esc(a.handle || '') + '" placeholder="@baugmentinstitute"></label>' +
      '</div>' +
      '<div class="grid-2">' +
        '<label class="field"><span class="field__label">Display name</span>' +
          '<input class="input" data-f="name" value="' + esc(a.name || '') + '" placeholder="Baugment"></label>' +
        '<label class="field"><span class="field__label">Followers today</span>' +
          '<input class="input num" type="number" min="0" data-f="followers" value="' + esc(a.followers || 0) + '" style="text-align:right">' +
          '<span class="field__hint">Recorded against today\'s date, so growth can be measured from it.</span></label>' +
      '</div>';

    const actions = [{ label: 'Cancel' }];
    if (!isNew) actions.push({
      label: 'Remove', variant: 'danger', keepOpen: true,
      onClick: async (bodyEl, close) => {
        const posts = db.analytics.filter((r) => r.account_id === a.id).length;
        const ok = await BAUGMENT.ui.confirm('Remove ' + (a.handle || 'this account') + '?',
          (posts ? posts + ' posts reference it and will keep their numbers. ' : '') +
          'Its follower history is deleted too.', 'Remove');
        if (!ok) return false;
        store.snapshotsFor(a.id).forEach((sn) => store.removeFollowerSnapshot(sn.id));
        store.remove('accounts', a.id);
        BAUGMENT.ui.toast('Account removed', a.handle || '');
        close(); BAUGMENT.app.render();
        return false;
      }
    });
    actions.push({
      label: isNew ? 'Add account' : 'Save changes', variant: 'primary', keepOpen: true,
      onClick: (bodyEl, close) => {
        bodyEl.querySelectorAll('[data-f]').forEach((f) => { a[f.getAttribute('data-f')] = f.value; });
        a.followers = Math.max(0, Number(a.followers) || 0);
        if (!a.handle.trim()) { BAUGMENT.ui.toast('Handle required', 'Give the account a handle so it\'s recognisable.', 'warn'); return false; }
        if (!a.name.trim()) a.name = a.handle;
        const clash = db.accounts.find((x) => x.id !== a.id && x.platform === a.platform &&
          (x.handle || '').toLowerCase() === a.handle.trim().toLowerCase());
        if (clash) { BAUGMENT.ui.toast('Already added', 'That handle is on ' + S.platform(a.platform).name + ' already.', 'warn'); return false; }
        store.upsert('accounts', a);
        store.setFollowers(a.id, a.followers);
        BAUGMENT.ui.toast(isNew ? 'Account added' : 'Changes saved', a.handle);
        close(); BAUGMENT.app.render();
        return false;
      }
    });

    BAUGMENT.ui.modal({ title: isNew ? 'Add a social account' : 'Edit account', body, actions });
  }

  /* The dated readings behind one account's current number. */
  function followerHistory(accountId) {
    const acc = store.account(accountId);
    if (!acc) return;
    const draw = (m) => {
      const list = store.snapshotsFor(accountId).slice().reverse();
      const chart = list.length > 1
        ? BAUGMENT.charts.line(
            list.slice().reverse().map((sn) => U.fmt.date(sn.captured_on).slice(0, 6)),
            [{ name: 'Followers', values: list.slice().reverse().map((sn) => sn.followers), color: 'var(--accent)' }],
            { height: 190, area: true, format: U.fmt.compact })
        : '<p class="tiny mute">One reading so far — add another to see the trend.</p>';

      m.body.innerHTML =
        '<div class="row" style="margin-bottom:14px">' + B.platformChip(acc.platform) +
          '<span class="mono">' + esc(acc.handle) + '</span><span class="spacer"></span>' +
          '<span class="num" style="font-size:var(--step-2);font-weight:650">' + U.fmt.int(acc.followers) + '</span></div>' +
        '<div style="margin-bottom:18px">' + chart + '</div>' +
        '<div class="eyebrow" style="margin-bottom:8px">Record a reading</div>' +
        '<div class="row" style="margin-bottom:18px;align-items:flex-end">' +
          '<label class="field" style="margin-bottom:0;flex:1;min-width:150px"><span class="field__label">Date</span>' +
            '<input class="input" type="date" id="fsDate" value="' + U.iso(new Date()) + '"></label>' +
          '<label class="field" style="margin-bottom:0;flex:1;min-width:150px"><span class="field__label">Followers</span>' +
            '<input class="input num" type="number" min="0" id="fsCount" value="' + acc.followers + '" style="text-align:right"></label>' +
          '<button class="btn btn--primary" id="fsSave">Record</button>' +
        '</div>' +
        (list.length
          ? '<div class="table-wrap" style="max-height:240px;overflow-y:auto"><table class="table"><thead><tr>' +
            '<th>Date</th><th class="n">Followers</th><th class="n">Change</th><th></th></tr></thead><tbody>' +
            list.map((sn, i) => {
              const prev = list[i + 1];
              const diff = prev ? sn.followers - prev.followers : null;
              return '<tr><td class="mono">' + esc(sn.captured_on) + '</td>' +
                '<td class="n">' + U.fmt.int(sn.followers) + '</td>' +
                '<td class="n">' + (diff == null ? '<span class="mute">—</span>'
                  : '<span style="color:var(--' + (diff > 0 ? 'accent' : diff < 0 ? 'rose' : 'text-mute') + ')">' +
                    (diff > 0 ? '+' : '') + U.fmt.int(diff) + '</span>') + '</td>' +
                '<td><button class="btn btn--ghost btn--sm" data-delsnap="' + sn.id + '" title="Remove reading">' +
                BAUGMENT.icon.render('trash', 13) + '</button></td></tr>';
            }).join('') + '</tbody></table></div>'
          : '<p class="tiny mute">No readings recorded yet.</p>');

      m.body.querySelector('#fsSave').addEventListener('click', () => {
        const date = m.body.querySelector('#fsDate').value;
        const count = m.body.querySelector('#fsCount').value;
        if (!date) { BAUGMENT.ui.toast('Pick a date', 'A reading needs the day it was taken.', 'warn'); return; }
        store.setFollowers(accountId, count, date);
        BAUGMENT.ui.toast('Reading recorded', U.fmt.int(Number(count)) + ' on ' + U.fmt.date(date));
        draw(m);
      });
      m.body.querySelectorAll('[data-delsnap]').forEach((b) => b.addEventListener('click', () => {
        store.removeFollowerSnapshot(b.getAttribute('data-delsnap'));
        draw(m);
      }));
      BAUGMENT.charts.bind(m.body);
    };

    const m = BAUGMENT.ui.modal({
      title: 'Follower history', body: '', wide: true,
      actions: [{ label: 'Done', variant: 'primary', onClick: () => BAUGMENT.app.render() }]
    });
    draw(m);
  }

  function platformsTab() {
    const st = store.state().settings;
    const db = store.state();
    return B.card('Platforms',
      '<p class="tiny mute" style="margin-bottom:14px;max-width:64ch">' +
      'Switched-off platforms stay in the data model and still import correctly — they just don\'t clutter the pickers.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px">' +
      S.PLATFORMS.map((p) => {
        const on = st.livePlatforms.indexOf(p.id) !== -1;
        const posts = db.analytics.filter((r) => r.platform === p.id).length;
        return '<label class="check" style="justify-content:flex-start;gap:10px;padding:12px;border:1px solid ' +
          (on ? 'var(--accent)' : 'var(--line)') + ';border-radius:10px;cursor:pointer">' +
          '<input type="checkbox" data-live="' + p.id + '"' + (on ? ' checked' : '') + '>' +
          B.platformChip(p.id) + '<span class="spacer"></span>' +
          '<span class="mono mute tiny">' + posts + '</span></label>';
      }).join('') + '</div>') + '<div style="height:16px"></div>' +
      B.card('Connected accounts',
        (db.accounts.length
          ? db.accounts.slice().sort((x, y) => y.followers - x.followers).map((a) => {
              const hist = store.snapshotsFor(a.id);
              const spark = hist.length > 1
                ? BAUGMENT.charts.spark(hist.map((sn) => sn.followers), 'var(--accent)', 92, 26)
                : '<span class="tiny mute">no history</span>';
              const first = hist[0], last = hist[hist.length - 1];
              const change = first && last && hist.length > 1 ? last.followers - first.followers : null;
              return '<div class="acctrow">' +
                '<div class="row" style="gap:9px;min-width:0">' + B.platformChip(a.platform, false) +
                  '<div style="min-width:0"><div class="mono" style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
                  esc(a.handle) + '</div><div class="tiny mute" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
                  esc(a.name) + '</div></div></div>' +
                '<div class="acctrow__trend">' + spark + '</div>' +
                '<div style="text-align:right"><div class="num" style="font-weight:650">' + U.fmt.compact(a.followers) + '</div>' +
                  '<div class="tiny mute">' + (change == null ? 'followers'
                    : (change >= 0 ? '+' : '') + U.fmt.compact(change) + ' all time') + '</div></div>' +
                '<div style="text-align:right" class="tiny mute">' + hist.length + ' reading' + (hist.length === 1 ? '' : 's') + '</div>' +
                '<div class="row" style="gap:4px;justify-content:flex-end">' +
                  '<button class="btn btn--sm" data-hist="' + a.id + '">' + BAUGMENT.icon.render('analytics', 13) + ' Followers</button>' +
                  '<button class="btn btn--ghost btn--icon btn--sm" data-editacc="' + a.id + '" aria-label="Edit account">' +
                  BAUGMENT.icon.render('edit', 13) + '</button>' +
                '</div></div>';
            }).join('')
          : BAUGMENT.ui.empty('No accounts yet',
              'Add Baugment\'s LinkedIn, Instagram, YouTube and TikTok so follower counts and growth have somewhere to live.',
              '<button class="btn btn--primary" id="accEmptyNew">' + BAUGMENT.icon.render('plus', 15) + ' Add an account</button>')) +
        '<p class="tiny mute" style="padding:14px 16px 2px;line-height:1.6">Follower counts are entered by hand — Buffer\'s post export doesn\'t carry them. ' +
        'Each reading is stored against its date, so the growth figures on the dashboard come from what you recorded.</p>',
        { flush: true,
          tools: '<button class="btn btn--sm" id="accNew">' + BAUGMENT.icon.render('plus', 14) + ' Add account</button>' });
  }

  function metricsTab() {
    const custom = store.state().customMetrics;
    return B.card('Custom metrics',
      '<p class="tiny mute" style="margin-bottom:14px;max-width:66ch">' +
      'A custom metric becomes a real column everywhere: the import mapper, the analytics table, the chart picker, campaign KPIs and every export. ' +
      'Values live alongside the built-in ones on each record, so nothing about the stored shape changes.</p>' +
      (custom.length
        ? '<div class="table-wrap" style="margin-bottom:16px"><table class="table"><thead><tr><th>Label</th><th>Key</th>' +
          '<th>Aggregation</th><th>Format</th><th></th></tr></thead><tbody>' +
          custom.map((m) => '<tr><td style="font-weight:600">' + esc(m.label) + '</td><td class="mono">' + esc(m.key) + '</td>' +
            '<td class="mute">' + esc(m.agg) + '</td><td class="mute">' + esc(m.fmt) + '</td>' +
            '<td><button class="btn btn--ghost btn--sm" data-delmetric="' + esc(m.key) + '">' +
            BAUGMENT.icon.render('trash', 14) + '</button></td></tr>').join('') +
          '</tbody></table></div>'
        : '<p class="tiny mute" style="margin-bottom:16px">None defined yet.</p>') +
      '<div class="grid-3" style="align-items:end">' +
      '<label class="field" style="margin-bottom:0"><span class="field__label">Label</span>' +
        '<input class="input" id="cmLabel" placeholder="Cups sold"></label>' +
      '<label class="field" style="margin-bottom:0"><span class="field__label">Aggregation</span>' +
        '<select class="select" id="cmAgg"><option value="sum">Sum</option><option value="mean">Average</option></select></label>' +
      '<label class="field" style="margin-bottom:0"><span class="field__label">Format</span>' +
        '<select class="select" id="cmFmt"><option value="int">Number</option><option value="pct">Percentage</option>' +
        '<option value="duration">Duration</option><option value="currency">Rupiah</option></select></label>' +
      '</div>' +
      '<button class="btn btn--primary" id="cmAdd" style="margin-top:14px">' + BAUGMENT.icon.render('plus', 15) + ' Add metric</button>');
  }

  const COLLECTION_LABEL = {
    analytics: 'Analytics records', planner: 'Planned posts', ideas: 'Ideas',
    campaigns: 'Campaigns', pillars: 'Content pillars', media: 'Media items',
    followerSnapshots: 'Follower readings'
  };

  /* Lets you take the demo set out without touching anything you've imported
     or written yourself. Pillars are unticked by default because they're a
     taxonomy your own posts may already be filed under. */
  function clearDialog(mode) {
    const counts = store.demoCounts();
    const rows = store.DEMO_COLLECTIONS.map((c) => {
      const n = mode === 'all' ? counts[c].total : counts[c].demo;
      const on = n > 0 && c !== 'pillars';
      return '<label class="check" style="justify-content:flex-start;gap:10px;padding:11px;border:1px solid var(--line);' +
        'border-radius:10px;margin-bottom:8px' + (n ? '' : ';opacity:.5') + '">' +
        '<input type="checkbox" data-clear="' + c + '"' + (on ? ' checked' : '') + (n ? '' : ' disabled') + '>' +
        '<span style="font-weight:600">' + esc(COLLECTION_LABEL[c]) + '</span>' +
        '<span class="spacer"></span>' +
        '<span class="mono tiny mute">' + U.fmt.int(n) + (mode === 'all' ? ' records' : ' demo of ' + counts[c].total) + '</span>' +
        '</label>';
    }).join('');

    const note = mode === 'all'
      ? 'This empties the selected collections completely, including anything you imported or created. Download a backup first if you\'re not certain.'
      : 'Only the generated demo records are removed. Anything you imported or created stays exactly where it is.';

    BAUGMENT.ui.modal({
      title: mode === 'all' ? 'Clear everything' : 'Remove demo data',
      body: '<p class="tiny mute" style="margin-bottom:16px;line-height:1.65;max-width:62ch">' + esc(note) + '</p>' + rows +
        '<p class="tiny mute" style="margin-top:12px">You can rebuild the demo set at any time with <b>Reset to demo data</b>.</p>',
      actions: [
        { label: 'Cancel' },
        {
          label: mode === 'all' ? 'Clear selected' : 'Remove demo data',
          variant: mode === 'all' ? 'danger' : 'primary',
          keepOpen: true,
          onClick: async (bodyEl, close) => {
            const picked = Array.from(bodyEl.querySelectorAll('[data-clear]'))
              .filter((x) => x.checked && !x.disabled).map((x) => x.getAttribute('data-clear'));
            if (!picked.length) {
              BAUGMENT.ui.toast('Nothing selected', 'Tick at least one thing to remove.', 'warn');
              return false;
            }
            if (mode === 'all') {
              const ok = await BAUGMENT.ui.confirm('Clear ' + picked.length + ' collection' + (picked.length === 1 ? '' : 's') + '?',
                'Every record in them is deleted, imported ones included. This can\'t be undone.', 'Clear');
              if (!ok) return false;
            }
            const removed = store.clearData(picked, mode);
            const total = Object.keys(removed).reduce((a, k) => a + removed[k], 0);
            store.resetFilters();
            BAUGMENT.ui.toast(mode === 'all' ? 'Cleared' : 'Demo data removed',
              U.fmt.int(total) + ' record' + (total === 1 ? '' : 's') + ' deleted');
            close();
            BAUGMENT.app.render();
            return false;
          }
        }
      ]
    });
  }

  function demoCard() {
    const counts = store.demoCounts();
    if (!counts.demoTotal) {
      return B.card('Demo data',
        '<div class="row" style="gap:10px"><span style="color:var(--accent)">' + BAUGMENT.icon.render('check', 18) + '</span>' +
        '<div><div style="font-weight:600">No demo data left</div>' +
        '<div class="tiny mute">Everything BAUGMENT is holding came from you.</div></div>' +
        '<div class="spacer"></div>' +
        '<button class="btn btn--sm" id="demoRestore">' + BAUGMENT.icon.render('refresh', 14) + ' Load demo data again</button></div>');
    }

    const bars = store.DEMO_COLLECTIONS.filter((c) => counts[c].total).map((c) => {
      const pct = (counts[c].demo / counts[c].total) * 100;
      return '<div style="margin-bottom:10px">' +
        '<div class="row" style="gap:8px;margin-bottom:4px">' +
        '<span class="tiny">' + esc(COLLECTION_LABEL[c]) + '</span><span class="spacer"></span>' +
        '<span class="mono tiny mute">' + U.fmt.int(counts[c].demo) + ' demo · ' + U.fmt.int(counts[c].real) + ' yours</span></div>' +
        '<div style="height:7px;border-radius:99px;background:var(--accent);overflow:hidden">' +
        '<div style="height:100%;width:' + pct.toFixed(1) + '%;background:var(--gold)"></div></div></div>';
    }).join('');

    return B.card('Demo data',
      '<p class="tiny mute" style="margin-bottom:16px;line-height:1.7;max-width:70ch">' +
      'BAUGMENT ships with a generated data set so the dashboards have something to show on first run. ' +
      '<b>' + U.fmt.int(counts.demoTotal) + ' of ' + U.fmt.int(counts.total) + '</b> stored records are demo. ' +
      'Remove them when you\'re ready to work with the real numbers — anything you\'ve imported stays.</p>' +
      bars +
      '<div class="legend" style="margin-bottom:18px">' +
      '<span class="legend__item"><span class="legend__swatch" style="background:var(--gold)"></span>Demo</span>' +
      '<span class="legend__item"><span class="legend__swatch" style="background:var(--accent)"></span>Yours</span></div>' +
      '<div class="row">' +
      '<button class="btn btn--primary" id="demoClear">' + BAUGMENT.icon.render('trash', 15) + ' Remove demo data</button>' +
      '<button class="btn" id="demoGoImport">' + BAUGMENT.icon.render('upload', 15) + ' Import real data first</button>' +
      '</div>');
  }

  function dataTab() {
    const db = store.state();
    const counts = [['Analytics records', db.analytics.length], ['Planned posts', db.planner.length],
      ['Ideas', (db.ideas || []).length], ['Campaigns', db.campaigns.length],
      ['Content pillars', db.pillars.length], ['Media items', db.media.length],
      ['Import runs', db.importHistory.length]];
    const bytes = JSON.stringify(db).length;

    return demoCard() + '<div style="height:16px"></div>' +
      B.card('Stored data',
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;margin-bottom:18px">' +
      counts.map((c) => '<div><div class="tiny mute">' + esc(c[0]) + '</div>' +
        '<div class="num" style="font-size:var(--step-2);font-weight:650">' + U.fmt.int(c[1]) + '</div></div>').join('') +
      '</div>' +
      '<div class="row"><span class="chip mono">' + (bytes / 1024).toFixed(0) + ' KB in this browser</span>' +
      '<span class="chip mono">' + (BAUGMENT.persist.durable ? 'Persistent' : 'Session only') + '</span></div>') +
      '<div style="height:16px"></div>' +
      B.card('Backup and restore',
        '<div class="row">' +
        '<button class="btn" id="dataBackup">' + BAUGMENT.icon.render('download', 15) + ' Download backup</button>' +
        '<button class="btn" id="dataRestore">' + BAUGMENT.icon.render('upload', 15) + ' Restore from backup</button>' +
        '<input type="file" id="restoreFile" accept=".json" hidden>' +
        '<div class="spacer"></div>' +
        '<button class="btn btn--danger" id="dataClearAll">' + BAUGMENT.icon.render('trash', 15) + ' Clear everything</button>' +
        '<button class="btn btn--danger" id="dataReset">' + BAUGMENT.icon.render('refresh', 15) + ' Reset to demo data</button>' +
        '</div>' +
        '<p class="tiny mute" style="margin-top:12px;line-height:1.7;max-width:70ch">' +
        '<b>Clear everything</b> empties the collections you pick, imported records included, and leaves you with a blank BAUGMENT. ' +
        '<b>Reset to demo data</b> throws away everything stored and rebuilds the demo set — 500 analytics records, ' +
        '100 planned posts, 44 ideas, 50 campaigns and 20 pillars.</p>');
  }

  /* --- Connection --------------------------------------------------------- */

  function connectionTab() {
    const cfg = BAUGMENT.config;
    const on = cfg.isConfigured();
    const st = BAUGMENT.remote.state();

    const statusRow = (label, ok, detail) =>
      '<div class="row" style="gap:10px;padding:9px 0;border-bottom:1px solid var(--line-soft)">' +
      '<span style="color:var(--' + (ok ? 'accent' : 'rose') + ')">' + BAUGMENT.icon.render(ok ? 'check' : 'close', 15) + '</span>' +
      '<span style="font-weight:600">' + esc(label) + '</span><span class="spacer"></span>' +
      '<span class="tiny mute mono" style="text-align:right">' + esc(detail || '') + '</span></div>';

    const kind = cfg.keyKind();
    const keyLabel = { publishable: 'publishable key', 'legacy-anon': 'legacy anon key',
      secret: 'SECRET KEY — remove it', unknown: 'unrecognised format' }[kind];

    const secretAlarm = kind === 'secret'
      ? '<div class="toast toast--error" style="margin-bottom:16px;animation:none">' +
        '<span style="color:var(--rose)">' + BAUGMENT.icon.render('alert', 16) + '</span>' +
        '<div><div class="toast__title">A secret key is configured</div>' +
        '<div class="toast__msg">Secret and service_role keys bypass Row Level Security. On a public site ' +
        'this exposes the whole database to anyone who opens developer tools. Replace it in config.js with the ' +
        'publishable key, then rotate the leaked one in Supabase → Settings → API Keys.</div></div></div>'
      : '';

    const head = on
      ? secretAlarm + B.card('Shared database',
          statusRow('Supabase project', true, cfg.projectRef()) +
          statusRow('Key type', kind !== 'secret' && kind !== 'unknown', keyLabel) +
          statusRow('Signed in', !!BAUGMENT.auth.session(), BAUGMENT.auth.session() ? BAUGMENT.auth.session().username : 'no session') +
          statusRow('Live updates', st.status === 'ready', st.status) +
          statusRow('Queued changes', st.queued === 0, st.queued ? st.queued + ' waiting to send' : 'nothing pending') +
          (st.lastError ? '<p class="field__error" style="margin-top:12px">' + esc(st.lastError) + '</p>' : '') +
          (cfg.isOverridden() ? '<p class="tiny" style="margin-top:12px;color:var(--gold)">' +
            'This browser is using a local override, not the project in config.js.</p>' : '') +
          '<div class="row" style="margin-top:16px">' +
          '<button class="btn" id="connTest">' + BAUGMENT.icon.render('check', 15) + ' Run diagnostics</button>' +
          '<button class="btn" id="connPull">' + BAUGMENT.icon.render('download', 15) + ' Pull latest now</button>' +
          '<button class="btn" id="connFlush">' + BAUGMENT.icon.render('refresh', 15) + ' Retry queued changes</button>' +
          '</div>')
      : B.card('No shared database yet',
          '<p class="tiny" style="line-height:1.75;color:var(--text-dim);max-width:70ch;margin-bottom:16px">' +
          'BAUGMENT is storing everything in this browser alone. That\'s why a pillar you create on the PC ' +
          'doesn\'t appear on the iPad — they\'re two separate copies with no link between them. ' +
          'Connect a Supabase project and every device shares one database, with changes appearing live.</p>' +
          '<ol style="list-style:decimal;padding-left:20px;line-height:2;font-size:var(--step--1);color:var(--text-dim)">' +
          '<li>Create a free project at <b>supabase.com</b>.</li>' +
          '<li>Open the SQL Editor and run <b>supabase/schema.sql</b> from this repo.</li>' +
          '<li>Copy the Project URL (Settings → Data API) and the <b>publishable</b> key ' +
          '(Settings → API Keys) into <b>assets/js/config.js</b>, then commit and push.</li>' +
          '<li>Add your team under Authentication → Users, and turn public signup off.</li>' +
          '<li>Come back here and push this device\'s data up.</li>' +
          '</ol>');

    const override = B.card('Point this browser somewhere else',
      '<p class="tiny mute" style="margin-bottom:14px;max-width:66ch;line-height:1.65">' +
      'Normally the project comes from config.js so every device agrees. Use this only to try a staging ' +
      'project from one browser — it doesn\'t affect anyone else, and it doesn\'t get committed.</p>' +
      '<div class="grid-2">' +
      '<label class="field"><span class="field__label">Project URL</span>' +
        '<input class="input" id="ovUrl" placeholder="https://yourproject.supabase.co" value="' +
        esc(cfg.isOverridden() ? cfg.url() : '') + '"></label>' +
      '<label class="field"><span class="field__label">Publishable or anon key</span>' +
        '<input class="input" id="ovKey" type="password" placeholder="sb_publishable_… or eyJhbGciOi…" value="' +
        esc(cfg.isOverridden() ? cfg.anonKey() : '') + '"></label>' +
      '</div>' +
      '<div class="row"><button class="btn btn--primary" id="ovSave">Save and reload</button>' +
      (cfg.isOverridden() ? '<button class="btn btn--danger" id="ovClear">Clear override</button>' : '') +
      '</div>' +
      '<p class="tiny" style="margin-top:14px;color:var(--gold);line-height:1.6">' +
      'Only ever paste a <b>publishable</b> (sb_publishable_…) or <b>legacy anon</b> key here. ' +
      '<b>Secret</b> (sb_secret_…) and <b>service_role</b> keys bypass every security policy — on a public ' +
      'site either one would hand your database to anyone who opened developer tools.</p>');

    const counts = store.demoCounts();
    const migrate = on ? B.card('Move this device\'s data to Supabase',
      '<p class="tiny" style="line-height:1.75;color:var(--text-dim);max-width:70ch;margin-bottom:16px">' +
      'Sends everything currently in this browser up to the shared database. This is how you rescue work ' +
      'made before connecting — the pillars, campaigns and posts you created on this machine.</p>' +
      '<div class="row" style="margin-bottom:16px">' +
      ['analytics', 'planner', 'ideas', 'campaigns', 'pillars', 'media'].map((c) =>
        '<span class="chip">' + esc(COLLECTION_LABEL[c]) + ' <b>' + U.fmt.int((store.state()[c] || []).length) + '</b></span>').join('') +
      '</div>' +
      '<div id="migrateProgress" style="display:none;margin-bottom:16px">' +
        '<div class="progress"><div class="progress__fill" id="migrateFill" style="width:0"></div></div>' +
        '<div class="tiny mute mono" id="migrateNote" style="margin-top:6px">Starting…</div></div>' +
      '<div class="row">' +
      '<button class="btn btn--primary" id="migrateMerge">' + BAUGMENT.icon.render('upload', 15) + ' Push this device\'s data up</button>' +
      '<button class="btn btn--danger" id="migrateReplace">' + BAUGMENT.icon.render('alert', 15) + ' Replace everything in Supabase</button>' +
      '</div>' +
      '<p class="tiny mute" style="margin-top:12px;line-height:1.65;max-width:70ch">' +
      '<b>Push</b> merges by id — matching records are updated, new ones added, nothing in Supabase is deleted. ' +
      '<b>Replace</b> empties every table first. Only use it if this device is the one true copy.' +
      (counts.demoTotal ? ' You still have ' + U.fmt.int(counts.demoTotal) + ' demo records here; ' +
        'clear them on the Data tab first unless you want them in the shared database too.' : '') + '</p>') : '';

    const snap = BAUGMENT.persist.get('preSyncBackup', null);
    const snapshot = snap ? B.card('Pre-sync snapshot',
      '<p class="tiny mute" style="line-height:1.7;max-width:70ch;margin-bottom:14px">' +
      'A copy of what this browser held just before it first connected to Supabase, taken ' +
      esc(U.fmt.relative(snap.at)) + '. Kept in case the first sync didn\'t go the way you expected.</p>' +
      '<div class="row" style="margin-bottom:14px">' +
      ['analytics', 'planner', 'ideas', 'campaigns', 'pillars', 'media'].map((c) =>
        '<span class="chip">' + esc(COLLECTION_LABEL[c]) + ' <b>' +
        U.fmt.int(((snap.db && snap.db[c]) || []).length) + '</b></span>').join('') + '</div>' +
      '<div class="row">' +
      '<button class="btn" id="snapDownload">' + BAUGMENT.icon.render('download', 15) + ' Download it</button>' +
      '<button class="btn" id="snapRestore">' + BAUGMENT.icon.render('upload', 15) + ' Restore and push up</button>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn--ghost btn--sm" id="snapDiscard">Discard snapshot</button>' +
      '</div>') : '';

    return head + '<div style="height:16px"></div>' + (migrate ? migrate + '<div style="height:16px"></div>' : '') +
      (snapshot ? snapshot + '<div style="height:16px"></div>' : '') + override;
  }

  function render(el) {
    /* Allow #/settings?tab=data so other surfaces can link straight here. */
    const q = (window.location.hash.split('?')[1] || '');
    const wanted = (q.match(/(?:^|&)tab=([a-z]+)/) || [])[1];
    if (wanted) { tab = wanted; window.location.replace('#/settings'); }

    const tabs = [['account', 'Account'], ['connection', 'Connection'], ['preferences', 'Preferences'],
      ['platforms', 'Platforms'], ['metrics', 'Custom metrics'], ['data', 'Data']];

    el.innerHTML = '<div class="segmented no-print" id="setTabs" style="margin-bottom:18px">' +
      tabs.map((t) => '<button data-tab="' + t[0] + '" aria-pressed="' + (tab === t[0]) + '">' + t[1] + '</button>').join('') +
      '</div><div id="setBody">' +
      (tab === 'account' ? accountTab() : tab === 'connection' ? connectionTab()
        : tab === 'preferences' ? preferencesTab() : tab === 'platforms' ? platformsTab()
        : tab === 'metrics' ? metricsTab() : dataTab()) +
      '</div>';

    el.querySelectorAll('#setTabs button').forEach((b) => b.addEventListener('click', () => {
      tab = b.getAttribute('data-tab'); render(el);
    }));

    /* --- Connection --- */
    const wireConn = (id, fn) => { const n = el.querySelector(id); if (n) n.addEventListener('click', fn); };

    wireConn('#connTest', async () => {
      BAUGMENT.ui.toast('Running diagnostics', 'Checking the project, your session and every table', 'info');
      const d = await BAUGMENT.remote.diagnose();
      const row = (label, ok, detail) =>
        '<div class="row" style="gap:10px;padding:8px 0;border-bottom:1px solid var(--line-soft)">' +
        '<span style="color:var(--' + (ok ? 'accent' : 'rose') + ')">' + BAUGMENT.icon.render(ok ? 'check' : 'close', 15) + '</span>' +
        '<span>' + esc(label) + '</span><span class="spacer"></span>' +
        '<span class="tiny mute mono">' + esc(detail || '') + '</span></div>';
      let body = row('Project reachable', d.reachable, BAUGMENT.config.projectRef()) +
        row('Signed in', d.authenticated, d.authenticated ? 'yes' : 'no session');
      Object.keys(d.tables).forEach((t) => {
        const r = d.tables[t];
        body += row(t, r.ok, r.ok ? U.fmt.int(r.count) + ' rows' : r.error);
      });
      if (d.rlsWarning) {
        body += '<div class="toast toast--error" style="margin-top:16px;animation:none">' +
          '<span style="color:var(--rose)">' + BAUGMENT.icon.render('alert', 16) + '</span>' +
          '<div><div class="toast__title">Row Level Security looks disabled</div>' +
          '<div class="toast__msg">This client read rows without being signed in, which means anyone who finds ' +
          'your site can read Baugment\'s data. Re-run supabase/schema.sql — the RLS section is what closes this.</div></div></div>';
      }
      if (d.message) body += '<p class="field__error" style="margin-top:14px">' + esc(d.message) + '</p>';
      if (!d.reachable) {
        body += '<p class="tiny mute" style="margin-top:14px;line-height:1.7">Common causes: the URL or anon key in ' +
          'config.js is wrong, the project is paused in the Supabase dashboard, or something on the network is ' +
          'blocking the request.</p>';
      }
      BAUGMENT.ui.modal({ title: 'Connection diagnostics', body, wide: true, actions: [{ label: 'Close', variant: 'primary' }] });
    });

    wireConn('#connPull', async () => {
      try {
        store.hydrate(await BAUGMENT.remote.pullAll());
        BAUGMENT.ui.toast('Up to date', 'Pulled the latest from Supabase');
        BAUGMENT.app.render();
      } catch (err) {
        BAUGMENT.ui.toast('Couldn\'t pull', BAUGMENT.remote.describe(err), 'error');
      }
    });

    wireConn('#connFlush', async () => {
      const n = BAUGMENT.remote.queue().length;
      if (!n) { BAUGMENT.ui.toast('Nothing queued', 'Every change has already been sent.'); return; }
      await BAUGMENT.remote.flush();
      const left = BAUGMENT.remote.queue().length;
      BAUGMENT.ui.toast(left ? 'Still queued' : 'Sent',
        left ? left + ' of ' + n + ' changes still waiting' : n + ' change' + (n === 1 ? '' : 's') + ' delivered',
        left ? 'warn' : 'success');
      render(el);
    });

    wireConn('#ovSave', () => {
      const u = el.querySelector('#ovUrl').value.trim();
      const k = el.querySelector('#ovKey').value.trim();
      if (!u || !k) { BAUGMENT.ui.toast('Both fields needed', 'Paste the project URL and the anon public key.', 'warn'); return; }
      if (BAUGMENT.config.looksLikeSecret(k)) {
        BAUGMENT.ui.toast('That is a secret key',
          'Secret and service_role keys bypass every security policy — never put one in a browser. ' +
          'Use the publishable key (sb_publishable_…) or the legacy anon key.', 'error', 10000);
        return;
      }
      BAUGMENT.config.setOverride(u, k);
      BAUGMENT.ui.toast('Saved', 'Reloading against the new project');
      setTimeout(() => window.location.reload(), 700);
    });

    wireConn('#ovClear', () => {
      BAUGMENT.config.clearOverride();
      BAUGMENT.ui.toast('Override cleared', 'Reloading with the project from config.js');
      setTimeout(() => window.location.reload(), 700);
    });

    const runMigration = async (wipe) => {
      const db = store.state();
      const total = ['analytics', 'planner', 'ideas', 'campaigns', 'pillars', 'media', 'accounts',
        'customMetrics', 'importHistory'].reduce((a, c) => a + (db[c] || []).length, 0);
      const ok = await BAUGMENT.ui.confirm(
        wipe ? 'Replace everything in Supabase?' : 'Push ' + U.fmt.int(total) + ' records to Supabase?',
        wipe ? 'Every table is emptied first, then filled from this device. Anything a colleague added that isn\'t here is lost.'
             : 'Matching records are updated and new ones added. Nothing already in Supabase is deleted.',
        wipe ? 'Replace everything' : 'Push data up');
      if (!ok) return;

      const wrap = el.querySelector('#migrateProgress');
      const fill = el.querySelector('#migrateFill');
      const note = el.querySelector('#migrateNote');
      if (wrap) wrap.style.display = 'block';

      let done = 0;
      try {
        await BAUGMENT.remote.replaceAll(db, {
          wipe,
          onProgress: (collection, sent, of) => {
            done += sent;
            if (fill) fill.style.width = Math.min(100, (done / Math.max(1, total)) * 100).toFixed(1) + '%';
            if (note) note.textContent = COLLECTION_LABEL[collection] || collection;
          }
        });
        if (fill) fill.style.width = '100%';
        if (note) note.textContent = 'Done';
        store.useRemote(true);
        BAUGMENT.ui.toast('Data is now shared', U.fmt.int(total) +
          ' records are in Supabase. Open BAUGMENT on another device and they\'ll be there.', 'success', 8000);
        setTimeout(() => window.location.reload(), 1400);
      } catch (err) {
        if (wrap) wrap.style.display = 'none';
        BAUGMENT.ui.toast('Push failed', BAUGMENT.remote.describe(err), 'error', 9000);
      }
    };

    wireConn('#snapDownload', () => {
      const snap = BAUGMENT.persist.get('preSyncBackup', null);
      if (!snap) return;
      U.download('baugment-pre-sync-' + snap.at.slice(0, 10) + '.json', JSON.stringify(snap.db, null, 2), 'application/json');
      BAUGMENT.ui.toast('Snapshot downloaded', 'Restorable from Settings → Data → Restore from backup');
    });

    wireConn('#snapRestore', async () => {
      const snap = BAUGMENT.persist.get('preSyncBackup', null);
      if (!snap) return;
      const n = ['analytics', 'planner', 'ideas', 'campaigns', 'pillars', 'media']
        .reduce((a, c) => a + ((snap.db[c] || []).length), 0);
      const ok = await BAUGMENT.ui.confirm('Restore the pre-sync snapshot?',
        'The ' + U.fmt.int(n) + ' records from before your first sync are loaded and pushed to Supabase, merging with whatever is there now.',
        'Restore and push');
      if (!ok) return;
      try {
        await BAUGMENT.remote.replaceAll(snap.db, {});
        store.hydrate(await BAUGMENT.remote.pullAll());
        BAUGMENT.ui.toast('Snapshot restored', U.fmt.int(n) + ' records are back and shared');
        BAUGMENT.app.render();
      } catch (err) {
        BAUGMENT.ui.toast('Restore failed', BAUGMENT.remote.describe(err), 'error');
      }
    });

    wireConn('#snapDiscard', async () => {
      const ok = await BAUGMENT.ui.confirm('Discard the snapshot?',
        'The pre-sync copy is deleted from this browser. Download it first if you\'re unsure.', 'Discard');
      if (!ok) return;
      BAUGMENT.persist.remove('preSyncBackup');
      render(el);
    });

    wireConn('#migrateMerge', () => runMigration(false));
    wireConn('#migrateReplace', () => runMigration(true));

    /* --- Demo data --- */
    const demoClear = el.querySelector('#demoClear');
    if (demoClear) demoClear.addEventListener('click', () => clearDialog('demo'));
    const demoImport = el.querySelector('#demoGoImport');
    if (demoImport) demoImport.addEventListener('click', () => BAUGMENT.app.go('import'));
    const demoRestore = el.querySelector('#demoRestore');
    if (demoRestore) demoRestore.addEventListener('click', async () => {
      const ok = await BAUGMENT.ui.confirm('Load the demo data again?',
        'This rebuilds the full demo set and discards everything currently stored, including anything you imported.', 'Load demo data');
      if (!ok) return;
      store.reset();
      BAUGMENT.ui.toast('Demo data loaded', 'The full demo set is back');
      BAUGMENT.app.render();
    });

    /* --- Password --- */
    const pwNew = el.querySelector('#pwNew');
    if (pwNew) {
      const meter = el.querySelector('#pwMeter').children;
      pwNew.addEventListener('input', () => {
        const s = BAUGMENT.auth.strength(pwNew.value);
        const colors = ['var(--rose)', 'var(--rose)', 'var(--gold)', 'var(--accent)', 'var(--accent)'];
        for (let i = 0; i < 4; i++) meter[i].style.background = i < s ? colors[s] : 'var(--surface-3)';
      });
      el.querySelector('#pwSave').addEventListener('click', async () => {
        const err = el.querySelector('#pwError');
        const cur = el.querySelector('#pwCurrent').value;
        const nu = pwNew.value;
        const cf = el.querySelector('#pwConfirm').value;
        err.textContent = '';
        if (nu !== cf) { err.textContent = 'The two new passwords don\'t match.'; return; }
        const res = await BAUGMENT.auth.changePassword(cur, nu);
        if (!res.ok) { err.textContent = res.error; return; }
        BAUGMENT.ui.toast('Password changed', 'Use the new one next time you sign in.');
        render(el);
      });
    }

    /* --- Preferences --- */
    el.querySelectorAll('[data-s]').forEach((f) => f.addEventListener('change', () => {
      const k = f.getAttribute('data-s');
      const v = f.type === 'checkbox' ? f.checked : f.value;
      store.updateSettings({ [k]: v });
      if (k === 'theme') BAUGMENT.app.applyTheme(v);
      BAUGMENT.ui.toast('Saved', 'Preferences updated');
    }));

    /* --- Platforms --- */
    el.querySelectorAll('[data-live]').forEach((cb) => cb.addEventListener('change', () => {
      const on = Array.from(el.querySelectorAll('[data-live]')).filter((x) => x.checked).map((x) => x.getAttribute('data-live'));
      if (!on.length) { BAUGMENT.ui.toast('Keep at least one', 'Every picker in BAUGMENT needs one live platform.', 'warn'); cb.checked = true; return; }
      store.updateSettings({ livePlatforms: on });
      render(el);
    }));
    const newAccount = () => editAccount({
      id: U.uid('acc'), platform: (store.livePlatforms()[0] || S.PLATFORMS[0]).id,
      handle: '', name: '', followers: 0
    });
    ['#accNew', '#accEmptyNew'].forEach((sel) => {
      const b = el.querySelector(sel);
      if (b) b.addEventListener('click', newAccount);
    });
    el.querySelectorAll('[data-editacc]').forEach((b) => b.addEventListener('click', () => {
      const a = store.account(b.getAttribute('data-editacc'));
      if (a) editAccount(a);
    }));
    el.querySelectorAll('[data-hist]').forEach((b) => b.addEventListener('click', () =>
      followerHistory(b.getAttribute('data-hist'))));
    BAUGMENT.charts.bind(el);

    /* --- Custom metrics --- */
    const cmAdd = el.querySelector('#cmAdd');
    if (cmAdd) {
      cmAdd.addEventListener('click', () => {
        const label = el.querySelector('#cmLabel').value.trim();
        if (!label) { BAUGMENT.ui.toast('Name it first', 'A custom metric needs a label.', 'warn'); return; }
        const key = U.slug(label).replace(/-/g, '_');
        if (!store.addCustomMetric({ key, label, agg: el.querySelector('#cmAgg').value, fmt: el.querySelector('#cmFmt').value })) {
          BAUGMENT.ui.toast('Already exists', 'A metric with that key is already defined.', 'warn');
          return;
        }
        BAUGMENT.ui.toast('Metric added', label + ' is now available everywhere');
        render(el);
      });
      el.querySelectorAll('[data-delmetric]').forEach((b) => b.addEventListener('click', async () => {
        const key = b.getAttribute('data-delmetric');
        const ok = await BAUGMENT.ui.confirm('Remove this metric?', 'Stored values stay on the records but the column disappears from the UI.', 'Remove');
        if (!ok) return;
        store.removeCustomMetric(key);
        render(el);
      }));
    }

    /* --- Data --- */
    const backup = el.querySelector('#dataBackup');
    if (backup) {
      backup.addEventListener('click', () => {
        U.download('baugment-backup-' + U.iso(new Date()) + '.json', JSON.stringify(store.state(), null, 2), 'application/json');
        BAUGMENT.ui.toast('Backup downloaded', 'Keep it somewhere outside this browser');
      });
      const file = el.querySelector('#restoreFile');
      el.querySelector('#dataRestore').addEventListener('click', () => file.click());
      file.addEventListener('change', async () => {
        if (!file.files[0]) return;
        const ok = await BAUGMENT.ui.confirm('Restore from this backup?', 'Everything currently stored in BAUGMENT is replaced.', 'Restore');
        if (!ok) { file.value = ''; return; }
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            if (!data.analytics) throw new Error('shape');
            BAUGMENT.persist.set('db', data);
            BAUGMENT.ui.toast('Restored', 'Reloading with the restored data');
            setTimeout(() => window.location.reload(), 700);
          } catch (e) {
            BAUGMENT.ui.toast('That isn\'t a BAUGMENT backup', 'The file parsed but has no analytics records.', 'error');
          }
        };
        reader.readAsText(file.files[0]);
      });
      el.querySelector('#dataClearAll').addEventListener('click', () => clearDialog('all'));
      el.querySelector('#dataReset').addEventListener('click', async () => {
        const ok = await BAUGMENT.ui.confirm('Reset to demo data?',
          'Everything you have imported or edited is discarded and the demo set is rebuilt.', 'Reset');
        if (!ok) return;
        store.reset();
        BAUGMENT.ui.toast('Reset complete', 'Demo data rebuilt');
        BAUGMENT.app.render();
      });
    }
  }

  return {
    title: 'Settings',
    eyebrow: 'How BAUGMENT behaves',
    lede: 'Account, defaults, which platforms are live, and the data BAUGMENT is holding.',
    filters: false,
    render
  };
})();
