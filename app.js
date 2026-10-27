'use strict';

const KEY = 'builderpro:v1';
const ACTIVITIES = ["Rev'd", 'Walk', 'Swim', 'Hot yoga', 'HIIT boxing'];
const PLATES = [45, 35, 25, 10, 5, 2.5];
const BAR = 45;
const KIND_LABEL = { reps: 'reps', time: 'sec', distance: 'yd' };
const KIND_OPTIONS = [['reps', 'Reps'], ['time', 'Seconds'], ['distance', 'Yards']];

const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

// ---------- helpers ----------

const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (name) => String(name || '').trim().toLowerCase();
const pad = (n) => String(n).padStart(2, '0');

function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function today() { return toDateStr(new Date()); }
function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateStr(d); }
// Weeks run Sunday to Saturday.
function weekStart(s) { const d = parseDate(s); d.setDate(d.getDate() - d.getDay()); return toDateStr(d); }
function fmtDate(s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return parseDate(s).toLocaleDateString('en-US', opts);
}
const SHORT = { month: 'short', day: 'numeric' };

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const isFilled = (st) => st.r != null;
const fmtSet = (st) => `${st.w == null ? 'BW' : st.w} x ${st.r}`;
const UNIT_SUFFIX = { reps: '', time: 's', distance: ' yd' };
const fmtSetWithUnit = (st, kind) => fmtSet(st) + (UNIT_SUFFIX[kind] || '');
// Epley estimated 1-rep max.
const e1rm = (w, r) => (r === 1 ? w : w * (1 + r / 30));
// Only weighted rep sets are charted, so only they can set a new best.
const setE1rm = (st, kind) => (kind === 'reps' && st.w > 0 && st.r > 0 ? e1rm(st.w, st.r) : 0);

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Counts a number up from 0 to its value (instant when Reduce Motion is on).
function countUp(el, to, ms = 750) {
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  if (reduceMotion()) { el.textContent = fmt(to); return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = fmt(to * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  el.textContent = '0';
  requestAnimationFrame(step);
}

// Restarts a CSS animation class on an element.
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function bySessionOrder(a, b) { return a.date === b.date ? a.created - b.created : a.date < b.date ? -1 : 1; }

// ---------- storage ----------

function seedDb() {
  const seed = window.BP_SEED;
  const workouts = seed.workouts.map((w) => ({
    id: uid(),
    name: w.name,
    exercises: w.exercises.map(([name, sets, target, kind]) => ({ id: uid(), name, sets, target, kind })),
  }));
  const sessions = seed.sessions.map((s, i) => {
    const w = workouts[s.workout];
    return {
      id: uid(),
      date: s.date,
      created: i,
      workoutId: w.id,
      workoutName: w.name,
      entries: s.entries.map(([name, sets]) => {
        const ex = w.exercises.find((e) => norm(e.name) === norm(name));
        return {
          id: uid(),
          name,
          kind: ex ? ex.kind : 'reps',
          plan: ex ? planText(ex) : '',
          sets: sets.map(([w, r]) => ({ w, r })),
        };
      }),
    };
  });
  return { workouts, sessions, activities: {}, bodyweight: {} };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through to seed */ }
  const fresh = seedDb();
  try { localStorage.setItem(KEY, JSON.stringify(fresh)); } catch (e) { /* ignore */ }
  return fresh;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Could not save on this device'); }
}

let db = load();
let view = { tab: 'workouts' };
const ui = { progressEx: null, actDate: today(), bwWeek: today() };

// ---------- shared ----------

function planText(ex) { return ex.target ? `${ex.sets} × ${ex.target}` : `${ex.sets} sets`; }

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}

// Bottom sheet with a set of choices; resolves with the chosen button's value (null if dismissed).
let sheetToken = 0;
function ask({ title, body = '', buttons, dismissable = true }) {
  return new Promise((resolve) => {
    const root = $('#sheet');
    const token = ++sheetToken;
    root.innerHTML = `
      <div class="sheet-backdrop"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <h2 id="sheet-title">${esc(title)}</h2>
        ${body ? `<div class="sheet-body">${body}</div>` : ''}
        <div class="sheet-actions">
          ${buttons.map((b, i) => `<button class="btn wide ${b.style || ''}" data-choice="${i}">${esc(b.label)}</button>`).join('')}
        </div>
      </div>`;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('open'));
    const close = (value) => {
      root.classList.remove('open');
      root.onclick = null;
      setTimeout(() => { if (token === sheetToken) { root.hidden = true; root.innerHTML = ''; } }, 260);
      resolve(value);
    };
    root.onclick = (e) => {
      const b = e.target.closest('[data-choice]');
      if (b) close(buttons[b.dataset.choice].value);
      else if (dismissable && e.target.classList.contains('sheet-backdrop')) close(null);
    };
    root.querySelector('[data-choice]').focus({ preventScroll: true });
  });
}

const confirmDelete = (title, body) => ask({
  title,
  body,
  buttons: [{ label: 'Delete', value: true, style: 'danger-fill' }, { label: 'Cancel', value: false }],
});

function findSession(id) { return db.sessions.find((s) => s.id === id); }
function findWorkout(id) { return db.workouts.find((w) => w.id === id); }

// Most recent earlier session containing this exercise with at least one logged set.
function lastSets(name, current) {
  const key = norm(name);
  const earlier = db.sessions
    .filter((s) => s.id !== current.id && bySessionOrder(s, current) < 0)
    .sort(bySessionOrder)
    .reverse();
  for (const s of earlier) {
    const sets = s.entries.filter((en) => norm(en.name) === key).flatMap((en) => en.sets.filter(isFilled));
    if (sets.length) return { date: s.date, sets };
  }
  return null;
}

// Best estimated 1-rep max from every set logged before this one:
// earlier sessions, then earlier exercises and sets in this session.
function priorBest(session, entryIdx, setIdx) {
  const key = norm(session.entries[entryIdx].name);
  let best = 0;
  for (const s of db.sessions) {
    if (s.id !== session.id && bySessionOrder(s, session) > 0) continue;
    s.entries.forEach((en, ei) => {
      if (norm(en.name) !== key) return;
      en.sets.forEach((st, si) => {
        if (s.id === session.id && (ei > entryIdx || (ei === entryIdx && si >= setIdx))) return;
        best = Math.max(best, setE1rm(st, en.kind));
      });
    });
  }
  return best;
}

function isNewBest(session, entryIdx, setIdx) {
  const en = session.entries[entryIdx];
  const v = setE1rm(en.sets[setIdx], en.kind);
  return v > 0 && v > priorBest(session, entryIdx, setIdx);
}

// Highest new-best estimate set in this entry during this session, or 0.
function entryBest(session, entryIdx) {
  const en = session.entries[entryIdx];
  return en.sets.reduce((m, st, si) => (isNewBest(session, entryIdx, si) ? Math.max(m, setE1rm(st, en.kind)) : m), 0);
}

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 6 6.5.6-4.9 4.3 1.5 6.4L12 16.8l-5.8 3.3 1.5-6.4-4.9-4.3 6.5-.6z"/></svg>';
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  return `<i style="--dx:${Math.round(Math.cos(a) * 64)}px;--dy:${Math.round(Math.sin(a) * 40)}px"></i>`;
}).join('');

const backBtn = (label) => `<button class="back" data-action="back">${ICON.back}${label}</button>`;

// ---------- views ----------

function workoutsView() {
  if (view.workoutId) {
    const w = findWorkout(view.workoutId);
    if (w) return workoutEditView(w);
  }
  return `
    <h1>Workouts</h1>
    <button class="btn primary wide copy-week" data-action="copy-week">Copy this week</button>
    <h2>Your workouts</h2>
    ${db.workouts.length ? `<ul class="list">
      ${db.workouts.map((w) => `
        <li><button class="row" data-action="open-workout" data-id="${w.id}">
          <span class="row-main">
            <span class="row-title">${esc(w.name) || 'Untitled'}</span>
            <span class="row-sub">${w.exercises.length} exercises</span>
          </span>
          ${ICON.chev}
        </button></li>`).join('')}
    </ul>` : '<p class="empty">Create your first workout below.</p>'}
    <form class="new-workout" data-form="new-workout">
      <input name="name" placeholder="New workout name" autocomplete="off" required>
      <button class="btn">Create</button>
    </form>`;
}

function workoutEditView(w) {
  return `
    ${backBtn('Workouts')}
    <label class="field" style="margin-top:10px"><span>Workout name</span>
      <input class="title-input" data-bind="workout-name" value="${esc(w.name)}" autocomplete="off">
    </label>
    <button class="btn primary wide" style="margin-top:14px" data-action="start-session">Start session</button>
    <h2>Exercises</h2>
    ${w.exercises.map((e) => `
      <div class="ex-edit" data-ex="${e.id}">
        <input class="name" data-bind="ex-name" value="${esc(e.name)}" placeholder="Exercise name" autocomplete="off" aria-label="Exercise name">
        <div class="ex-grid">
          <label><span>Sets</span><input data-bind="ex-sets" type="number" inputmode="numeric" min="1" value="${e.sets}"></label>
          <label><span>Target</span><input data-bind="ex-target" value="${esc(e.target)}" placeholder="6-10" autocomplete="off"></label>
          <label><span>Logs</span><select data-bind="ex-kind">
            ${KIND_OPTIONS.map(([k, label]) => `<option value="${k}"${e.kind === k ? ' selected' : ''}>${label}</option>`).join('')}
          </select></label>
        </div>
        <button class="text-btn danger" data-action="del-ex">Remove exercise</button>
      </div>`).join('')}
    <div class="stack" style="margin-top:14px">
      <button class="btn wide" data-action="add-ex">Add exercise</button>
      <button class="text-btn danger" data-action="del-workout">Delete workout</button>
    </div>`;
}

function logView() {
  if (view.sessionId) {
    const s = findSession(view.sessionId);
    if (s) return sessionView(s);
  }
  const sessions = [...db.sessions].sort(bySessionOrder).reverse();
  return `
    <h1>Log</h1>
    ${sessions.length ? `<ul class="list">
      ${sessions.map((s) => {
        const n = s.entries.reduce((acc, en) => acc + en.sets.filter(isFilled).length, 0);
        const d = parseDate(s.date);
        return `<li><button class="row" data-action="open-session" data-id="${s.id}">
          <span class="datebox"><b>${d.getDate()}</b><span>${d.toLocaleDateString('en-US', { month: 'short' })}</span></span>
          <span class="row-main">
            <span class="row-title">${esc(s.workoutName)}</span>
            <span class="row-sub">${fmtDate(s.date, { weekday: 'long' })}, ${n} ${n === 1 ? 'set' : 'sets'}</span>
          </span>
          ${ICON.chev}
        </button></li>`;
      }).join('')}
    </ul>` : '<p class="empty">No sessions yet. Start one from Workouts.</p>'}`;
}

function sessionView(s) {
  const count = s.entries.length;
  const idx = Math.min(Math.max(view.exIndex || 0, 0), Math.max(count - 1, 0));
  view.exIndex = idx;
  const en = s.entries[idx];
  const head = (pos) => `
    ${backBtn('Log')}
    <h1 class="sess-title">${esc(s.workoutName)}</h1>
    <div class="sess-meta">
      <input type="date" class="date-chip" data-bind="session-date" value="${s.date}" aria-label="Session date">
      ${pos}
    </div>`;
  if (!en) return `${head('')}<p class="empty">This session has no exercises.</p>${sessFoot()}`;

  const last = lastSets(en.name, s);
  const label = KIND_LABEL[en.kind] || 'reps';
  return `
    ${head(`<span class="pos" aria-label="Exercise ${idx + 1} of ${count}"><b>${idx + 1}</b> of ${count}</span>`)}
    <div class="segs" aria-hidden="true">
      ${s.entries.map((e, i) => `<i class="${i === idx ? 'cur' : ''}${e.sets.length && e.sets.every(isFilled) ? ' done' : ''}"></i>`).join('')}
    </div>
    <div class="ex-stage">
      <article class="ex-card${view.slide ? ` from-${view.slide}` : ''}" data-entry="${en.id}">
        <p class="ex-plan">${esc(en.plan)}</p>
        <h2 class="ex-name">${esc(en.name)}</h2>
        <p class="last">${last
          ? `<span class="when">Last (${fmtDate(last.date, SHORT)})</span><b>${last.sets.map((st) => `<span class="nowrap">${fmtSet(st)}</span>`).join(', ')}</b>`
          : '<span class="when">Last: none</span>'}</p>
        ${pbBanner(entryBest(s, idx))}
        <div class="set-head" aria-hidden="true"><span>Set</span><span>lb</span><span>${label}</span><span></span></div>
        ${en.sets.map((st, i) => `
          <div class="set${isFilled(st) ? ' filled' : ''}${isNewBest(s, idx, i) ? ' pb' : ''}" data-set="${i}">
            <span class="setno"><span>${i + 1}</span>${ICON.check}</span>
            <input data-bind="set-w" inputmode="decimal" value="${st.w ?? ''}" placeholder="–" aria-label="Set ${i + 1} weight in pounds">
            <input data-bind="set-r" inputmode="numeric" value="${st.r ?? ''}" placeholder="–" aria-label="Set ${i + 1} ${label}">
            <button class="del" data-action="del-set" aria-label="Remove set ${i + 1}">${ICON.x}</button>
          </div>`).join('')}
        <button class="text-btn add-set" data-action="add-set">+ Add set</button>
      </article>
    </div>
    <div class="ex-nav">
      <button class="btn" data-action="ex-prev" aria-label="Previous exercise"${idx === 0 ? ' disabled' : ''}>${ICON.back}</button>
      <button class="btn primary" data-action="ex-next"${idx === count - 1 ? ' disabled' : ''}>Next${ICON.next}</button>
      <button class="btn finish" data-action="finish">Finish</button>
    </div>
    ${sessFoot()}`;
}

function pbBanner(best) {
  return `<p class="pb-banner${best ? ' show' : ''}" aria-live="polite">
    <span class="pb-star">${STAR}<span class="sparks" aria-hidden="true">${SPARKS}</span></span>
    <span class="pb-text">New best <b class="pb-val">${best ? Math.round(best) : ''}</b> lb est. 1-rep max</span>
  </p>`;
}

function sessionSummary(s) {
  const exercises = [];
  let sets = 0, volume = 0;
  s.entries.forEach((en, ei) => {
    const done = en.sets.map((st, si) => ({ st, si })).filter(({ st }) => isFilled(st));
    if (!done.length) return;
    sets += done.length;
    for (const { st } of done) if (en.kind === 'reps' && st.w > 0) volume += st.w * st.r;
    exercises.push({
      name: en.name,
      best: done.some(({ si }) => isNewBest(s, ei, si)) ? entryBest(s, ei) : 0,
    });
  });
  return { exercises, sets, volume };
}

function summaryHtml(sum) {
  const bests = sum.exercises.filter((e) => e.best);
  let i = 0;
  const d = () => `style="--i:${i++}"`;
  return `
    <div class="sum">
      <div class="sum-stats">
        <div class="stat" ${d()}><b data-count="${sum.sets}">${sum.sets}</b><span>${sum.sets === 1 ? 'set' : 'sets'}</span></div>
        <div class="stat" ${d()}><b data-count="${sum.exercises.length}">${sum.exercises.length}</b><span>${sum.exercises.length === 1 ? 'exercise' : 'exercises'}</span></div>
        <div class="stat" ${d()}><b data-count="${sum.volume}">${sum.volume.toLocaleString('en-US')}</b><span>lb volume</span></div>
      </div>
      ${bests.length ? `<div class="sum-bests" ${d()}>
        <h3>New bests</h3>
        <ul>${bests.map((e) => `<li class="best-chip">${STAR}${esc(e.name)} <b>${Math.round(e.best)} lb</b></li>`).join('')}</ul>
      </div>` : ''}
      ${sum.sets ? '' : '<p class="sum-empty">No sets logged yet.</p>'}
    </div>`;
}

function sessFoot() {
  return '<div class="sess-foot"><button class="text-btn danger" data-action="del-session">Delete session</button></div>';
}

function progressSeries(name) {
  const key = norm(name);
  const byDate = new Map();
  for (const s of db.sessions) {
    for (const en of s.entries) {
      if (norm(en.name) !== key || en.kind !== 'reps') continue;
      for (const st of en.sets) {
        if (!(st.w > 0 && st.r > 0)) continue;
        const v = e1rm(st.w, st.r);
        const cur = byDate.get(s.date);
        if (!cur || v > cur.v) byDate.set(s.date, { date: s.date, v, set: st });
      }
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function chartableExercises() {
  const names = new Map();
  for (const s of db.sessions) {
    for (const en of s.entries) {
      if (en.kind === 'reps' && en.sets.some((st) => st.w > 0 && st.r > 0) && !names.has(norm(en.name))) {
        names.set(norm(en.name), en.name.trim());
      }
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

function progressView() {
  const names = chartableExercises();
  if (!names.length) return '<h1>Progress</h1><p class="empty">Log a weighted set to see a chart.</p>';
  if (!names.some((n) => norm(n) === norm(ui.progressEx))) ui.progressEx = names[0];
  const pts = progressSeries(ui.progressEx);
  const latest = pts[pts.length - 1];
  return `
    <h1>Progress</h1>
    <label class="field"><span>Exercise</span>
      <select data-bind="progress-ex">
        ${names.map((n) => `<option${norm(n) === norm(ui.progressEx) ? ' selected' : ''}>${esc(n)}</option>`).join('')}
      </select>
    </label>
    <section class="chart-card">
      <h3>${esc(ui.progressEx)}</h3>
      <div class="chart-head" style="margin-top:14px">
        <span class="big">${Math.round(latest.v)}</span><span class="unit">lb</span>
      </div>
      <p class="chart-sub">Estimated 1-rep max on ${fmtDate(latest.date, SHORT)}</p>
      <div class="chart-wrap" id="chart"></div>
    </section>`;
}

function activitiesView() {
  const date = ui.actDate;
  return `
    <h1>Activities</h1>
    <label class="field"><span>Date</span>
      <input type="date" data-bind="act-date" value="${date}">
    </label>
    <ul class="list act-grid">
      ${ACTIVITIES.map((a) => {
        const done = !!db.activities[`${date}|${a}`];
        return `<li><button class="toggle${done ? ' on' : ''}" data-action="toggle-act" data-type="${esc(a)}" aria-pressed="${done}">
          <span class="name">${esc(a)}</span>
          <span class="state"><span class="tick">${ICON.check}</span>${done ? 'Done' : 'Not done'}</span>
        </button></li>`;
      }).join('')}
    </ul>`;
}

function bodyweightView() {
  const week = weekStart(ui.bwWeek);
  const entries = Object.entries(db.bodyweight).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return `
    <h1>Body weight</h1>
    <form class="bw-card bw-form" data-form="bw">
      <label class="field"><span>Week of ${fmtDate(week, SHORT)}</span>
        <input type="date" data-bind="bw-week" value="${ui.bwWeek}">
      </label>
      <label class="field"><span>Weight (lb)</span>
        <input class="bw-lbs" name="lbs" inputmode="decimal" value="${db.bodyweight[week] ?? ''}" placeholder="–" required autocomplete="off">
      </label>
      <button class="btn primary">Save</button>
    </form>
    <h2>History</h2>
    ${entries.length ? `<ul class="list">
      ${entries.map(([wk, lbs]) => `<li><div class="row bw-row">
        <span class="row-main"><span class="row-title">Week of ${fmtDate(wk, SHORT)}</span><span class="row-sub">${parseDate(wk).getFullYear()}</span></span>
        <span class="val">${lbs}<small>lb</small></span>
        <button class="icon-del" data-action="del-bw" data-week="${wk}" aria-label="Delete week of ${fmtDate(wk, SHORT)}">${ICON.x}</button>
      </div></li>`).join('')}
    </ul>` : '<p class="empty">No entries yet. Save this week\'s weight above.</p>'}`;
}

const RING_R = 76;
const RING_C = 2 * Math.PI * RING_R;

function toolsView() {
  return `
    <h1>Tools</h1>
    <section class="tool">
      <h2>Plate calculator</h2>
      <p class="hint">Enter the total. Plates are per side on a 45 lb bar.</p>
      <input class="big-input" data-bind="plate-total" inputmode="decimal" placeholder="Total lb" autocomplete="off" aria-label="Total weight in pounds">
      <div id="plate-out"></div>
    </section>
    <section class="tool">
      <h2>Rest timer</h2>
      <p class="hint">Set the time, then start.</p>
      <div class="timer-layout">
        <div class="ring${timer.done ? ' done' : ''}" id="ring">
          <svg viewBox="0 0 176 176" aria-hidden="true">
            <circle class="track" cx="88" cy="88" r="${RING_R}"/>
            <circle class="meter" id="ring-meter" cx="88" cy="88" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${ringOffset()}"/>
          </svg>
          <p class="readout" id="timer-display">${timerText()}</p>
        </div>
        <div class="timer-controls">
          <div class="timer-inputs">
            <label class="field"><span>Min</span><input id="t-min" inputmode="numeric" placeholder="0" autocomplete="off"></label>
            <label class="field"><span>Sec</span><input id="t-sec" inputmode="numeric" placeholder="0" autocomplete="off"></label>
          </div>
          <button class="btn primary wide" id="timer-btn" data-action="timer">${timer.end ? 'Stop' : 'Start'}</button>
        </div>
      </div>
    </section>`;
}

const VIEWS = {
  workouts: workoutsView,
  log: logView,
  progress: progressView,
  activities: activitiesView,
  bodyweight: bodyweightView,
  tools: toolsView,
};

// anim: true plays the screen transition (navigation only, not in-place updates).
function render(anim = false) {
  document.querySelectorAll('.tabbar button').forEach((b) => {
    const on = b.dataset.tab === view.tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const main = $('#main');
  main.innerHTML = VIEWS[view.tab]();
  view.slide = null;
  if (anim) {
    main.classList.remove('enter');
    void main.offsetWidth;
    main.classList.add('enter');
  }
  if (view.tab === 'progress' && $('#chart')) {
    const pts = progressSeries(ui.progressEx);
    drawChart($('#chart'), pts);
    countUp($('.chart-head .big'), pts[pts.length - 1].v);
  }
}

function go(next) {
  view = next;
  render(true);
  window.scrollTo(0, 0);
}

// ---------- chart ----------

function niceStep(range) {
  const raw = range / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}

function drawChart(el, pts) {
  const W = el.clientWidth || 320, H = 224;
  const m = { l: 36, r: 12, t: 58, b: 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  if (hi - lo < 10) { lo -= 5; hi += 5; }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const t = pts.map((p) => parseDate(p.date).getTime());
  const t0 = t[0], t1 = t[t.length - 1];
  const x = (i) => m.l + (t1 === t0 ? iw / 2 : ((t[i] - t0) / (t1 - t0)) * iw);
  const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
  const lastI = pts.length - 1;

  let grid = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    grid += `<text class="axis" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
  }
  let xlabels = `<text class="axis" x="${x(0)}" y="${H - 6}" text-anchor="${pts.length > 1 ? 'start' : 'middle'}">${fmtDate(pts[0].date, SHORT)}</text>`;
  if (pts.length > 1) {
    xlabels += `<text class="axis" x="${x(lastI)}" y="${H - 6}" text-anchor="end">${fmtDate(pts[lastI].date, SHORT)}</text>`;
  }
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.v)}`).join('');
  const area = pts.length > 1 ? `${line}L${x(lastI)},${m.t + ih}L${x(0)},${m.t + ih}Z` : '';

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Estimated 1-rep max over time">
      <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#8b4dff" stop-opacity="0.32"/><stop offset="1" stop-color="#8b4dff" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}${xlabels}
      ${area ? `<path class="area" d="${area}" fill="url(#fade)"/>` : ''}
      <path class="line" d="${line}"/>
      <line class="cross" id="cross" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/>
      ${pts.map((p, i) => `<circle class="dot${i === lastI ? ' latest' : ''}" style="--t:${pts.length > 1 ? i / lastI : 0}" cx="${x(i)}" cy="${y(p.v)}" r="${i === lastI ? 6 : 4.5}"/>`).join('')}
      <rect x="0" y="0" width="${W}" height="${H}" fill="transparent" id="hit"/>
    </svg>
    <div class="tip" id="tip" hidden></div>`;

  // The line draws in from left to right (CSS animates the dash offset down to 0).
  const path = el.querySelector('.line');
  path.style.setProperty('--len', path.getTotalLength() || 1);

  const cross = el.querySelector('#cross'), tip = el.querySelector('#tip');
  const show = (evt) => {
    const box = el.getBoundingClientRect();
    const px = evt.clientX - box.left;
    let best = 0;
    pts.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    const p = pts[best], cx = x(best);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<b>${Math.round(p.v)} lb</b> on ${fmtDate(p.date, SHORT)}<br><span class="muted">Best set ${fmtSet(p.set)}</span>`;
    tip.style.left = `${Math.min(Math.max(cx, 64), W - 64)}px`;
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  const hit = el.querySelector('#hit');
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', hide);
}

// ---------- tools ----------

function plateText(total) {
  if (total == null) return '';
  if (total < BAR) return '<p class="plate-note">Less than the 45 lb bar.</p>';
  if (total === BAR) return '<p class="plate-note">Empty bar.</p>';
  let left = (total - BAR) / 2;
  const rows = [];
  for (const p of PLATES) {
    const n = Math.floor((left + 1e-9) / p);
    if (n) { rows.push([p, n]); left -= n * p; }
  }
  left = Math.round(left * 100) / 100;
  const viz = rows.flatMap(([p, n]) => Array(n).fill(p))
    .map((p, i) => `<span class="plate p${String(p).replace('.', '_')}" style="animation-delay:${i * 30}ms"></span>`).join('');
  return `
    <div class="bar-viz" aria-hidden="true"><span class="sleeve"></span><span class="collar"></span>${viz}<span class="end"></span></div>
    <ul class="list plates">${rows.map(([p, n]) => `<li><span class="w">${p} lb</span><span class="n">× ${n}</span></li>`).join('')}</ul>
    ${left > 0 ? `<p class="plate-note">Can't load exactly: ${left} lb per side left over.</p>` : ''}`;
}

const timer = { end: 0, total: 0, id: 0, done: false };

function timerText() {
  if (timer.done) return 'Done';
  const s = timer.end ? Math.max(0, Math.ceil((timer.end - Date.now()) / 1000)) : 0;
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

// Full ring while running, draining to empty.
function ringOffset() {
  if (!timer.end) return timer.done ? 0 : RING_C;
  const frac = Math.max(0, (timer.end - Date.now()) / timer.total);
  return RING_C * (1 - frac);
}

function tickTimer() {
  if (timer.end && Date.now() >= timer.end) {
    clearInterval(timer.id);
    timer.end = 0;
    timer.done = true;
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    const btn = $('#timer-btn');
    if (btn) btn.textContent = 'Start';
  }
  const d = $('#timer-display');
  if (d) d.textContent = timerText();
  const meter = $('#ring-meter');
  if (meter) meter.setAttribute('stroke-dashoffset', ringOffset());
  const ring = $('#ring');
  if (ring) ring.classList.toggle('done', timer.done);
}

function toggleTimer() {
  if (timer.end) {
    clearInterval(timer.id);
    timer.end = 0;
    timer.done = false;
    $('#timer-btn').textContent = 'Start';
    tickTimer();
    return;
  }
  const secs = (num($('#t-min').value) || 0) * 60 + (num($('#t-sec').value) || 0);
  if (secs <= 0) { toast('Enter a rest time'); return; }
  timer.done = false;
  timer.total = secs * 1000;
  timer.end = Date.now() + timer.total;
  timer.id = setInterval(tickTimer, 250);
  $('#timer-btn').textContent = 'Stop';
  tickTimer();
}

// ---------- copy this week ----------

function weekSummary() {
  const start = weekStart(today()), end = addDays(start, 6);
  const lifts = new Map();
  db.sessions
    .filter((s) => s.date >= start && s.date <= end)
    .sort(bySessionOrder)
    .forEach((s) => s.entries.forEach((en) => {
      const sets = en.sets.filter(isFilled);
      if (!sets.length) return;
      const key = norm(en.name);
      if (!lifts.has(key)) lifts.set(key, { name: en.name.trim(), sets: [] });
      lifts.get(key).sets.push(...sets.map((st) => fmtSetWithUnit(st, en.kind)));
    }));
  return [...lifts.values()].map((l) => [l.name, ...l.sets].join('\n')).join('\n\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// ---------- events ----------

// The current card slides out, then the next one slides in from the other side.
let moving = false;
function moveExercise(dir) {
  const s = findSession(view.sessionId);
  const next = (view.exIndex || 0) + dir;
  if (moving || !s || next < 0 || next >= s.entries.length) return;
  const show = () => {
    moving = false;
    view.exIndex = next;
    view.slide = dir > 0 ? 'right' : 'left';
    render();
    window.scrollTo(0, 0);
  };
  const card = $('.ex-card');
  if (!card || reduceMotion()) { show(); return; }
  moving = true;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  card.classList.add(dir > 0 ? 'leave-left' : 'leave-right');
  setTimeout(show, 130);
}

const actions = {
  tab(el) { go({ tab: el.dataset.tab }); },
  back() { go({ tab: view.tab }); },
  'open-workout'(el) { go({ tab: 'workouts', workoutId: el.dataset.id }); },
  'open-session'(el) { go({ tab: 'log', sessionId: el.dataset.id, exIndex: 0 }); },

  'add-ex'() {
    const w = findWorkout(view.workoutId);
    w.exercises.push({ id: uid(), name: '', sets: 3, target: '', kind: 'reps' });
    save();
    render();
    const inputs = document.querySelectorAll('[data-bind="ex-name"]');
    inputs[inputs.length - 1].focus();
  },
  async 'del-ex'(el) {
    const w = findWorkout(view.workoutId);
    const ex = w.exercises.find((e) => e.id === el.closest('[data-ex]').dataset.ex);
    if (!(await confirmDelete(`Remove ${ex.name || 'this exercise'}?`, 'Past sessions keep their logged sets.'))) return;
    w.exercises = w.exercises.filter((e) => e !== ex);
    save();
    render();
  },
  async 'del-workout'() {
    const w = findWorkout(view.workoutId);
    if (!(await confirmDelete(`Delete ${w.name || 'this workout'}?`, 'Logged sessions are kept.'))) return;
    db.workouts = db.workouts.filter((x) => x !== w);
    save();
    actions.back();
  },
  'start-session'() {
    const w = findWorkout(view.workoutId);
    const s = {
      id: uid(),
      date: today(),
      created: Date.now(),
      workoutId: w.id,
      workoutName: w.name,
      entries: w.exercises.map((e) => ({
        id: uid(),
        name: e.name.trim() || 'Unnamed exercise',
        kind: e.kind,
        plan: planText(e),
        sets: Array.from({ length: Math.max(1, e.sets) }, () => ({ w: null, r: null })),
      })),
    };
    db.sessions.push(s);
    save();
    go({ tab: 'log', sessionId: s.id, exIndex: 0 });
  },

  'ex-prev'() { moveExercise(-1); },
  'ex-next'() { moveExercise(1); },
  'add-set'(el) {
    const en = entryOf(el);
    en.sets.push({ w: null, r: null });
    save();
    render();
  },
  'del-set'(el) {
    const en = entryOf(el);
    en.sets.splice(Number(el.closest('[data-set]').dataset.set), 1);
    save();
    render();
  },
  async finish() {
    const s = findSession(view.sessionId);
    if (!s) return;
    const pending = ask({
      title: 'Session finished',
      body: summaryHtml(sessionSummary(s)),
      dismissable: false,
      buttons: [{ label: 'Done', value: true, style: 'primary' }],
    });
    $('#sheet .sheet').classList.add('summary-sheet');
    document.querySelectorAll('#sheet [data-count]').forEach((el) => countUp(el, Number(el.dataset.count), 900));
    await pending;
    go({ tab: 'log' });
  },
  async 'del-session'() {
    if (!(await confirmDelete('Delete this session?', 'All sets logged in it are removed.'))) return;
    db.sessions = db.sessions.filter((s) => s.id !== view.sessionId);
    save();
    actions.back();
  },

  'toggle-act'(el) {
    const k = `${ui.actDate}|${el.dataset.type}`;
    if (db.activities[k]) delete db.activities[k];
    else db.activities[k] = true;
    save();
    render();
  },

  async 'del-bw'(el) {
    const wk = el.dataset.week;
    if (!(await confirmDelete(`Delete week of ${fmtDate(wk, SHORT)}?`, `${db.bodyweight[wk]} lb will be removed.`))) return;
    delete db.bodyweight[wk];
    save();
    render();
  },

  timer() { toggleTimer(); },

  async 'copy-week'() {
    const text = weekSummary();
    if (!text) { toast('No lifts logged this week'); return; }
    toast((await copyText(text)) ? 'Copied this week' : 'Copy failed');
  },
};

function entryOf(el) {
  const s = findSession(view.sessionId);
  return s.entries.find((en) => en.id === el.closest('[data-entry]').dataset.entry);
}

function setOf(el) {
  return entryOf(el).sets[Number(el.closest('[data-set]').dataset.set)];
}

// Marks a set row done once it has reps (with a burst the moment it becomes done),
// and flags new bests, celebrating the moment a set becomes one.
function refreshSetRow(el) {
  const row = el.closest('.set');
  const s = findSession(view.sessionId);
  const ei = view.exIndex || 0;
  const en = s.entries[ei];
  const filled = isFilled(setOf(el));
  if (filled && !row.classList.contains('filled')) replay(row, 'pop');
  row.classList.toggle('filled', filled);
  const seg = document.querySelectorAll('.segs i')[ei];
  if (seg) seg.classList.toggle('done', en.sets.length > 0 && en.sets.every(isFilled));

  // Any row's new-best status can change when one set is edited.
  document.querySelectorAll('.ex-card .set').forEach((r) => {
    const pb = isNewBest(s, ei, Number(r.dataset.set));
    if (pb && !r.classList.contains('pb') && r === row) celebrate(row);
    r.classList.toggle('pb', pb);
  });
  const best = entryBest(s, ei);
  const banner = $('.pb-banner');
  banner.classList.toggle('show', best > 0);
  if (best) banner.querySelector('.pb-val').textContent = Math.round(best);
}

function celebrate(row) {
  replay(row, 'pb-burst');
  replay($('.pb-banner'), 'pop');
  replay($('.ex-card'), 'glow');
}

// Binds that save on every keystroke (no re-render, so focus stays put).
const liveBinds = {
  'workout-name'(el) { findWorkout(view.workoutId).name = el.value; },
  'ex-name'(el) {
    // Remember the name before this edit; history is renamed once editing finishes.
    if (el.dataset.orig === undefined) el.dataset.orig = exOf(el).name;
    exOf(el).name = el.value;
  },
  'ex-sets'(el) { const n = parseInt(el.value, 10); if (n >= 1) exOf(el).sets = n; },
  'ex-target'(el) { exOf(el).target = el.value.trim(); },
  'set-w'(el) { setOf(el).w = num(el.value); refreshSetRow(el); },
  'set-r'(el) { setOf(el).r = num(el.value); refreshSetRow(el); },
  'plate-total'(el) { $('#plate-out').innerHTML = plateText(num(el.value)); return false; },
};

// Binds that apply on change and re-render.
const changeBinds = {
  'ex-kind'(el) { exOf(el).kind = el.value; },
  'session-date'(el) { if (el.value) findSession(view.sessionId).date = el.value; },
  'progress-ex'(el) { ui.progressEx = el.value; return false; },
  'act-date'(el) { if (el.value) ui.actDate = el.value; return false; },
  'bw-week'(el) { if (el.value) ui.bwWeek = el.value; return false; },
};

// Rename past sessions (and, if chosen, same-named exercises in other workouts) after an exercise rename.
async function renameHistory(el) {
  const from = (el.dataset.orig ?? '').trim();
  const to = el.value.trim();
  delete el.dataset.orig;
  if (!from || !to || from === to) return;
  const workoutId = view.workoutId;
  const others = db.workouts.filter((w) => w.id !== workoutId && w.exercises.some((e) => norm(e.name) === norm(from)));

  let everywhere = true;
  if (others.length) {
    const names = others.map((w) => `<b>${esc(w.name || 'Untitled')}</b>`).join(', ');
    everywhere = await ask({
      title: `Rename ${from}?`,
      body: `${esc(from)} is also in ${names}.`,
      dismissable: false,
      buttons: [
        { label: 'Rename in all workouts', value: true, style: 'primary' },
        { label: 'Only this one', value: false },
      ],
    });
  }

  if (everywhere) {
    for (const w of others) for (const e of w.exercises) if (norm(e.name) === norm(from)) e.name = to;
  }
  for (const s of db.sessions) {
    if (!everywhere && s.workoutId !== workoutId) continue;
    for (const en of s.entries) if (norm(en.name) === norm(from)) en.name = to;
  }
  if (everywhere && norm(ui.progressEx) === norm(from)) ui.progressEx = to;
  save();
}

function exOf(el) {
  const w = findWorkout(view.workoutId);
  return w.exercises.find((e) => e.id === el.closest('[data-ex]').dataset.ex);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && !el.disabled && actions[el.dataset.action]) actions[el.dataset.action](el, e);
});

document.addEventListener('input', (e) => {
  const fn = liveBinds[e.target.dataset.bind];
  if (fn && fn(e.target) !== false) save();
});

document.addEventListener('change', (e) => {
  // No re-render here, so focus can move straight to the next field.
  if (e.target.dataset.bind === 'ex-name') { renameHistory(e.target); return; }
  const fn = changeBinds[e.target.dataset.bind];
  if (!fn) return;
  if (fn(e.target) !== false) save();
  render();
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.form === 'new-workout') {
    const name = form.elements.name.value.trim();
    if (!name) return;
    const w = { id: uid(), name, exercises: [] };
    db.workouts.push(w);
    save();
    go({ tab: 'workouts', workoutId: w.id });
  } else if (form.dataset.form === 'bw') {
    const lbs = num(form.elements.lbs.value);
    if (lbs == null || lbs <= 0) { toast('Enter a weight'); return; }
    db.bodyweight[weekStart(ui.bwWeek)] = lbs;
    save();
    render();
    toast('Saved');
  }
});

// Swipe left/right on the exercise card to move between exercises.
let swipe = null;
document.addEventListener('touchstart', (e) => {
  const card = e.target.closest('.ex-card');
  swipe = card && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!swipe) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) moveExercise(dx < 0 ? 1 : -1);
}, { passive: true });

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (view.tab === 'progress') render(); }, 150);
});

// Ask the browser to keep this app's data instead of clearing it under storage pressure.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

render(true);
