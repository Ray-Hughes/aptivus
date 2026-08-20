/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */
let PROBLEMS = [], PROGRESS = {}, CUR = null, FILTER = "all", EDITOR = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ------------------------------------------------------------------ */
/* tiny markdown                                                       */
/* ------------------------------------------------------------------ */
function md(src) {
  if (!src) return "";
  const blocks = [];
  src = src.replace(/```[a-z]*\n([\s\S]*?)```/g, (m, code) => {
    blocks.push(code); return "\n@@CODE" + (blocks.length - 1) + "@@\n";
  });
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  src = esc(src);
  const lines = src.split("\n");
  let out = "", inList = false, para = [];
  const flush = () => {
    if (para.length) { out += "<p>" + para.join(" ") + "</p>"; para = []; }
  };
  for (let raw of lines) {
    const line = raw.trimEnd();
    if (/^###\s+/.test(line)) {
      flush();
      if (inList) { out += "</ul>"; inList = false; }
      out += "<h3>" + line.replace(/^###\s+/, "") + "</h3>"; continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flush();
      if (!inList) { out += "<ul>"; inList = true; }
      out += "<li>" + line.replace(/^[-*]\s+/, "") + "</li>"; continue;
    }
    if (inList) { out += "</ul>"; inList = false; }
    if (!line.trim()) { flush(); continue; }
    const cb = line.trim().match(/^@@CODE(\d+)@@$/);
    if (cb) { flush(); out += "<pre><code>" + esc(blocks[+cb[1]]) + "</code></pre>"; continue; }
    para.push(line.trim());
  }
  flush();
  if (inList) out += "</ul>";
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>")
           .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  return out;
}

/* ------------------------------------------------------------------ */
/* editor                                                              */
/* ------------------------------------------------------------------ */
function makeEditor() {
  const host = $("#editor-host");
  host.innerHTML = "";
  if (window.CodeMirror) {
    const cm = CodeMirror(host, {
      value: "", mode: "python", theme: "material-darker",
      lineNumbers: true, indentUnit: 4, tabSize: 4, indentWithTabs: false,
      autoCloseBrackets: true, matchBrackets: true, lineWrapping: false,
      extraKeys: {
        "Cmd-Enter": runCode, "Ctrl-Enter": runCode,
        "Tab": (cm) => cm.somethingSelected() ? cm.indentSelection("add")
                                              : cm.replaceSelection("    "),
      },
    });
    window.__cm = cm;
    cm.on("cursorActivity", () => {
      const c = cm.getCursor();
      $("#pos").textContent = "Line: " + (c.line + 1) + " Col: " + (c.ch + 1);
    });
    let marked = null;
    return {
      get: () => cm.getValue(), set: (v) => cm.setValue(v),
      mode: (m) => cm.setOption("mode", m),
      focus: () => cm.focus(), refresh: () => cm.refresh(),
      onChange: (fn) => cm.on("change", fn),
      highlight: (lineNo) => {
        if (marked !== null) cm.removeLineClass(marked, "background", "cm-traceline");
        marked = null;
        if (lineNo == null) return;
        const l = lineNo - 1;
        if (l < 0 || l >= cm.lineCount()) return;
        marked = l;
        cm.addLineClass(l, "background", "cm-traceline");
        cm.scrollIntoView({ line: l, ch: 0 }, 80);
      },
    };
  }
  const ta = document.createElement("textarea");
  ta.id = "plain-editor"; ta.spellcheck = false;
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + 4;
    }
  });
  host.appendChild(ta);
  return { get: () => ta.value, set: (v) => { ta.value = v; },
           mode: () => {}, focus: () => ta.focus(), refresh: () => {},
           onChange: (fn) => ta.addEventListener("input", fn),
           highlight: () => {} };
}

/* ------------------------------------------------------------------ */
/* list view                                                           */
/* ------------------------------------------------------------------ */
async function loadAll() {
  const r = await fetch("/api/problems").then((r) => r.json());
  PROBLEMS = r.problems; PROGRESS = r.progress || {};
  renderList(); renderMock();
}

function renderList() {
  const q = ($("#search").value || "").toLowerCase();
  const tb = $("#problem-table tbody"); tb.innerHTML = "";
  let n = 0;
  PROBLEMS.forEach((p) => {
    if (FILTER !== "all" && p.kind !== FILTER) return;
    const hay = (p.title + " " + p.tags.join(" ") + " " + p.pattern + " " +
                 (p.pack || "")).toLowerCase();
    if (q && hay.indexOf(q) < 0) return;
    n++;
    const st = (PROGRESS[p.id] || {}).status;
    const icon = st === "solved" ? '<span class="st solved">&#10003;</span>'
               : st === "tried" ? '<span class="st tried">&#9679;</span>'
               : '<span class="st muted">&#9675;</span>';
    const tr = document.createElement("tr");
    tr.innerHTML = '<td>' + icon + '</td><td class="muted">' + n + '</td>' +
      '<td><b>' + p.title + '</b></td>' +
      '<td><span class="pill ' + (p.kind === "python" ? "py" : "sql") + '">' +
      (p.kind === "python" ? "Python" : "SQL") + '</span></td>' +
      '<td class="muted">' + p.pattern + '</td>' +
      '<td class="d-' + p.difficulty + '">' + p.difficulty + '</td>' +
      '<td class="muted">' + p.minutes + ' min</td>';
    tr.onclick = () => openProblem(p.id);
    tb.appendChild(tr);
  });
  const solved = Object.values(PROGRESS).filter((x) => x.status === "solved").length;
  const py = PROBLEMS.filter((p) => p.kind === "python").length;
  const sq = PROBLEMS.filter((p) => p.kind === "sql").length;
  $("#stats").innerHTML =
    '<div class="stat"><b>' + solved + '/' + PROBLEMS.length + '</b><span>solved</span></div>' +
    '<div class="stat"><b>' + py + '</b><span>algorithms</span></div>' +
    '<div class="stat"><b>' + sq + '</b><span>SQL</span></div>' +
    '<div class="stat"><b>' + daysLeft() + '</b><span>days to interview</span></div>';
}

function daysLeft() {
  const d = Math.ceil((new Date("2026-08-24T15:00:00-04:00") - new Date()) / 86400000);
  return d > 0 ? d : 0;
}

/* ------------------------------------------------------------------ */
/* solve view                                                          */
/* ------------------------------------------------------------------ */
async function openProblem(id) {
  const p = await fetch("/api/problem/" + id).then((r) => r.json());
  CUR = p; hintIdx = 0;
  SOLVED_LOCK = false; setBusy(false);
  closeTrace();
  $("#ask-panel").classList.add("hidden");
  $("#ask-log").innerHTML = "";
  if (location.hash !== "#/p/" + id) history.replaceState(null, "", "#/p/" + id);
  show("solve");
  $("#p-title").textContent = p.title;
  $("#lang").value = p.kind === "sql" ? "MySQL" : "Python 3";
  EDITOR.mode(p.kind === "sql" ? "text/x-sql" : "python");

  let html = '<p class="muted">' + p.difficulty + ' &middot; ' + p.pattern +
             ' &middot; target ' + p.minutes + ' min</p>';
  html += md(p.prompt);
  if (p.kind === "sql") {
    html += "<h3>Schema</h3><details><summary>CREATE TABLE statements</summary>" +
            "<pre><code>" + escapeHtml(p.schema_sql.trim()) + "</code></pre></details>";
    html += "<h3>Data</h3>";
    p.sample_rows.forEach((t) => {
      html += '<p><b>' + t.table + '</b> <span class="muted">(' + t.total + ' rows' +
              (t.total > 12 ? ", first 12 shown" : "") + ')</span></p>';
      html += tableHtml(t.cols, t.rows);
    });
    if (p.ordered) html += '<p class="muted"><b>Row order matters</b> on this one.</p>';
  } else if (p.sample_tests && p.sample_tests.length) {
    html += "<h3>Examples</h3>";
    p.sample_tests.forEach((t) => {
      const inp = p.mode === "stdin" ? t.stdin
                : (t.args || []).map((a) => JSON.stringify(a)).join(", ");
      html += "<pre><code>Input:    " + escapeHtml(inp) +
              "\nExpected: " + escapeHtml(JSON.stringify(t.expected)) + "</code></pre>";
    });
  }
  if (p.followups && p.followups.length) {
    html += "<h3>Follow-ups the interviewer may ask</h3><ul>" +
      p.followups.map((f) => "<li>" + f + "</li>").join("") + "</ul>";
  }
  html += '<div id="hint-slot"></div><div id="sol-slot"></div>';
  $("#p-body").innerHTML = html;
  $("#p-body").scrollTop = 0;

  const saved = (PROGRESS[p.id] || {}).code;
  EDITOR.set(saved || p.starter || "");
  EDITOR.refresh(); EDITOR.focus();
  $("#io-input").value = (p.mode === "stdin" && p.sample_tests && p.sample_tests[0])
    ? p.sample_tests[0].stdin : "";
  $("#io-output").innerHTML = '<div class="muted center">Run Code to see your output here.</div>';
}

function tableHtml(cols, rows) {
  let h = '<div class="tblwrap"><table class="sqltable"><thead><tr>';
  cols.forEach((c) => (h += "<th>" + escapeHtml(c) + "</th>"));
  h += "</tr></thead><tbody>";
  rows.forEach((r) => {
    h += "<tr>";
    r.forEach((v) => (h += "<td>" +
      (v === null ? '<span class="muted">NULL</span>' : escapeHtml(String(v))) + "</td>"));
    h += "</tr>";
  });
  return h + "</tbody></table></div>";
}

/* ------------------------------------------------------------------ */
/* run / submit                                                        */
/* ------------------------------------------------------------------ */
function saveCode(patch) {
  if (!CUR) return;
  PROGRESS[CUR.id] = Object.assign({}, PROGRESS[CUR.id], patch);
  fetch("/api/progress", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: CUR.id, patch }) });
}

let BUSY = false, SOLVED_LOCK = false;

function setBusy(on, label) {
  BUSY = on;
  const sub = $("#btn-submit");
  ["#btn-run", "#btn-trace"].forEach((sel) => {
    const b = $(sel); if (b) b.disabled = on;
  });
  if (sub) {
    sub.disabled = on || SOLVED_LOCK;
    sub.textContent = on ? (label || "Running...") : (SOLVED_LOCK ? "Solved" : "Submit");
  }
}

/* Passing locks Submit so the celebration cannot be re-fired by clicking.
   Editing the code re-arms it, so a different attempt can still be submitted. */
function lockSubmit() { SOLVED_LOCK = true; setBusy(false); }

function unlockSubmit() {
  if (!SOLVED_LOCK) return;
  SOLVED_LOCK = false;
  setBusy(false);
}

async function runCode() { await execute("/api/run", "Sample tests", false); }
async function submitCode() { await execute("/api/submit", "All tests", true); }

async function execute(url, label, isSubmit) {
  if (!CUR || BUSY) return;
  if (isSubmit && SOLVED_LOCK) return;
  const code = EDITOR.get();
  setBusy(true, isSubmit ? "Checking..." : "Running...");
  saveCode({ code, status: (PROGRESS[CUR.id] || {}).status || "tried" });
  $("#io-output").innerHTML = '<div class="muted center">Running...</div>';
  const res = await fetch(url, { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: CUR.id, code }) }).then((r) => r.json());
  try {
    if (res.kind === "sql") renderSql(res, label, isSubmit);
    else renderPy(res, label, isSubmit);
  } finally {
    setBusy(false);
  }
}

function renderPy(res, label, isSubmit) {
  const all = res.passed === res.total && res.total > 0;
  let h = '<div class="banner ' + (all ? "ok" : "bad") + '">' + label + ": " +
          res.passed + "/" + res.total + " passed</div>";
  res.results.forEach((r, i) => {
    h += '<div class="case ' + (r.passed ? "pass" : "fail") + '">' +
      '<div class="case-head"><span>Test ' + (i + 1) + (r.sample ? " (sample)" : "") + "</span>" +
      '<span class="' + (r.passed ? "ok" : "bad") + '">' +
      (r.passed ? "Passed" : "Failed") + "</span></div>";
    if (!r.passed) {
      h += '<div class="case-body">';
      h += '<span class="k">Input</span>' + escapeHtml(String(r.input));
      h += '<span class="k">Expected</span>' + escapeHtml(JSON.stringify(r.expected));
      h += '<span class="k">Got</span>' + escapeHtml(r.error ? "-" : JSON.stringify(r.got));
      if (r.error) h += '<span class="k bad">Error</span>' + escapeHtml(r.error);
      if (r.stdout) h += '<span class="k">Your prints</span>' + escapeHtml(r.stdout);
      h += "</div>";
    }
    h += "</div>";
  });
  $("#io-output").innerHTML = (all && isSubmit ? successBanner() : "") + h;
  if (all && isSubmit) markSolved();
}

function renderSql(res, label, isSubmit) {
  let h = '<div class="banner ' + (res.passed ? "ok" : "bad") + '">' + label + ": " +
          escapeHtml(res.message) + "</div>";
  if (res.got && res.got.error) {
    h += '<pre class="out bad">' + escapeHtml(res.got.error) + "</pre>";
  } else if (res.got) {
    h += '<p class="muted">Your result (' + res.got.rows.length + " rows)</p>" +
         tableHtml(res.got.cols, res.got.rows);
    if (!res.passed && res.expected) {
      h += "<details open><summary>Expected (" + res.expected.rows.length +
           " rows)</summary>" + tableHtml(res.expected.cols, res.expected.rows) + "</details>";
    }
  }
  $("#io-output").innerHTML = (res.passed && isSubmit ? successBanner() : "") + h;
  if (res.passed && isSubmit) markSolved();
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* free-form run with stdin (mirrors HackerRank's Run Code box) */
async function scratchRun() {
  const res = await fetch("/api/scratch", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: EDITOR.get(), stdin: $("#io-input").value }) })
    .then((r) => r.json());
  let h = "";
  if (res.stdout) h += '<p class="muted">stdout</p><pre class="out">' + escapeHtml(res.stdout) + "</pre>";
  if (res.stderr) h += '<p class="muted bad">stderr</p><pre class="out bad">' + escapeHtml(res.stderr) + "</pre>";
  $("#io-output").innerHTML = h || '<div class="muted center">(no output)</div>';
}

/* ------------------------------------------------------------------ */
/* hints & solution                                                    */
/* ------------------------------------------------------------------ */
let hintIdx = 0;
function showHint() {
  if (!CUR || !CUR.hints.length) return;
  if (hintIdx >= CUR.hints.length) return;
  $("#hint-slot").innerHTML += '<div class="banner" style="background:#2a2c17;color:#e2d07a">' +
    "Hint " + (hintIdx + 1) + ": " + CUR.hints[hintIdx] + "</div>";
  hintIdx++;
}

async function showSolution() {
  if (!CUR) return;
  if (!confirm("Reveal the reference solution? Try 5 more minutes first.")) return;
  const s = await fetch("/api/solution/" + CUR.id).then((r) => r.json());
  $("#sol-slot").innerHTML = "<h3>Reference solution</h3>" +
    "<pre><code>" + escapeHtml(s.solution.trim()) + "</code></pre>" +
    (s.complexity ? '<p class="muted"><b>Complexity:</b> ' + escapeHtml(s.complexity) + "</p>" : "") +
    md(s.explanation);
  $("#sol-slot").scrollIntoView({ behavior: "smooth" });
}

/* ------------------------------------------------------------------ */
/* mock interview sets                                                 */
/* ------------------------------------------------------------------ */
const MOCKS = [
  { name: "Mock A - warm-up round", sql: "sql_01_appetite_join", algo: "py_03_group_anagrams",
    note: "Closest to a typical opener: a two-table join with aggregation, then a hash-map grouping problem." },
  { name: "Mock B - the likely shape", sql: "sql_05_topn_per_group", algo: "py_07_merge_intervals",
    note: "Top-N-per-group SQL (window function or correlated subquery) plus interval merging. Both show up constantly." },
  { name: "Mock C - harder", sql: "sql_08_running_exposure", algo: "py_11_accumulation_window",
    note: "Running totals with a window frame, then a sliding-window aggregation. Do this set in 45 min and you are ready." },
  { name: "Mock D - data-quality flavour", sql: "sql_04_dedupe_submissions", algo: "py_05_reconcile_feeds",
    note: "Deduplication and reconciliation. This is literally the Forward Deployed Engineer day job." },
];

function renderMock() {
  const byId = Object.fromEntries(PROBLEMS.map((p) => [p.id, p]));
  $("#mock-sets").innerHTML = MOCKS.map((m) => {
    const s = byId[m.sql], a = byId[m.algo];
    if (!s || !a) return "";
    return '<div class="mockcard"><h3>' + m.name + "</h3>" +
      '<p class="muted">' + m.note + "</p>" +
      "<p><b>Part 1 (SQL, ~18 min):</b> " + s.title + "<br>" +
      "<b>Part 2 (Algorithms, ~22 min):</b> " + a.title + "</p>" +
      '<div class="row">' +
      '<button class="secondary" onclick="startMock(\'' + m.sql + '\')">Start Part 1</button>' +
      '<button class="secondary" onclick="openProblem(\'' + m.algo + '\')">Go to Part 2</button>' +
      "</div></div>";
  }).join("");
}

function startMock(id) { resetTimer(45); startTimer(); openProblem(id); }

/* ------------------------------------------------------------------ */
/* timer                                                               */
/* ------------------------------------------------------------------ */
let tRemain = 45 * 60, tHandle = null;
function paint() {
  const m = Math.floor(Math.abs(tRemain) / 60), s = Math.abs(tRemain) % 60;
  const c = $("#clock");
  c.textContent = (tRemain < 0 ? "-" : "") + m + ":" + String(s).padStart(2, "0");
  c.className = tRemain <= 0 ? "danger" : tRemain <= 300 ? "warn" : "";
}
function startTimer() {
  if (tHandle) { clearInterval(tHandle); tHandle = null; $("#tstart").textContent = "Start"; return; }
  $("#tstart").textContent = "Pause";
  tHandle = setInterval(() => { tRemain--; paint(); }, 1000);
}
function resetTimer(mins) {
  clearInterval(tHandle); tHandle = null; $("#tstart").textContent = "Start";
  tRemain = (mins || 45) * 60; paint();
}

/* ------------------------------------------------------------------ */
/* views + wiring                                                      */
/* ------------------------------------------------------------------ */
function show(v) {
  $$(".view").forEach((x) => x.classList.add("hidden"));
  $("#view-" + v).classList.remove("hidden");
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
  if (v === "solve" && EDITOR) setTimeout(() => EDITOR.refresh(), 30);
}

function initDrag() {
  $$(".gutter").forEach((g) => {
    g.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const grid = $("#solve-grid");
      const move = (ev) => {
        const w = grid.clientWidth;
        const x = ev.clientX / w;
        if (g.dataset.drag === "1") {
          const a = Math.max(0.15, Math.min(0.6, x));
          grid.style.gridTemplateColumns = a + "fr 5px " + (1 - a - 0.25) + "fr 5px 0.25fr";
        } else {
          const cols = (grid.style.gridTemplateColumns || "0.33fr").split(" ");
          const a = parseFloat(cols[0]) || 0.33;
          const b = Math.max(0.12, Math.min(0.5, 1 - x));
          grid.style.gridTemplateColumns = a + "fr 5px " + (1 - a - b) + "fr 5px " + b + "fr";
        }
        if (EDITOR) EDITOR.refresh();
      };
      const up = () => { document.removeEventListener("mousemove", move);
                         document.removeEventListener("mouseup", up); };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  EDITOR = makeEditor();
  if (EDITOR.onChange) EDITOR.onChange(unlockSubmit);
  $$(".tab").forEach((t) => (t.onclick = () => show(t.dataset.view)));
  $$(".filt").forEach((b) => (b.onclick = () => {
    $$(".filt").forEach((x) => x.classList.remove("active"));
    b.classList.add("active"); FILTER = b.dataset.k; renderList();
  }));
  $("#search").oninput = renderList;
  $("#btn-run").onclick = () => (CUR && CUR.mode === "stdin" && $("#io-input").value.trim())
    ? scratchRun() : runCode();
  $("#btn-submit").onclick = submitCode;
  $("#btn-trace").onclick = runTrace;
  $("#t-prev").onclick = () => stepBy(-1);
  $("#t-next").onclick = () => stepBy(1);
  $("#t-play").onclick = togglePlay;
  $("#t-close").onclick = closeTrace;
  $("#t-range").oninput = (e) => { stopPlay(); setStep(+e.target.value); };
  $("#btn-ask").onclick = toggleAsk;
  $("#ask-close").onclick = toggleAsk;
  $("#ask-send").onclick = sendAsk;
  $("#ask-input").addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); sendAsk(); }
  });
  $("#btn-hint").onclick = showHint;
  $("#btn-solution").onclick = showSolution;
  $("#btn-reset").onclick = () => {
    if (CUR && confirm("Reset to the starter code?")) EDITOR.set(CUR.starter);
  };
  $("#tstart").onclick = startTimer;
  $("#treset").onclick = () => resetTimer(45);
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submitCode(); }
    const typing = /^(TEXTAREA|INPUT)$/.test((e.target.tagName || "")) ||
                   e.target.closest(".CodeMirror");
    if (!typing && (e.key === "n" || e.key === "N") && $("#btn-next")) {
      e.preventDefault(); goNext(); return;
    }
    if (TRACE && !typing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      setStep(TRACE.idx + (e.key === "ArrowRight" ? 1 : -1));
    }
  });
  initDrag(); initTraceDrag(); paint();
  loadAll().then(() => {
    const m = location.hash.match(/^#\/p\/(.+)$/);
    if (m) openProblem(decodeURIComponent(m[1]));
  });
});

/* ------------------------------------------------------------------ */
/* trace - a solver you step through, under the code                   */
/* ------------------------------------------------------------------ */
let TRACE = null, PLAY = null;

async function runTrace() {
  if (!CUR) return;
  openTracePanel();
  $("#trace-body").innerHTML = '<div class="muted">Tracing...</div>';
  const res = await fetch("/api/trace", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: CUR.id, code: EDITOR.get() }) }).then((r) => r.json());
  if (res.kind === "sql") return renderSqlTrace(res);
  return renderPyTrace(res);
}

const TRACE_H_KEY = "whetstone.traceHeight";
const TRACE_H_DEFAULT = 265;

function traceHeight(h) {
  const panel = $("#trace-panel"), pane = $("#pane-editor");
  const max = Math.max(80, pane.clientHeight - 110);   // always leave code visible
  h = Math.max(34, Math.min(max, h));                  // 34px = just the controls
  panel.style.height = h + "px";
  if (EDITOR.refresh) EDITOR.refresh();
  return h;
}

function openTracePanel() {
  const panel = $("#trace-panel");
  panel.classList.remove("hidden");
  const cur = panel.getBoundingClientRect().height;
  if (cur < 60) {   // was collapsed: reopen at the last size the user chose
    traceHeight(+localStorage.getItem(TRACE_H_KEY) || TRACE_H_DEFAULT);
  }
  if (EDITOR.refresh) setTimeout(() => EDITOR.refresh(), 30);
}

function initTraceDrag() {
  const grip = $("#trace-grip"), panel = $("#trace-panel");
  grip.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const startY = e.clientY, startH = panel.getBoundingClientRect().height;
    grip.classList.add("dragging");
    document.body.classList.add("row-resizing");
    const move = (ev) => traceHeight(startH + (startY - ev.clientY));
    const up = () => {
      grip.classList.remove("dragging");
      document.body.classList.remove("row-resizing");
      const h = panel.getBoundingClientRect().height;
      if (h > 60) localStorage.setItem(TRACE_H_KEY, Math.round(h));
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
  grip.addEventListener("dblclick", () => {
    const h = panel.getBoundingClientRect().height;
    traceHeight(h <= 60 ? (+localStorage.getItem(TRACE_H_KEY) || TRACE_H_DEFAULT) : 34);
  });
  const saved = +localStorage.getItem(TRACE_H_KEY);
  if (saved > 60) panel.style.height = saved + "px";
}

function closeTrace() {
  stopPlay();
  $("#trace-panel").classList.add("hidden");
  TRACE = null;
  if (EDITOR.highlight) EDITOR.highlight(null);
  if (EDITOR.refresh) setTimeout(() => EDITOR.refresh(), 30);
}

function indentOf(line) { return ((line || "").match(/^\s*/) || [""])[0].length; }

/* Turn one transition into a sentence: what just happened, and why we moved here. */
function narrate(steps, i, source, funcs) {
  const s = steps[i];
  const prev = i > 0 ? steps[i - 1] : null;
  const changed = s.changed || [];
  const vals = changed.map((n) =>
    "<code>" + escapeHtml(n) + " = " + escapeHtml(s.locals[n]) + "</code>").join(", ");
  const where = (funcs && funcs.length > 1)
    ? ' <span class="muted">(in ' + escapeHtml(s.func) + ")</span>" : "";

  if (!prev) return "The function was called. Its arguments are set up and nothing " +
                    "else has run yet." + where;

  const praw = source[prev.line - 1] || "";
  const psrc = praw.trim();
  const pl = "<b>line " + prev.line + "</b>";

  // a call returned, and we are back in the caller
  if (prev.returned !== undefined && prev.fid !== s.fid)
    return "<b>" + escapeHtml(prev.func) + "()</b> returned <code>" +
           escapeHtml(prev.returned) + "</code>, so we are back in " +
           escapeHtml(s.func) + "().";

  // we stepped into a call
  if (prev.fid !== s.fid)
    return pl + " called <b>" + escapeHtml(s.func) + "()</b>" +
           (changed.length ? ", with " + vals : "") + ".";

  // the same line running again: a loop body on one line, or an inlined comprehension
  if (prev.line === s.line)
    return changed.length
      ? pl + " is iterating: " + vals + "." + where
      : pl + " ran again." + where;

  if (/^for\b/.test(psrc))
    return changed.length
      ? "The loop on " + pl + " handed out the next values: " + vals + "." + where
      : "The loop on " + pl + " had nothing left, so it ended." + where;

  if (/^(if|elif|while)\b/.test(psrc)) {
    const took = indentOf(source[s.line - 1]) > indentOf(praw);
    return "The condition on " + pl + " was <b>" + (took ? "true" : "false") +
           "</b>, so we " + (took ? "stepped into" : "skipped") + " its block." + where;
  }

  if (changed.length) return pl + " set " + vals + "." + where;
  return pl + " ran without changing any variable." + where;
}

function renderPyTrace(res) {
  stopPlay();
  if ((!res.steps || !res.steps.length)) {
    $("#trace-body").innerHTML = '<div class="banner bad">' +
      escapeHtml(res.error || "Nothing was traced. Have you written the function yet?") +
      "</div>";
    return;
  }
  TRACE = { steps: res.steps, source: res.source, idx: 0, res: res };
  const c = res.case;
  const inp = c.stdin ? c.stdin : (c.args || []).map((a) => JSON.stringify(a)).join(", ");
  $("#trace-body").innerHTML =
    '<div class="trace-note">Input <b>' + escapeHtml(inp) + "</b>" +
    (c.expected !== undefined
      ? " &middot; expected <b>" + escapeHtml(JSON.stringify(c.expected)) + "</b>" : "") +
    ' &middot; use &larr; &rarr; to step' +
    (res.collapsed ? " &middot; steps inside lambdas and generator expressions are collapsed" : "") +
    "</div>" +
    '<p class="narr" id="t-narr"></p><div class="chips" id="t-chips"></div>' +
    '<div class="trace-end" id="t-end"></div>';
  $("#t-range").max = res.steps.length - 1;
  setStep(0);
}

function setStep(i) {
  if (!TRACE) return;
  const n = TRACE.steps.length;
  i = Math.max(0, Math.min(n - 1, i));
  TRACE.idx = i;
  const s = TRACE.steps[i];
  const src = (TRACE.source[s.line - 1] || "").trim();

  $("#t-range").value = i;
  $("#t-count").textContent = (i + 1) + " / " + n;
  $("#t-prev").disabled = i === 0;
  $("#t-next").disabled = i === n - 1;

  const next = s.returned !== undefined
    ? '<span class="next">This line has just finished.</span>'
    : '<span class="next">Next to run: <code>' + escapeHtml(src) + "</code></span>";
  $("#t-narr").innerHTML = '<span class="did">' + narrate(TRACE.steps, i, TRACE.source, TRACE.res.funcs) +
                           "</span><br>" + next;

  const names = Object.keys(s.locals).sort();
  $("#t-chips").innerHTML = names.length
    ? names.map((nm) => '<span class="chip ' +
        ((s.changed || []).indexOf(nm) >= 0 ? "changed" : "") + '">' +
        '<span class="cn">' + escapeHtml(nm) + '</span>' +
        '<span class="cv">' + escapeHtml(s.locals[nm]) + "</span></span>").join("")
    : '<span class="muted">no local variables yet</span>';

  if (i === n - 1) {
    const r = TRACE.res;
    let end = "";
    if (r.truncated) end += '<div class="trace-note">Stopped at the step limit; the ' +
      "run was longer than the tracer records.</div>";
    end += r.error ? '<div class="banner bad">' + escapeHtml(r.error) + "</div>"
                   : '<div class="banner ok">returned ' + escapeHtml(r.result) + "</div>";
    if (r.printed) end += '<pre class="out">' + escapeHtml(r.printed) + "</pre>";
    $("#t-end").innerHTML = end;
    stopPlay();
  } else {
    $("#t-end").innerHTML = "";
  }
  if (EDITOR.highlight) EDITOR.highlight(s.line);
}

function stepBy(d) { if (TRACE) setStep(TRACE.idx + d); }

function stopPlay() {
  if (PLAY) clearInterval(PLAY);
  PLAY = null;
  const b = $("#t-play");
  if (b) { b.classList.remove("on"); b.innerHTML = "&#9654;"; }
}

function togglePlay() {
  if (!TRACE) return;
  if (PLAY) return stopPlay();
  if (TRACE.idx >= TRACE.steps.length - 1) setStep(0);
  const b = $("#t-play");
  b.classList.add("on"); b.innerHTML = "&#10073;&#10073;";
  PLAY = setInterval(() => {
    if (!TRACE || TRACE.idx >= TRACE.steps.length - 1) return stopPlay();
    setStep(TRACE.idx + 1);
  }, 850);
}

function renderSqlTrace(res) {
  TRACE = null;
  $("#t-range").max = 0;
  $("#t-count").textContent = "";
  let h = "";
  if (res.note) h += '<div class="trace-note">' + escapeHtml(res.note) + "</div>";
  else h += '<div class="trace-note">Each CTE run on its own, in order. This is how ' +
            "to debug a query under pressure: check each step before trusting the whole.</div>";
  res.steps.forEach((st, i) => {
    const rows = st.error
      ? '<pre class="out bad">' + escapeHtml(st.error) + "</pre>"
      : '<p class="muted small">' + st.rows.length + " rows</p>" + tableHtml(st.cols, st.rows);
    h += '<details class="cte-step"' + (i === res.steps.length - 1 ? " open" : "") +
      "><summary>step " + (i + 1) + ": " + escapeHtml(st.name) + "</summary>" +
      '<div class="inner">' + rows + "</div></details>";
  });
  if (res.final) {
    h += '<details class="cte-step" open><summary>final result</summary><div class="inner">' +
      (res.final.error ? '<pre class="out bad">' + escapeHtml(res.final.error) + "</pre>"
        : '<p class="muted small">' + res.final.rows.length + " rows</p>" +
          tableHtml(res.final.cols, res.final.rows)) + "</div></details>";
  }
  if (res.plan && !res.plan.error) {
    h += '<details class="cte-step"><summary>query plan</summary><div class="inner">' +
      tableHtml(res.plan.cols, res.plan.rows) + "</div></details>";
  }
  $("#trace-body").innerHTML = h;
}

/* ------------------------------------------------------------------ */
/* ask                                                                 */
/* ------------------------------------------------------------------ */
function lastResultsText() {
  const el = $("#io-output");
  if (!el) return "";
  const t = el.innerText || "";
  return t.indexOf("Run Code to see") >= 0 ? "" : t.slice(0, 1500);
}

const ASK_REASONS = {
  install: "The <code>anthropic</code> package is not installed, so answers cannot be " +
    "generated here. Run <code>pip install anthropic</code> to enable it, or paste the " +
    "prompt below into any AI tool.",
  auth: "No working Anthropic credentials were found. Set <code>ANTHROPIC_API_KEY</code> " +
    "(or run <code>ant auth login</code>), or paste the prompt below into any AI tool.",
  ratelimit: "Rate limited. Paste the prompt below into any AI tool, or retry shortly.",
  offline: "Could not reach the API. Paste the prompt below into any AI tool.",
  refusal: "The model declined to answer that. Try rephrasing.",
  error: "Something went wrong calling the API. Paste the prompt below into any AI tool.",
};

async function sendAsk() {
  const q = $("#ask-input").value.trim();
  if (!q || !CUR) return;
  const log = $("#ask-log");
  log.innerHTML += '<p class="ask-q">' + escapeHtml(q) + "</p>" +
    '<div class="ask-a" id="ask-pending"><span class="muted">Thinking...</span></div>';
  log.scrollTop = log.scrollHeight;
  $("#ask-input").value = "";

  const res = await fetch("/api/ask", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: CUR.id, code: EDITOR.get(), question: q,
                           results: lastResultsText() }) }).then((r) => r.json());

  const slot = $("#ask-pending");
  slot.removeAttribute("id");
  if (res.mode === "live") {
    slot.innerHTML = md(res.answer);
  } else {
    const why = ASK_REASONS[res.reason] || ASK_REASONS.error;
    slot.innerHTML = '<div class="trace-note">' + why +
      (res.detail ? "<br><i>" + escapeHtml(res.detail) + "</i>" : "") + "</div>" +
      '<button class="secondary" id="copy-prompt">Copy prompt</button>' +
      "<details><summary>show the prompt</summary>" +
      '<div class="copybox">' + escapeHtml(res.prompt || "") + "</div></details>";
    const btn = slot.querySelector("#copy-prompt");
    if (btn) btn.onclick = () => {
      navigator.clipboard.writeText(res.prompt || "");
      btn.textContent = "Copied";
      setTimeout(() => { btn.textContent = "Copy prompt"; }, 1500);
    };
  }
  log.scrollTop = log.scrollHeight;
}

function toggleAsk() {
  const p = $("#ask-panel");
  p.classList.toggle("hidden");
  if (!p.classList.contains("hidden")) $("#ask-input").focus();
}

/* ------------------------------------------------------------------ */
/* celebrate + move on                                                 */
/* ------------------------------------------------------------------ */
function successBanner() {
  const next = nextProblem();
  return '<div class="solved-box">' +
    '<div class="solved-title">Solved</div>' +
    '<div class="solved-sub">' +
    (next ? "Up next: " + escapeHtml(next.title) : "That was the last unsolved problem.") +
    "</div>" +
    '<button class="primary" id="btn-next">' +
    (next ? "Next problem &rarr;" : "Back to the list") + "</button>" +
    (next ? '<span class="muted small">or press N</span>' : "") + "</div>";
}

function nextProblem() {
  if (!CUR) return null;
  const i = PROBLEMS.findIndex((p) => p.id === CUR.id);
  if (i < 0) return null;
  for (let k = 1; k <= PROBLEMS.length; k++) {
    const p = PROBLEMS[(i + k) % PROBLEMS.length];
    if ((PROGRESS[p.id] || {}).status !== "solved") return p;
  }
  return null;
}

function goNext() {
  const n = nextProblem();
  if (n) openProblem(n.id);
  else show("list");
}

function markSolved() {
  saveCode({ status: "solved" });
  renderList();
  lockSubmit();
  celebrate();
  const b = $("#btn-next");
  if (b) b.onclick = goNext;
}

function celebrate() {
  if (window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = document.createElement("canvas");
  cv.className = "confetti";
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr;
  cv.style.width = innerWidth + "px";
  cv.style.height = innerHeight + "px";
  const colors = ["#39c06c", "#4aa3ff", "#e2b93b", "#ec5b5b", "#ffffff", "#9b6bff"];
  const parts = [];
  for (let i = 0; i < 150; i++) {
    parts.push({
      x: W * (0.15 + 0.7 * Math.random()),
      y: H * (0.5 + 0.15 * Math.random()),
      vx: (Math.random() - 0.5) * 15 * dpr,
      vy: (-9 - Math.random() * 10) * dpr,
      w: (5 + Math.random() * 6) * dpr,
      h: (8 + Math.random() * 9) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.32,
      c: colors[(Math.random() * colors.length) | 0],
    });
  }
  let f = 0;
  (function tick() {
    ctx.clearRect(0, 0, W, H);
    f++;
    for (const p of parts) {
      p.vy += 0.34 * dpr; p.vx *= 0.995;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - f / 145);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (f < 145) requestAnimationFrame(tick);
    else cv.remove();
  })();
}
