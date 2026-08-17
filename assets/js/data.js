/* BAUGMENT — data layer
   Schema, the metric registry (which is what makes custom metrics possible
   without a migration), the Buffer import dictionary, and the demo seed for
   PT Baugment Teknologi Edukasi. */

BAUGMENT.schema = (function () {

  /* --- Platforms ---------------------------------------------------------- */
  /* `live: false` platforms are wired end to end but hidden from the primary
     pickers until someone switches them on in Settings. */
  const PLATFORMS = [
    { id: 'instagram', name: 'Instagram', live: true,  metrics: ['impressions','reach','likes','comments','shares','saves','profile_visits','link_clicks','video_views','followers_gained','followers_lost'] },
    { id: 'linkedin',  name: 'LinkedIn',  live: true,  metrics: ['impressions','reach','reactions','comments','shares','link_clicks','followers_gained','followers_lost'] },
    { id: 'tiktok',    name: 'TikTok',    live: true,  metrics: ['views','video_views','watch_time','avg_watch_time','likes','comments','shares','saves','profile_visits','followers_gained','followers_lost'] },
    { id: 'youtube',   name: 'YouTube',   live: true,  metrics: ['views','video_views','watch_time','avg_watch_time','impressions','likes','comments','shares','link_clicks','followers_gained','followers_lost'] },
    { id: 'facebook',  name: 'Facebook',  live: false, metrics: ['impressions','reach','reactions','comments','shares','link_clicks'] },
    { id: 'threads',   name: 'Threads',   live: false, metrics: ['views','likes','replies','shares'] },
    { id: 'x',         name: 'X',         live: false, metrics: ['impressions','likes','replies','shares','bookmarks','link_clicks'] },
    { id: 'pinterest', name: 'Pinterest', live: false, metrics: ['impressions','saves','link_clicks'] }
  ];

  const platform = (id) => PLATFORMS.find((p) => p.id === id) || PLATFORMS[0];

  /* --- Metric registry ---------------------------------------------------- */
  /* group: how it clusters in the UI. agg: how a set of rows rolls up.
     Adding an entry here is all it takes to make a metric first-class across
     the table, the filters, the exporter and the chart pickers. */
  const METRICS = [
    { key: 'impressions',      label: 'Impressions',        group: 'performance', agg: 'sum',  fmt: 'int' },
    { key: 'reach',            label: 'Reach',              group: 'performance', agg: 'sum',  fmt: 'int' },
    { key: 'views',            label: 'Views',              group: 'performance', agg: 'sum',  fmt: 'int' },
    { key: 'video_views',      label: 'Video Views',        group: 'performance', agg: 'sum',  fmt: 'int' },
    { key: 'watch_time',       label: 'Watch Time',         group: 'performance', agg: 'sum',  fmt: 'duration' },
    { key: 'avg_watch_time',   label: 'Avg Watch Time',     group: 'performance', agg: 'mean', fmt: 'duration' },
    { key: 'engagements',      label: 'Engagements',        group: 'performance', agg: 'sum',  fmt: 'int' },
    { key: 'likes',            label: 'Likes',              group: 'performance', agg: 'sum',  fmt: 'int' },
    { key: 'comments',         label: 'Comments',           group: 'performance', agg: 'sum',  fmt: 'int' },
    { key: 'shares',           label: 'Shares',             group: 'performance', agg: 'sum',  fmt: 'int' },
    { key: 'saves',            label: 'Saves',              group: 'performance', agg: 'sum',  fmt: 'int' },
    { key: 'reactions',        label: 'Reactions',          group: 'performance', agg: 'sum',  fmt: 'int' },
    { key: 'replies',          label: 'Replies',            group: 'performance', agg: 'sum',  fmt: 'int' },
    { key: 'bookmarks',        label: 'Bookmarks',          group: 'performance', agg: 'sum',  fmt: 'int' },
    { key: 'link_clicks',      label: 'Link Clicks',        group: 'traffic',     agg: 'sum',  fmt: 'int' },
    { key: 'profile_visits',   label: 'Profile Visits',     group: 'traffic',     agg: 'sum',  fmt: 'int' },
    { key: 'ctr',              label: 'CTR',                group: 'traffic',     agg: 'calc', fmt: 'pct' },
    { key: 'engagement_rate',  label: 'Engagement Rate',    group: 'traffic',     agg: 'calc', fmt: 'pct' },
    { key: 'followers_gained', label: 'Followers Gained',   group: 'audience',    agg: 'sum',  fmt: 'int' },
    { key: 'followers_lost',   label: 'Followers Lost',     group: 'audience',    agg: 'sum',  fmt: 'int' },
    { key: 'net_followers',    label: 'Net Followers',      group: 'audience',    agg: 'calc', fmt: 'int' }
  ];

  const GROUPS = { performance: 'Performance', traffic: 'Traffic', audience: 'Audience', custom: 'Custom' };

  const MEDIA_TYPES = ['Image', 'Carousel', 'Reel', 'Video', 'Story', 'Text', 'Live', 'Document'];
  const CONTENT_TYPES = ['Organic', 'Paid', 'Boosted', 'Collaboration', 'Repost'];
  const POST_STATUS = ['published', 'scheduled', 'draft', 'review', 'archived'];
  const CAMPAIGN_STATUS = ['active', 'planned', 'completed', 'paused'];
  const PRIORITIES = ['high', 'medium', 'low'];
  /* B2B learning has no walk-in trade — where a retail brand tracks
     Footfall, Baugment tracks Leads. */
  const OBJECTIVES = ['Awareness', 'Engagement', 'Traffic', 'Leads', 'Sales', 'Retention', 'Recruitment'];

  /* --- Idea Bank ----------------------------------------------------------- */
  /* An idea moves left to right and stops: raw → developing → ready → used.
     Parked is the honest place for something good that isn't for now. */
  const IDEA_STATUS = ['raw', 'developing', 'ready', 'used', 'parked'];
  const IDEA_STATUS_LABEL = {
    raw: 'Raw', developing: 'Developing', ready: 'Ready', used: 'Used', parked: 'Parked'
  };
  const IDEA_POTENTIAL = ['high', 'medium', 'low'];
  const IDEA_SOURCES = ['Brainstorm', 'Client question', 'Sales call', 'Comment / DM',
    'Competitor', 'Industry news', 'Webinar', 'Internal team', 'Search data', 'Repurpose'];

  /* --- Derived metrics ---------------------------------------------------- */
  function engagements(r) {
    if (r.engagements != null) return r.engagements;
    return (r.likes || 0) + (r.comments || 0) + (r.shares || 0) + (r.saves || 0) +
           (r.reactions || 0) + (r.replies || 0) + (r.bookmarks || 0);
  }
  function denom(r) { return r.reach || r.impressions || r.views || 0; }
  function engagementRate(r) { const d = denom(r); return d ? (engagements(r) / d) * 100 : 0; }
  function ctr(r) { const d = r.impressions || r.reach || r.views || 0; return d ? ((r.link_clicks || 0) / d) * 100 : 0; }
  function netFollowers(r) { return (r.followers_gained || 0) - (r.followers_lost || 0); }

  function metricValue(r, key) {
    if (key === 'engagements') return engagements(r);
    if (key === 'engagement_rate') return engagementRate(r);
    if (key === 'ctr') return ctr(r);
    if (key === 'net_followers') return netFollowers(r);
    if (r.custom && r.custom[key] != null) return Number(r.custom[key]) || 0;
    return Number(r[key]) || 0;
  }

  /* Roll a set of rows up on one metric, honouring its aggregation rule. */
  function rollup(rows, key) {
    if (!rows.length) return 0;
    if (key === 'engagement_rate') {
      const d = rows.reduce((a, r) => a + denom(r), 0);
      return d ? (rows.reduce((a, r) => a + engagements(r), 0) / d) * 100 : 0;
    }
    if (key === 'ctr') {
      const d = rows.reduce((a, r) => a + (r.impressions || r.reach || r.views || 0), 0);
      return d ? (rows.reduce((a, r) => a + (r.link_clicks || 0), 0) / d) * 100 : 0;
    }
    const def = METRICS.find((m) => m.key === key);
    const vals = rows.map((r) => metricValue(r, key));
    if (def && def.agg === 'mean') return vals.reduce((a, b) => a + b, 0) / rows.length;
    return vals.reduce((a, b) => a + b, 0);
  }

  function formatMetric(key, v) {
    const def = METRICS.find((m) => m.key === key);
    const f = def ? def.fmt : 'int';
    if (f === 'pct') return BAUGMENT.util.fmt.pct(v);
    if (f === 'duration') return BAUGMENT.util.fmt.duration(v);
    return BAUGMENT.util.fmt.int(v);
  }

  return {
    PLATFORMS, platform, METRICS, GROUPS, MEDIA_TYPES, CONTENT_TYPES,
    POST_STATUS, CAMPAIGN_STATUS, PRIORITIES, OBJECTIVES,
    IDEA_STATUS, IDEA_STATUS_LABEL, IDEA_POTENTIAL, IDEA_SOURCES,
    engagements, engagementRate, ctr, netFollowers, metricValue, rollup, formatMetric
  };
})();


/* ========================================================================== */
/* Buffer import dictionary                                                   */
/* ========================================================================== */

BAUGMENT.buffer = (function () {
  /* Buffer's analytics export has moved around across their Publish and
     Analyze products, so each field lists every header we've seen point at it.
     Matching is case- and punctuation-insensitive. */
  const ALIASES = {
    published_date:   ['date', 'sent date', 'post date', 'published date', 'publish date', 'date sent', 'created at', 'sent at', 'time', 'datetime', 'date and time'],
    published_time:   ['post time', 'published time', 'publish time', 'time of day', 'send time'],
    platform:         ['service', 'channel type', 'network', 'platform', 'social network', 'channel service'],
    account:          ['channel', 'profile', 'account', 'channel name', 'profile name', 'social account', 'page'],
    post_id:          ['post id', 'id', 'update id', 'external id', 'media id'],
    post_url:         ['post url', 'url', 'link', 'permalink', 'post link', 'service link'],
    caption:          ['text', 'post text', 'caption', 'content', 'message', 'post content', 'copy'],
    media_type:       ['type', 'post type', 'media type', 'format', 'content format'],
    content_type:     ['content type', 'source', 'origin', 'post source'],
    impressions:      ['impressions', 'impression', 'post impressions', 'total impressions'],
    reach:            ['reach', 'post reach', 'accounts reached', 'unique reach', 'people reached'],
    views:            ['views', 'post views', 'total views', 'plays'],
    video_views:      ['video views', 'video view', 'views (video)', 'video plays', '3-second views'],
    watch_time:       ['watch time', 'total watch time', 'minutes viewed', 'watch time (seconds)'],
    avg_watch_time:   ['average watch time', 'avg watch time', 'avg. view duration', 'average view duration'],
    engagements:      ['engagements', 'engagement', 'total engagements', 'interactions'],
    engagement_rate:  ['engagement rate', 'engagement rate (%)', 'eng rate', 'er'],
    likes:            ['likes', 'like', 'favorites', 'hearts'],
    comments:         ['comments', 'comment', 'replies count'],
    shares:           ['shares', 'share', 'retweets', 'reposts'],
    saves:            ['saves', 'save', 'saved', 'bookmarks count'],
    reactions:        ['reactions', 'reaction', 'total reactions'],
    replies:          ['replies', 'reply'],
    bookmarks:        ['bookmarks', 'bookmark'],
    link_clicks:      ['clicks', 'link clicks', 'url clicks', 'website clicks', 'post clicks'],
    profile_visits:   ['profile visits', 'profile views', 'profile clicks', 'profile actions'],
    followers_gained: ['followers gained', 'new followers', 'follows', 'followers added'],
    followers_lost:   ['followers lost', 'unfollows', 'followers removed'],
    campaign:         ['campaign', 'campaign name', 'tag', 'tags', 'label'],
    pillar:           ['content pillar', 'pillar', 'category', 'theme'],
    utm_source:       ['utm source', 'utm_source'],
    utm_medium:       ['utm medium', 'utm_medium'],
    utm_campaign:     ['utm campaign', 'utm_campaign'],
    hashtags:         ['hashtags', 'hashtag', 'tags used'],
    mentions:         ['mentions', 'mention'],
    location:         ['location', 'place', 'geo'],
    author:           ['author', 'created by', 'owner', 'user'],
    status:           ['status', 'state'],
    notes:            ['notes', 'note', 'comment (internal)']
  };

  /* Every target the mapper can assign a column to, in display order. */
  const TARGETS = [
    { key: 'published_date', label: 'Published Date', kind: 'date', required: true },
    { key: 'published_time', label: 'Published Time', kind: 'time' },
    { key: 'platform', label: 'Platform', kind: 'enum', required: true },
    { key: 'account', label: 'Social Account', kind: 'text' },
    { key: 'post_id', label: 'Post ID', kind: 'text' },
    { key: 'post_url', label: 'Post URL', kind: 'text' },
    { key: 'caption', label: 'Caption', kind: 'text' },
    { key: 'media_type', label: 'Media Type', kind: 'text' },
    { key: 'content_type', label: 'Content Type', kind: 'text' },
    { key: 'status', label: 'Status', kind: 'text' },
    { key: 'campaign', label: 'Campaign', kind: 'text' },
    { key: 'pillar', label: 'Content Pillar', kind: 'text' },
    { key: 'author', label: 'Author', kind: 'text' },
    { key: 'impressions', label: 'Impressions', kind: 'number' },
    { key: 'reach', label: 'Reach', kind: 'number' },
    { key: 'views', label: 'Views', kind: 'number' },
    { key: 'video_views', label: 'Video Views', kind: 'number' },
    { key: 'watch_time', label: 'Watch Time (sec)', kind: 'number' },
    { key: 'avg_watch_time', label: 'Avg Watch Time (sec)', kind: 'number' },
    { key: 'engagements', label: 'Engagements', kind: 'number' },
    { key: 'likes', label: 'Likes', kind: 'number' },
    { key: 'comments', label: 'Comments', kind: 'number' },
    { key: 'shares', label: 'Shares', kind: 'number' },
    { key: 'saves', label: 'Saves', kind: 'number' },
    { key: 'reactions', label: 'Reactions', kind: 'number' },
    { key: 'replies', label: 'Replies', kind: 'number' },
    { key: 'bookmarks', label: 'Bookmarks', kind: 'number' },
    { key: 'link_clicks', label: 'Link Clicks', kind: 'number' },
    { key: 'profile_visits', label: 'Profile Visits', kind: 'number' },
    { key: 'followers_gained', label: 'Followers Gained', kind: 'number' },
    { key: 'followers_lost', label: 'Followers Lost', kind: 'number' },
    { key: 'utm_source', label: 'UTM Source', kind: 'text' },
    { key: 'utm_medium', label: 'UTM Medium', kind: 'text' },
    { key: 'utm_campaign', label: 'UTM Campaign', kind: 'text' },
    { key: 'hashtags', label: 'Hashtags', kind: 'text' },
    { key: 'mentions', label: 'Mentions', kind: 'text' },
    { key: 'location', label: 'Location', kind: 'text' },
    { key: 'notes', label: 'Notes', kind: 'text' }
  ];

  const norm = (s) => String(s || '').toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ').trim();

  /* Returns { header -> targetKey|'' } plus a confidence note per column. */
  function autoMap(headers, customKeys) {
    const map = {};
    const taken = new Set();
    headers.forEach((h) => {
      const n = norm(h);
      let hit = '';
      for (const key in ALIASES) {
        if (taken.has(key)) continue;
        if (ALIASES[key].indexOf(n) !== -1) { hit = key; break; }
      }
      if (!hit) {
        for (const key in ALIASES) {
          if (taken.has(key)) continue;
          if (ALIASES[key].some((a) => n.indexOf(a) !== -1 || a.indexOf(n) !== -1)) { hit = key; break; }
        }
      }
      if (!hit && customKeys && customKeys.indexOf(n) !== -1) hit = 'custom:' + n;
      if (hit && hit.indexOf('custom:') !== 0) taken.add(hit);
      map[h] = hit;
    });
    return map;
  }

  /* Buffer writes the network in a handful of spellings. */
  function normalisePlatform(v) {
    const n = norm(v);
    if (!n) return '';
    if (n.indexOf('insta') === 0 || n === 'ig') return 'instagram';
    if (n.indexOf('tiktok') === 0 || n === 'tt') return 'tiktok';
    if (n.indexOf('you') === 0 || n === 'yt' || n.indexOf('shorts') !== -1) return 'youtube';
    if (n.indexOf('linked') === 0 || n === 'li') return 'linkedin';
    if (n.indexOf('face') === 0 || n === 'fb') return 'facebook';
    if (n.indexOf('thread') === 0) return 'threads';
    if (n === 'x' || n.indexOf('twitter') === 0) return 'x';
    if (n.indexOf('pin') === 0) return 'pinterest';
    return n;
  }

  function parseNumber(v) {
    if (v == null || v === '') return null;
    const s = String(v).replace(/[,\s]/g, '').replace(/%$/, '');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  /* Accepts ISO, DD/MM/YYYY, MM/DD/YYYY, "12 Mar 2026" and Excel serials. */
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v))) {
      const serial = Number(v);
      if (serial > 20000 && serial < 60000) {
        const ms = Math.round((serial - 25569) * 86400000);
        return BAUGMENT.util.iso(new Date(ms));
      }
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
    if (m) {
      /* > 12 in the first slot can only be a day, otherwise assume DD/MM. */
      const a = +m[1], b = +m[2];
      const d = a > 12 ? a : a, mo = a > 12 ? b : b;
      return m[3] + '-' + BAUGMENT.util.pad(mo) + '-' + BAUGMENT.util.pad(d);
    }
    const parsed = new Date(s);
    return isNaN(parsed) ? null : BAUGMENT.util.iso(parsed);
  }

  function parseTime(v) {
    if (!v) return null;
    const m = String(v).match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    let h = +m[1];
    if (/pm/i.test(v) && h < 12) h += 12;
    if (/am/i.test(v) && h === 12) h = 0;
    return BAUGMENT.util.pad(h) + ':' + m[2];
  }

  return { ALIASES, TARGETS, autoMap, normalisePlatform, parseNumber, parseDate, parseTime, norm };
})();


/* ========================================================================== */
/* Seed — PT Baugment Teknologi Edukasi, Graha Mampang Lt.3, Jakarta Selatan   */
/* ========================================================================== */

BAUGMENT.seed = (function () {
  const U = BAUGMENT.util;

  /* B2B corporate learning: LinkedIn and Instagram carry the audience,
     YouTube holds the long-form, TikTok is the newest and smallest. */
  const ACCOUNTS = [
    { id: 'acc_li', platform: 'linkedin',  handle: 'baugment',            name: 'Baugment',            followers: 18600 },
    { id: 'acc_ig', platform: 'instagram', handle: '@baugmentinstitute',  name: 'Baugment Institute',  followers: 15200 },
    { id: 'acc_yt', platform: 'youtube',   handle: '@baugment',           name: 'Baugment',            followers: 6400 },
    { id: 'acc_tt', platform: 'tiktok',    handle: '@baugmentinstitute',  name: 'Baugment Institute',  followers: 3600 }
  ];

  const PILLARS = [
    ['Learning Insight',      'Research, benchmarks and data on how people actually learn at work.'],
    ['Instructional Design',  'Craft posts: storyboarding, scripting, assessment design, cognitive load.'],
    ['Case Study',            'A client problem, what we built, and the number that moved.'],
    ['Course Spotlight',      'One programme, what it covers, and who it is genuinely for.'],
    ['L&D Leadership',        'Budgeting, stakeholder buy-in, and proving training worth to the board.'],
    ['Learning Technology',   'LMS, LXP, authoring tools and the integrations that hold them together.'],
    ['AI in Learning',        'Where AI helps an L&D team today, and where it quietly does not.'],
    ['Facilitator Craft',     'Running a room — virtual or physical — so people stay awake and take part.'],
    ['Employee Experience',   'Onboarding, career paths and the everyday moments learning touches.'],
    ['Measurement',           'Kirkpatrick, learning analytics, and reporting that survives scrutiny.'],
    ['Microlearning',         'Short-format design: what fits in five minutes and what never will.'],
    ['Behind The Build',      'How a Baugment module gets made, from kick-off to launch.'],
    ['Client Voice',          'Testimonials, quotes and reposts from the teams we work with.'],
    ['Event & Webinar',       'Announcements, live sessions, recaps and the slides afterwards.'],
    ['Certification',         'Programme completions, credentials, and what they actually certify.'],
    ['Team & Culture',        'The people at Graha Mampang and how Baugment works internally.'],
    ['Industry News',         'What changed in corporate learning this month, and why it matters.'],
    ['Practical Toolkit',     'Templates, checklists and frameworks people can use on Monday.'],
    ['Hiring',                'Roles open at Baugment and what it is like to work here.'],
    ['Announcement',          'Product releases, partnerships and anything operational.']
  ];

  /* What Baugment sells and teaches — the subject of most posts. */
  const TOPICS = [
    'E-Learning Development Masterclass', 'Instructional Design Fundamentals', 'LMS Implementation Sprint',
    'Microlearning Design Lab', 'Training Needs Analysis Workshop', 'Leadership Essentials Programme',
    'Data Literacy for Managers', 'AI for L&D Teams', 'Blended Learning Design',
    'Virtual Facilitation Skills', 'Kirkpatrick Evaluation Clinic', 'Learning Analytics Bootcamp',
    'Onboarding Journey Design', 'Digital Content Production', 'Storyboarding for E-Learning',
    'Gamification Workshop', 'Coaching for Managers', 'Change Management Programme',
    'Corporate Trainer Certification', 'Learning Strategy Intensive'
  ];

  const CAPTION_SHAPES = [
    (m) => m + ' opens for its next cohort. Sixteen hours, live, capped at twenty seats so everyone gets airtime.',
    (m) => 'Most L&D teams already know what to teach. ' + m + ' is about making it land.',
    (m) => 'Three things participants told us they changed the week after ' + m + '. Full write-up at the link.',
    (m) => 'We rebuilt ' + m + ' this quarter around what the last four cohorts asked for. Here is what moved.',
    (m) => 'Question we get most often about ' + m + ': how do you measure it? Short answer in the carousel.',
    (m) => 'A snapshot from ' + m + ' with a client team in Jakarta this week.',
    (m) => 'If your completion rate is high and your behaviour change is not, ' + m + ' is the gap.',
    (m) => 'New on the calendar: ' + m + '. Public cohort, and available in-house for teams of eight or more.',
    (m) => 'What we learned running ' + m + ' twelve times in a year — the honest version.',
    (m) => m + ', condensed into one page. Save it for your next planning session.'
  ];

  const HASHTAG_POOL = ['#baugment', '#digitallearning', '#corporatetraining', '#learninganddevelopment',
    '#elearning', '#instructionaldesign', '#pelatihankaryawan', '#pengembangansdm', '#microlearning',
    '#lms', '#hrindonesia', '#belajardigital', '#learningdesign', '#trainingkaryawan', '#upskilling'];

  const AUTHORS = ['Rina', 'Fajar', 'Aditya', 'Sarah', 'Bima'];

  const CAMPAIGN_SEEDS = [
    ['E-Learning Masterclass Q1', 'Leads'], ['Instructional Design Cohort 12', 'Sales'],
    ['LMS Migration Series', 'Awareness'], ['AI for L&D Launch', 'Awareness'],
    ['Learning Analytics Bootcamp', 'Leads'], ['Ramadan Micro Sessions', 'Engagement'],
    ['Corporate Trainer Certification', 'Sales'], ['Onboarding Redesign Push', 'Leads'],
    ['Client Case Study Series', 'Awareness'], ['Free Webinar Wednesdays', 'Leads'],
    ['Learning Strategy Intensive', 'Sales'], ['Hiring Instructional Designers', 'Recruitment'],
    ['Kirkpatrick Clinic', 'Engagement'], ['Toolkit Download Drive', 'Leads'],
    ['LinkedIn Thought Leadership', 'Awareness'], ['Manager Coaching Programme', 'Sales'],
    ['Gamification Workshop Q2', 'Leads'], ['Blended Learning Playbook', 'Traffic'],
    ['Enterprise Renewal Push', 'Retention'], ['Alumni Community Launch', 'Retention'],
    ['Data Literacy for Managers', 'Sales'], ['Virtual Facilitation Series', 'Engagement'],
    ['Annual Learning Report', 'Awareness'], ['Partner Co-Marketing', 'Awareness'],
    ['Back To Office Learning', 'Leads'], ['Q3 Always On', 'Awareness'],
    ['Microlearning Challenge', 'Engagement'], ['Storyboarding Shorts', 'Engagement'],
    ['Behind The Build Series', 'Engagement'], ['HR Summit Jakarta', 'Leads'],
    ['Certification Alumni Spotlight', 'Retention'], ['Public Cohort September', 'Sales'],
    ['Enterprise Demo Requests', 'Leads'], ['Learning Tech Stack Review', 'Traffic'],
    ['Employer Brand Refresh', 'Recruitment'], ['Change Management Launch', 'Sales'],
    ['Year End Training Budget', 'Leads'], ['New Year Skills Reset', 'Awareness'],
    ['Indonesia L&D Benchmark', 'Awareness'], ['Course Bundle Promo', 'Sales'],
    ['YouTube Long Form Pilot', 'Awareness'], ['TikTok Explainer Series', 'Awareness'],
    ['Newsletter Growth Push', 'Leads'], ['Referral Programme', 'Sales'],
    ['Trainer Takeover Week', 'Engagement'], ['Compliance Training Refresh', 'Sales'],
    ['Graduate Programme Design', 'Leads'], ['Leadership Essentials Relaunch', 'Sales'],
    ['Client Renewal Stories', 'Retention'], ['Learning Week Jakarta', 'Awareness']
  ];

  /* --- Idea Bank seed ------------------------------------------------------ */
  /* Deliberately uneven: most ideas are one raw line, a few are worked up.
     That is what a real idea bank looks like a month in. */
  const IDEA_SEEDS = [
    ['Why 80% of compliance training is forgotten in a week', 'Pull the Ebbinghaus curve, then show the spaced-repetition fix we use on the compliance rebuilds. Carousel, six slides, one chart.', 'ready', 'high', 'Brainstorm', 'linkedin'],
    ['Teardown: a real client LMS dashboard, anonymised', 'Screen-record, blur the logo, narrate what is useful and what is vanity. Needs client sign-off first.', 'developing', 'high', 'Client question', 'youtube'],
    ['"We already have Udemy" — how to answer that objection', 'Sales hear this weekly. Turn the actual answer into a post rather than a script only sales sees.', 'ready', 'high', 'Sales call', 'linkedin'],
    ['The five-minute module myth', 'Microlearning is not just shorter. What genuinely fits in five minutes vs what gets mangled.', 'developing', 'medium', 'Brainstorm', 'instagram'],
    ['Instructional designer desk tour', 'Light, human, shows the team. Reel.', 'raw', 'low', 'Internal team', 'instagram'],
    ['Kirkpatrick Level 3 without a survey', 'Behaviour change measured from system data instead of self-report. Strong for the Measurement pillar.', 'ready', 'high', 'Webinar', 'linkedin'],
    ['What an L&D budget actually gets spent on', 'Benchmark data for Indonesian mid-size firms. Need a source we can cite.', 'developing', 'medium', 'Industry news', 'linkedin'],
    ['Storyboard a module live, in 60 seconds', 'Timelapse of a whiteboard to storyboard. Good TikTok, cuts down to a Reel.', 'ready', 'medium', 'Brainstorm', 'tiktok'],
    ['AI wrote our course outline. Here is what it got wrong.', 'Honest, specific, no hype. Fits the brand voice and the AI in Learning pillar.', 'developing', 'high', 'Internal team', 'linkedin'],
    ['Three questions to ask before buying an LMS', 'Evergreen. Could be a downloadable one-pager too.', 'ready', 'high', 'Client question', 'instagram'],
    ['Alumni check-in: six months after certification', 'Interview two alumni. Needs scheduling.', 'developing', 'medium', 'Repurpose', 'youtube'],
    ['Why your onboarding ends too early', 'Most onboarding stops at day 30. Argue for 180.', 'raw', 'medium', 'Brainstorm', 'linkedin'],
    ['Facilitator hand signals for virtual rooms', 'Small, practical, very saveable. Carousel.', 'raw', 'medium', 'Internal team', 'instagram'],
    ['Cost of a bad training day, calculated', 'Salary x headcount x hours. Simple maths, uncomfortable number.', 'ready', 'high', 'Sales call', 'linkedin'],
    ['Behind the build: the LMS migration sprint', 'Weekly diary format, four parts.', 'developing', 'medium', 'Internal team', 'instagram'],
    ['Reading list for new L&D managers', 'Ten books, one line each. Low effort, reliably shared.', 'raw', 'low', 'Brainstorm', 'linkedin'],
    ['Poll: what kills a training programme fastest?', 'Engagement bait that is actually useful — the answers feed a follow-up post.', 'ready', 'medium', 'Brainstorm', 'linkedin'],
    ['Explain cognitive load to a CFO', 'Translate the theory into money. Hard to write, worth it.', 'developing', 'high', 'Sales call', 'linkedin'],
    ['Our worst-performing module and what we changed', 'Vulnerable, on-brand, builds trust. Needs internal approval.', 'parked', 'high', 'Internal team', 'linkedin'],
    ['Template: training needs analysis in one page', 'Gated download. Ties to the Toolkit Download Drive campaign.', 'ready', 'high', 'Search data', 'instagram'],
    ['Day in the life: corporate trainer in Jakarta', 'Follow one facilitator through a client day.', 'raw', 'medium', 'Brainstorm', 'tiktok'],
    ['Why completion rate is a vanity metric', 'Pairs with the Kirkpatrick post. Could be a two-part series.', 'developing', 'high', 'Webinar', 'linkedin'],
    ['Glossary: LMS vs LXP vs LRS', 'People ask constantly. Evergreen carousel.', 'ready', 'medium', 'Comment / DM', 'instagram'],
    ['Client Q&A: how do you train a hybrid team?', 'Answer a real DM publicly, with permission.', 'raw', 'medium', 'Comment / DM', 'linkedin'],
    ['Comparison: build in-house or buy off the shelf', 'Decision matrix. Sales-adjacent but genuinely balanced.', 'developing', 'high', 'Sales call', 'linkedin'],
    ['What competitors get right about their webinars', 'Internal research first, then decide if it is publishable.', 'parked', 'low', 'Competitor', 'linkedin'],
    ['Learning analytics dashboard, from scratch', 'Long-form YouTube. Big effort, long shelf life.', 'developing', 'high', 'Brainstorm', 'youtube'],
    ['One slide, one idea: the rule we never break', 'Short, opinionated, very shareable.', 'ready', 'medium', 'Internal team', 'instagram'],
    ['Gamification without the leaderboard', 'Leaderboards demotivate the bottom half. Alternatives that work.', 'raw', 'medium', 'Industry news', 'linkedin'],
    ['How we scope a project in the first call', 'Process transparency. Attracts the right enquiries.', 'raw', 'medium', 'Sales call', 'linkedin'],
    ['Subtitles are not accessibility', 'Short, corrective, likely to spark discussion.', 'raw', 'low', 'Comment / DM', 'linkedin'],
    ['Mini-series: five L&D metrics that matter', 'Five posts, one per metric, one week.', 'developing', 'high', 'Brainstorm', 'linkedin'],
    ['Office tour, Graha Mampang', 'Recruitment-facing. Easy Reel.', 'raw', 'low', 'Internal team', 'instagram'],
    ['Translate a policy document into a module', 'Before/after. Shows the craft better than any claim.', 'ready', 'high', 'Brainstorm', 'instagram'],
    ['What "blended" means in practice, not in slides', 'Kill the buzzword, replace it with a schedule.', 'raw', 'medium', 'Brainstorm', 'linkedin'],
    ['Ask an ID: rapid-fire questions', 'Sixty seconds, ten questions. Series potential.', 'developing', 'medium', 'Internal team', 'tiktok'],
    ['Annual Indonesia L&D benchmark — call for responses', 'Needs the survey built first. Tied to the report campaign.', 'developing', 'high', 'Internal team', 'linkedin'],
    ['Why we stopped using stock photos of handshakes', 'Brand voice post. Light and specific.', 'raw', 'low', 'Brainstorm', 'instagram'],
    ['Prompt library for L&D teams', 'Practical AI, no hype. Strong download candidate.', 'ready', 'high', 'Search data', 'linkedin'],
    ['Recap: HR Summit Jakarta in six slides', 'Only works within a week of the event.', 'raw', 'medium', 'Industry news', 'instagram'],
    ['The handover problem between trainer and manager', 'Training ends, manager does not reinforce. Name the gap.', 'raw', 'high', 'Client question', 'linkedin'],
    ['Redesign a bad slide, live', 'Recurring format. Endless material.', 'developing', 'medium', 'Brainstorm', 'youtube'],
    ['What certification does and does not prove', 'Honest post about the limits of our own product.', 'parked', 'medium', 'Internal team', 'linkedin'],
    ['Search: what Indonesians actually google about training', 'Pull search data, turn the top ten into a content plan.', 'ready', 'high', 'Search data', 'linkedin']
  ];

  function buildMedia(r) {
    const names = ['masterclass-cohort-12', 'id-fundamentals-carousel', 'lms-dashboard-demo', 'jakarta-workshop-room',
      'storyboard-timelapse', 'client-case-mandiri', 'kirkpatrick-explainer', 'webinar-wednesday-cover',
      'course-catalogue-2026', 'learning-analytics-deck', 'graha-mampang-office', 'trainer-fajar-portrait',
      'brand-pattern-royal', 'certificate-template', 'microlearning-shorts', 'ai-for-lnd-thumbnail',
      'team-offsite-2026', 'onboarding-journey-map', 'facilitation-live-set', 'benchmark-report-cover'];
    const kinds = ['image', 'video', 'document'];
    const out = [];
    names.forEach((n, i) => {
      const kind = kinds[i % 3 === 2 && i % 6 === 5 ? 2 : (i % 3 === 1 ? 1 : 0)];
      out.push({
        id: 'med_' + (i + 1),
        name: n + (kind === 'video' ? '.mp4' : kind === 'document' ? '.pdf' : '.jpg'),
        kind,
        tags: [U.pick(['course', 'client', 'team', 'brand', 'event'], r), U.pick(['2025', '2026'], r)],
        category: U.pick(['Course', 'Client', 'Team', 'Campaign'], r),
        size: Math.round(180 + r() * 4200) * 1024,
        width: kind === 'video' ? 1080 : 1440,
        height: kind === 'video' ? 1920 : 1080,
        hue: Math.round(212 + r() * 26),      /* the royal-blue end of the wheel */
        uploaded: U.iso(U.addDays(new Date(), -Math.round(r() * 300))),
        source: 'seed'
      });
    });
    return out;
  }

  function build() {
    const r = U.rng(0x1B4FD8);          /* Royal Blue, as a number */
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    /* Pillars */
    const pillars = PILLARS.map((p, i) => ({
      id: 'pil_' + (i + 1),
      name: p[0],
      description: p[1],
      color: BAUGMENT.charts.PALETTE[i % BAUGMENT.charts.PALETTE.length],
      target_share: Math.round((100 / PILLARS.length) * 10) / 10,
      source: 'seed'
    }));

    /* Campaigns */
    const campaigns = CAMPAIGN_SEEDS.map((c, i) => {
      const start = U.addDays(today, -Math.round(340 - i * 6.4));
      const len = 10 + Math.round(r() * 46);
      const end = U.addDays(start, len);
      const status = end < today ? (r() > 0.12 ? 'completed' : 'paused')
        : start > today ? 'planned' : 'active';
      const kpiMetric = U.pick(['reach', 'engagements', 'impressions', 'link_clicks'], r);
      return {
        id: 'cmp_' + (i + 1),
        name: c[0],
        objective: c[1],
        start: U.iso(start),
        end: U.iso(end),
        budget: r() > 0.42 ? Math.round((2000 + r() * 22000)) * 1000 : null,
        platforms: ['linkedin', 'instagram', 'youtube', 'tiktok'].filter(() => r() > 0.38).slice(0, 3),
        kpi_metric: kpiMetric,
        kpi_target: Math.round((kpiMetric === 'link_clicks' ? 900 : 26000) * (0.5 + r() * 1.8)),
        status,
        owner: U.pick(AUTHORS, r),
        notes: '',
        source: 'seed'
      };
    });
    campaigns.forEach((c) => { if (!c.platforms.length) c.platforms = ['linkedin']; });

    /* Analytics — 500 published posts across the last ~12 months */
    const analytics = [];
    const baseReach = { linkedin: 6800, instagram: 5200, youtube: 2900, tiktok: 7400 };
    const weights = ['linkedin', 'linkedin', 'linkedin', 'linkedin', 'linkedin',
      'instagram', 'instagram', 'instagram', 'instagram',
      'youtube', 'youtube', 'tiktok', 'tiktok'];

    for (let i = 0; i < 500; i++) {
      /* Slightly weighted toward recent days: the account has been posting a
         little more each quarter, which is what the deltas should show. */
      const daysAgo = Math.round(Math.pow(r(), 1.12) * 360);
      const d = U.addDays(today, -daysAgo);
      const platform = U.pick(weights, r);
      const acc = ACCOUNTS.find((a) => a.platform === platform);
      const pillar = U.pick(pillars, r);
      const topic = U.pick(TOPICS, r);
      const dow = (d.getDay() + 6) % 7;

      /* A B2B audience is at a desk: nothing before 06.00, little after 21.00. */
      const hour = 6 + Math.floor(r() * 15);
      const minute = U.pick([0, 5, 15, 30, 45], r);

      /* A corporate audience reads at work: midweek wins, weekends collapse. */
      const dayLift = [1.12, 1.26, 1.24, 1.14, 0.96, 0.58, 0.62][dow];
      const hourLift = (hour >= 7 && hour <= 9) ? 1.32
        : (hour >= 11 && hour <= 13) ? 1.18
        : (hour >= 16 && hour <= 18) ? 1.06
        : 0.78;
      const mediaType = platform === 'youtube' ? U.pick(['Video', 'Video', 'Reel'], r)
        : platform === 'tiktok' ? 'Reel'
        : platform === 'linkedin' ? U.pick(['Carousel', 'Carousel', 'Text', 'Image', 'Document', 'Video'], r)
        : U.pick(['Carousel', 'Carousel', 'Image', 'Reel', 'Story'], r);
      /* Carousels and documents are what a professional audience saves. */
      const formatLift = mediaType === 'Carousel' ? 1.42 : mediaType === 'Document' ? 1.34
        : mediaType === 'Reel' ? 1.30 : mediaType === 'Story' ? 0.52 : 1;

      /* Steady growth over the year, plus a fat tail for the odd post that
         escapes the follower graph entirely. */
      const growth = 0.58 + (1 - daysAgo / 360) * 0.90;
      const viral = r() > 0.965 ? 4 + r() * 9 : 1;

      const reach = Math.round(baseReach[platform] * dayLift * hourLift * formatLift * growth * viral * (0.55 + r() * 0.95));
      const impressions = Math.round(reach * (1.16 + r() * 0.5));
      const isVideo = mediaType === 'Reel' || mediaType === 'Video';
      const views = isVideo ? Math.round(reach * (1.05 + r() * 0.55)) : 0;
      const erBase = platform === 'tiktok' ? 0.055 : platform === 'instagram' ? 0.038 : platform === 'youtube' ? 0.032 : 0.030;
      const eng = Math.round(reach * erBase * (0.5 + r() * 1.4));

      const isLinkedIn = platform === 'linkedin';
      const likes = isLinkedIn ? 0 : Math.round(eng * (0.66 + r() * 0.14));
      const reactions = isLinkedIn ? Math.round(eng * (0.74 + r() * 0.10)) : 0;
      const comments = Math.round(eng * (0.06 + r() * 0.06));
      const shares = Math.round(eng * (0.05 + r() * 0.06));
      const saves = isLinkedIn ? 0 : Math.round(eng * (0.07 + r() * 0.09));
      const rest = Math.max(0, eng - likes - comments - shares - saves - reactions);

      const activeCampaigns = campaigns.filter((c) => c.start <= U.iso(d) && c.end >= U.iso(d) && c.platforms.indexOf(platform) !== -1);
      const campaign = activeCampaigns.length && r() > 0.32 ? U.pick(activeCampaigns, r) : null;

      const tagCount = 3 + Math.floor(r() * 5);
      const hashtags = [];
      while (hashtags.length < tagCount) {
        const t = U.pick(HASHTAG_POOL, r);
        if (hashtags.indexOf(t) === -1) hashtags.push(t);
      }

      const wt = isVideo ? Math.round(views * (5 + r() * 22)) : 0;

      analytics.push({
        id: 'ana_' + (i + 1),
        platform,
        account_id: acc.id,
        account: acc.handle,
        post_id: platform.slice(0, 2).toUpperCase() + '-' + (100000 + Math.floor(r() * 899999)),
        post_url: 'https://' + platform + '.com/baugment/p/' + Math.random().toString(36).slice(2, 11),
        caption: U.pick(CAPTION_SHAPES, r)(topic),
        media_type: mediaType,
        content_type: campaign && r() > 0.74 ? U.pick(['Boosted', 'Paid'], r) : U.pick(['Organic', 'Organic', 'Organic', 'Collaboration', 'Repost'], r),
        status: 'published',
        published_date: U.iso(d),
        published_time: U.pad(hour) + ':' + U.pad(minute),
        pillar_id: pillar.id,
        campaign_id: campaign ? campaign.id : null,
        author: U.pick(AUTHORS, r),
        impressions,
        reach,
        views,
        video_views: isVideo ? views : 0,
        watch_time: wt,
        avg_watch_time: isVideo && views ? Math.round((wt / views) * 10) / 10 : 0,
        likes, comments, shares, saves, reactions,
        replies: isLinkedIn ? 0 : rest,
        bookmarks: 0,
        /* A B2B feed drives more clicks than a consumer one — the link is
           usually the point of the post. */
        link_clicks: Math.round(impressions * (0.009 + r() * 0.028)),
        profile_visits: Math.round(reach * (0.010 + r() * 0.026)),
        followers_gained: Math.round(reach * (0.0018 + r() * 0.0060) * viral),
        followers_lost: Math.round(reach * (0.0004 + r() * 0.0012)),
        utm_source: platform,
        utm_medium: 'social',
        utm_campaign: campaign ? U.slug(campaign.name) : '',
        hashtags: hashtags.join(' '),
        mentions: r() > 0.85 ? '@baugment' : '',
        location: 'Baugment, Graha Mampang Lt.3, Jakarta Selatan',
        notes: '',
        custom: {},
        source: 'seed',
        imported_at: null
      });
    }
    analytics.sort((a, b) => (a.published_date < b.published_date ? 1 : -1));

    /* Planner — 100 items, mostly ahead of today */
    const CTAS = ['Register at the link', 'Save this for later', 'Comment "TOOLKIT"', 'Download the template',
      'Book a discovery call', 'Share with your L&D lead', 'Join the next cohort'];
    const AUDIENCES = ['L&D managers, 100+ headcount', 'HR business partners', 'Heads of People, Jakarta',
      'Corporate trainers and facilitators', 'Instructional designers', 'C-suite sponsors of training'];
    const planner = [];
    for (let i = 0; i < 100; i++) {
      const offset = Math.round(-18 + r() * 80);
      const d = U.addDays(today, offset);
      const platform = U.pick(weights, r);
      const pillar = U.pick(pillars, r);
      const topic = U.pick(TOPICS, r);
      const status = offset < 0 ? U.pick(['published', 'published', 'archived'], r)
        : offset < 4 ? U.pick(['scheduled', 'review'], r)
        : U.pick(['scheduled', 'draft', 'draft', 'review'], r);
      const cand = campaigns.filter((c) => c.start <= U.iso(d) && c.end >= U.iso(d));
      const plannedMedia = platform === 'youtube' ? U.pick(['Video', 'Video', 'Reel'], r)
        : platform === 'tiktok' ? 'Reel'
        : platform === 'linkedin' ? U.pick(['Carousel', 'Text', 'Document', 'Image'], r)
        : U.pick(['Carousel', 'Image', 'Reel', 'Story'], r);
      planner.push({
        id: 'plan_' + (i + 1),
        title: U.pick(['Carousel', 'Post', 'Reel', 'Short', 'Explainer', 'Case study'], r) + ': ' + topic,
        caption: U.pick(CAPTION_SHAPES, r)(topic),
        platform,
        media_type: plannedMedia,
        publish_date: U.iso(d),
        publish_time: U.pad(7 + Math.floor(r() * 11)) + ':' + U.pick(['00', '15', '30', '45'], r),
        objective: U.pick(BAUGMENT.schema.OBJECTIVES, r),
        audience: U.pick(AUDIENCES, r),
        cta: U.pick(CTAS, r),
        hashtags: HASHTAG_POOL.slice(0, 3 + Math.floor(r() * 4)).join(' '),
        keywords: U.pick(['pelatihan karyawan', 'instructional design', 'lms indonesia', 'learning analytics'], r),
        thumbnail_id: 'med_' + (1 + Math.floor(r() * 20)),
        owner: U.pick(AUTHORS, r),
        reviewer: U.pick(AUTHORS, r),
        priority: U.pick(['high', 'medium', 'medium', 'low'], r),
        status,
        pillar_id: pillar.id,
        campaign_id: cand.length && r() > 0.4 ? U.pick(cand, r).id : null,
        notes: '',
        source: 'seed'
      });
    }

    /* Idea Bank — the raw end of the pipeline */
    const ideas = IDEA_SEEDS.map((s, i) => {
      const created = U.addDays(today, -Math.round(Math.pow(r(), 0.7) * 150));
      const tagPool = ['evergreen', 'carousel', 'series', 'gated', 'quick-win', 'needs-research',
        'client-approval', 'repurpose', 'high-effort', 'timely'];
      const tags = [];
      const tagCount = 1 + Math.floor(r() * 3);
      while (tags.length < tagCount) {
        const t = U.pick(tagPool, r);
        if (tags.indexOf(t) === -1) tags.push(t);
      }
      return {
        id: 'idea_' + (i + 1),
        title: s[0],
        notes: s[1],
        status: s[2],
        potential: s[3],
        origin: s[4],
        platform: s[5],
        pillar_id: U.pick(pillars, r).id,
        campaign_id: r() > 0.78 ? U.pick(campaigns, r).id : null,
        tags,
        source_url: '',
        owner: U.pick(AUTHORS, r),
        created_on: U.iso(created),
        updated_on: U.iso(U.addDays(created, Math.round(r() * 20))),
        promoted_to: null,
        source: 'seed'
      };
    });

    /* Weekly readings for the past year, walked backwards from today's number
       so the current figure matches the account record exactly. */
    const followerSnapshots = [];
    ACCOUNTS.forEach((acc) => {
      let value = acc.followers;
      for (let w = 0; w <= 52; w++) {
        const day = U.addDays(today, -w * 7);
        followerSnapshots.push({
          id: 'fs_' + acc.id + '_' + w,
          account_id: acc.id,
          captured_on: U.iso(day),
          followers: Math.round(value),
          note: '',
          source: 'seed'
        });
        /* Roughly 0.4–1.4% growth a week, with the occasional flat spell. */
        value = value / (1 + (0.004 + r() * 0.010) * (r() > 0.12 ? 1 : 0.15));
      }
    });
    followerSnapshots.sort((a, b) => (a.captured_on < b.captured_on ? -1 : 1));

    return {
      version: 1,
      accounts: ACCOUNTS.map((a) => Object.assign({}, a, { source: 'seed' })),
      followerSnapshots,
      pillars, campaigns, analytics, planner, ideas,
      media: buildMedia(r),
      customMetrics: [],
      importHistory: [],
      settings: {
        theme: 'dark',
        language: 'en',
        timezone: 'Asia/Jakarta',
        dateFormat: 'DD MMM YYYY',
        defaultPlatform: 'all',
        exportDelimiter: ',',
        exportIncludeDerived: true,
        duplicateStrategy: 'skip',
        livePlatforms: ['linkedin', 'instagram', 'youtube', 'tiktok']
      }
    };
  }

  return { build, ACCOUNTS, TOPICS };
})();
