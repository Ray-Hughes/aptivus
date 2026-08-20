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
    cm.on("cursorActivity", () => {
      const c = cm.getCursor();
      $("#pos").textContent = "Line: " + (c.line + 1) + " Col: " + (c.ch + 1);
    });
    return {
      get: () => cm.getValue(), set: (v) => cm.setValue(v),
      mode: (m) => cm.setOption("mode", m),
      focus: () => cm.focus(), refresh: () => cm.refresh(),
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
           mode: () => {}, focus: () => ta.focus(), refresh: () => {} };
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

async function runCode() { await execute("/api/run", "Sample tests"); }
async function submitCode() { await execute("/api/submit", "All tests"); }

async function execute(url, label) {
  if (!CUR) return;
  const code = EDITOR.get();
  saveCode({ code, status: (PROGRESS[CUR.id] || {}).status || "tried" });
  $("#io-output").innerHTML = '<div class="muted center">Running...</div>';
  const res = await fetch(url, { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: CUR.id, code }) }).then((r) => r.json());
  if (res.kind === "sql") return renderSql(res, label);
  return renderPy(res, label);
}

function renderPy(res, label) {
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
  if (all) { saveCode({ status: "solved" }); renderList(); }
  $("#io-output").innerHTML = h;
}

function renderSql(res, label) {
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
  if (res.passed) { saveCode({ status: "solved" }); renderList(); }
  $("#io-output").innerHTML = h;
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
  $$(".tab").forEach((t) => (t.onclick = () => show(t.dataset.view)));
  $$(".filt").forEach((b) => (b.onclick = () => {
    $$(".filt").forEach((x) => x.classList.remove("active"));
    b.classList.add("active"); FILTER = b.dataset.k; renderList();
  }));
  $("#search").oninput = renderList;
  $("#btn-run").onclick = () => (CUR && CUR.mode === "stdin" && $("#io-input").value.trim())
    ? scratchRun() : runCode();
  $("#btn-submit").onclick = submitCode;
  $("#btn-hint").onclick = showHint;
  $("#btn-solution").onclick = showSolution;
  $("#btn-reset").onclick = () => {
    if (CUR && confirm("Reset to the starter code?")) EDITOR.set(CUR.starter);
  };
  $("#tstart").onclick = startTimer;
  $("#treset").onclick = () => resetTimer(45);
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submitCode(); }
  });
  initDrag(); paint();
  loadAll().then(() => {
    const m = location.hash.match(/^#\/p\/(.+)$/);
    if (m) openProblem(decodeURIComponent(m[1]));
  });
});
