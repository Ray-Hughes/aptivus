/**
 * Everything the scorecard says, derived in one place.
 *
 * The rule the whole file obeys: **there is no score, no grade and no
 * percentile.** There is a fact strip, a timeline, and prose. Every comparison
 * is to the learner's own history and never to other users, and the prose is
 * generated from what actually happened rather than picked from a list of
 * canned paragraphs — so a round where you solved the SQL and ran out of road
 * on the algorithms reads differently from a round where you stopped early,
 * because those are different things and a good interviewer would say so.
 *
 * Timing here is server truth. `total` is `ended_at - started_at`, both
 * written by the server. The activity trace is the only client-witnessed
 * input, and it is clamped to that total before it ever reaches this file.
 */
import { noteFor } from "@/lib/mock-notes";

export type Activity = "read" | "write" | "debug" | "idle";
export type Block = { p: number; a: Activity; d: number };
export type EventKind = "run" | "solved" | "stopped" | "done" | "switch";
export type RoundEvent = { at: number; p: number; k: EventKind; pass?: number; total?: number };

export const ACTIVITIES: Activity[] = ["read", "write", "debug", "idle"];
export const ACTIVITY_LABEL: Record<Activity, string> = {
  read: "Reading",
  write: "Writing",
  debug: "Debugging",
  idle: "Thinking / idle",
};

export type SlotInput = {
  index: number;
  slug: string;
  title: string;
  kind: "sql" | "code";
  difficulty: string;
  pattern: string | null;
  minutesBudget: number;
  solved: boolean;
  stopped: boolean;
  attempts: number;
  timeSpentMs: number;
  firstRunAt: number | null;
  solvedAt: number | null;
  checksPassed: number | null;
  checksTotal: number | null;
  /** How many hidden+sample cases the grader would run, for the "of N". */
  testTotal: number;
  /** Clean solves out of attempts on this pattern, before this round. */
  history: { clean: number; seen: number };
};

export type RoundInput = {
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  sourceName: string;
  shape: string;
  blocks: Block[];
  events: RoundEvent[];
};

/* ------------------------------------------------------------------ */
/* formatting                                                          */
/* ------------------------------------------------------------------ */
export const mmss = (s: number) => {
  const n = Math.abs(Math.round(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};
export const dur = (s: number) => {
  const n = Math.round(s);
  const m = Math.floor(n / 60);
  const r = n % 60;
  return m ? `${m}m${r ? ` ${String(r).padStart(2, "0")}s` : ""}` : `${r}s`;
};
export const mins = (s: number) => {
  const n = Math.round(s / 60);
  return `${n} ${n === 1 ? "minute" : "minutes"}`;
};

/* ------------------------------------------------------------------ */
/* the derivation                                                      */
/* ------------------------------------------------------------------ */
export type LaidBlock = Block & { at: number };
export type Split = Record<Activity, number> & { total: number };

export type DerivedProblem = SlotInput & {
  t: Split;
  outcome: "solved" | "partial" | "unfinished" | "stopped";
  budget: number;
  firstKeyAt: number | null;
  firstKeyDelay: number | null;
  seconds: number;
  checks: { passed: number; total: number } | null;
};

export type Summary = {
  len: number;
  total: number;
  over: number;
  unspent: number;
  laid: LaidBlock[];
  act: Split;
  P: DerivedProblem[];
  runsMerged: { p: number; at: number; d: number }[];
  switches: number;
  solvedCount: number;
  checks: number;
  checksTotal: number;
  sourceName: string;
  events: RoundEvent[];
  gems: number;
};

const emptySplit = (): Split => ({ read: 0, write: 0, debug: 0, idle: 0, total: 0 });

const EARN: Record<string, number> = { easy: 2, medium: 4, hard: 6 };

export function summarize(round: RoundInput, slots: SlotInput[]): Summary {
  const len = round.durationSeconds;
  const total = Math.max(0, round.endedAt - round.startedAt);

  // The trace is the client's account of the round; the clock is ours. Where
  // the two disagree, the clock wins and the difference is called idle —
  // because time the browser could not account for is, by definition, time
  // nobody was typing.
  const laid: LaidBlock[] = [];
  const per = slots.map(() => emptySplit());
  let at = 0;
  for (const b of round.blocks) {
    if (at >= total) break;
    const d = Math.min(b.d, total - at);
    if (d <= 0) continue;
    const p = Math.min(Math.max(0, b.p), slots.length - 1);
    laid.push({ p, a: b.a, d, at });
    per[p][b.a] += d;
    per[p].total += d;
    at += d;
  }
  if (at < total) {
    const p = laid.length ? laid[laid.length - 1].p : 0;
    const d = total - at;
    laid.push({ p, a: "idle", d, at });
    per[p].idle += d;
    per[p].total += d;
    at = total;
  }

  const P: DerivedProblem[] = slots.map((s, i) => {
    const evs = round.events.filter((e) => e.p === i);
    const runs = evs.filter((e) => e.k === "run");
    const firstWrite = laid.find((b) => b.p === i && b.a === "write");
    const firstBlock = laid.find((b) => b.p === i);
    const checks =
      s.checksTotal != null && s.checksPassed != null
        ? { passed: s.checksPassed, total: s.checksTotal }
        : runs.length
          ? { passed: runs[runs.length - 1].pass ?? 0, total: runs[runs.length - 1].total ?? s.testTotal }
          : null;
    return {
      ...s,
      t: per[i],
      seconds: per[i].total,
      budget: s.minutesBudget * 60,
      outcome: s.stopped ? "stopped" : s.solved ? "solved" : checks ? "partial" : "unfinished",
      firstKeyAt: firstWrite ? firstWrite.at : null,
      firstKeyDelay: firstWrite && firstBlock ? firstWrite.at - firstBlock.at : null,
      checks,
    };
  });

  const runsMerged: { p: number; at: number; d: number }[] = [];
  for (const b of laid) {
    const last = runsMerged[runsMerged.length - 1];
    if (last && last.p === b.p) last.d += b.d;
    else runsMerged.push({ p: b.p, at: b.at, d: b.d });
  }

  const act = emptySplit();
  for (const b of laid) {
    act[b.a] += b.d;
    act.total += b.d;
  }

  return {
    len,
    total,
    over: Math.max(0, total - len),
    unspent: Math.max(0, len - total),
    laid,
    act,
    P,
    runsMerged,
    switches: Math.max(0, runsMerged.length - 1),
    solvedCount: P.filter((p) => p.solved).length,
    checks: P.reduce((a, p) => a + (p.checks?.passed ?? 0), 0),
    checksTotal: P.reduce((a, p) => a + (p.checks?.total ?? p.testTotal), 0),
    sourceName: round.sourceName,
    events: round.events,
    // The round pays nothing. The problems inside it pay the normal
    // first-clean-solve rate, awarded by the submit route — this is the
    // headline the scorecard prints, not a second award.
    gems: P.filter((p) => p.solved).reduce((a, p) => a + (EARN[p.difficulty] ?? 0), 0),
  };
}

/* ------------------------------------------------------------------ */
/* the verdict                                                         */
/* ------------------------------------------------------------------ */

const half = (p: DerivedProblem) => (p.kind === "sql" ? "SQL half" : "algorithms half");
const pct = (a: number, b: number) => Math.round((a / Math.max(1, b)) * 100);

/**
 * Named plainly, then normalized, then the one thing that would change it.
 * Branching on solved count, overtime, whether a problem was stopped
 * deliberately, and whether the unsolved one lost more time to debugging than
 * to writing — because those four facts are what an interviewer would actually
 * have noticed.
 */
export function buildVerdict(S: Summary): string[] {
  const n = S.P.length;
  const solved = S.P.filter((p) => p.solved);
  const unsolved = S.P.filter((p) => !p.solved);
  let p1: string;
  let p2: string;

  if (S.solvedCount === n && n > 0) {
    p1 =
      `You closed ${n === 1 ? "it" : "both"} inside the clock` +
      (S.over ? `, though ${mmss(S.over)} of it was after time` : `, with ${mmss(S.unspent)} to spare`) +
      ". That is a round an interviewer would write up as a clear pass, and the interesting question stops being can you and starts being how did you talk while you did it.";
    const slowest = [...S.P].sort((a, b) => b.t.total / b.budget - a.t.total / a.budget)[0];
    p2 =
      `The ${half(slowest)} cost you ${dur(slowest.t.total)} against a ${Math.round(slowest.budget / 60)} minute budget, and ` +
      `${pct(slowest.t.debug, slowest.t.total)}% of that was after a failing run. Getting there is not in doubt; getting there without the detour is the thing left to practice.`;
  } else if (S.solvedCount > 0) {
    const s = solved[0];
    const u = unsolved[0];
    p1 =
      `You would have got through the ${half(s)} comfortably and ` +
      (u.stopped ? `made the call to stop on the ${half(u)}` : `run out of road on the ${half(u)}`) +
      `. In a real ${Math.round(S.len / 60)} that reads as a pass on one half and an incomplete on the other, which is a very common outcome and not a disaster — ` +
      "interviewers see it constantly and it is almost always a time-management story rather than a knowledge one.";
    p2 =
      `The ${half(S.P[0])} took ${dur(S.P[0].t.total)} and the ${half(S.P[1] ?? S.P[0])} took ${dur((S.P[1] ?? S.P[0]).t.total)}. ` +
      `On the one that did not close you had a ${Math.round(u.budget / 60)} minute budget` +
      (u.checks ? ` and reached ${u.checks.passed} of ${u.checks.total} checks` : " and never ran it") +
      ". " +
      (u.t.debug > u.t.write
        ? "More of that went on debugging than on writing, which is the signal worth acting on."
        : "Most of it went on writing rather than diagnosing, so the approach was the gap, not the execution.");
  } else {
    p1 =
      `Neither problem closed${S.over ? `, and you were ${mmss(S.over)} past the end when you stopped` : ""}. ` +
      "Read that as information, not as a verdict — you have the shape of both, and that makes it a fixable round rather than a bad one.";
    const worst = [...S.P].sort((a, b) => b.t.debug - a.t.debug)[0];
    const anyRun = S.P.some((p) => p.attempts > 0);
    p2 = !anyRun
      ? "You never ran either one. Whatever else happens in a round, get something running — a partial answer you can point at and reason about beats a perfect one nobody ever saw execute."
      : worst.t.debug < 120
        ? "Neither one reached a passing run, and neither stalled in debugging — which means the gap was the approach rather than the execution. Spend the first ninety seconds stating the brute force out loud before you type."
        : `You spent ${dur(worst.t.debug)} debugging the ${half(worst)} after the first failing run. ` +
          `That is the pattern to break: at three minutes stuck, a real interviewer wants to hear “I know I want a ${worst.pattern ?? "different approach"} here, I am not sure how to …” rather than silence with a cursor blinking.`;
  }

  const st = S.P.find((p) => p.stopped);
  if (st) {
    p2 +=
      ` Calling time on the ${half(st)} after ${mmss(st.t.total)} was the right instinct, by the way — ` +
      "a working half beats an unfinished clever whole, and saying so out loud is a point in your favour, not against.";
  }
  return [p1, p2];
}

/* ------------------------------------------------------------------ */
/* callouts under the timeline                                         */
/* ------------------------------------------------------------------ */
export type Callout = { value: string; text: string };

export function buildCallouts(S: Summary): Callout[] {
  const cands: (Callout & { w: number })[] = [];

  const slow = [...S.P].sort((a, b) => (b.firstKeyDelay ?? 0) - (a.firstKeyDelay ?? 0))[0];
  if (slow && slow.firstKeyDelay != null) {
    cands.push({
      w: 60,
      value: mmss(slow.firstKeyDelay),
      text: `before your first keystroke on problem ${slow.index + 1}. That is not too long — but in a real round the cost is the silence, not the minutes. Read it out loud.`,
    });
  }

  const worst = [...S.P].sort((a, b) => b.t.debug - a.t.debug)[0];
  if (worst && worst.t.debug > 0) {
    cands.push({
      w: worst.t.debug / Math.max(1, S.total) > 0.25 ? 90 : 40,
      value: `${pct(worst.t.debug, worst.t.total)}%`,
      text: `of your time on problem ${worst.index + 1} came after a failing run. Debugging is where ${
        worst.solved ? "you got there in the end" : "this round was lost"
      }.`,
    });
  }

  if (S.over > 0) {
    cands.push({
      w: 80,
      value: `+${mmss(S.over)}`,
      text: "past the end of the clock. Useful to know: in the real thing that work would not have existed.",
    });
  } else {
    cands.push({
      w: 30,
      value: mmss(S.unspent),
      text: "of the clock unspent. Ending early is honest, and it beats padding — but check you were genuinely finished, not just tired.",
    });
  }

  if (S.switches === 0) {
    cands.push({
      w: 55,
      value: "0",
      text: "switches between the problems. You worked them strictly in order, which is fine — but it means a hard first problem eats the second one.",
    });
  } else if (S.switches === 1) {
    cands.push({
      w: 50,
      value: mmss(S.runsMerged[1]?.at ?? 0),
      text: "one switch, and you did not come back. Worth asking whether you moved on early enough.",
    });
  } else {
    cands.push({
      w: 45,
      value: String(S.switches),
      text: "switches. Moving between problems is free here; in the real round it costs you the interviewer's context, so do it deliberately.",
    });
  }

  const idlePct = pct(S.act.idle, S.total);
  if (idlePct >= 12) {
    cands.push({
      w: 70,
      value: `${idlePct}%`,
      text: "of the round with no keystroke and no run pending. That is thinking time, and it is fine — as long as it was out loud.",
    });
  }

  return cands
    .sort((a, b) => b.w - a.w)
    .slice(0, 3)
    .map(({ value, text }) => ({ value, text }));
}

/* ------------------------------------------------------------------ */
/* per-problem note                                                    */
/* ------------------------------------------------------------------ */
export function problemNote(p: DerivedProblem): string[] {
  const note = noteFor(p.pattern, p.kind);
  const bits = [p.solved ? note.solved : note.stuck];
  const ratio = p.t.total / Math.max(1, p.budget);

  if (p.solved && ratio <= 1.1) {
    bits.push(`Time: ${dur(p.t.total)} against a ${Math.round(p.budget / 60)} minute budget. That is the pace you want.`);
  } else if (p.solved) {
    bits.push(
      `It cost ${dur(p.t.total)} against a ${Math.round(p.budget / 60)} minute budget. Correct and slow still passes; correct and slow twice in one round does not.`,
    );
  } else if (p.stopped) {
    bits.push(
      `You stopped at ${dur(p.t.total)}. Nothing wrong with that. In the room, say the sentence out loud: “I want to make sure we have something working — let me finish the straightforward version and note where I'd optimize.”`,
    );
  } else {
    bits.push(
      `You put ${dur(p.t.total)} into it against a ${Math.round(p.budget / 60)} minute budget and did not close it. The budget is not a target, but twice over it is the moment to ask for a nudge.`,
    );
  }

  if (p.firstKeyDelay != null && p.firstKeyDelay > 180) {
    bits.push(
      `${mmss(p.firstKeyDelay)} passed before your first keystroke. The first ninety seconds are the highest-leverage of a round — but only if the interviewer can hear them.`,
    );
  }
  return bits;
}

/* ------------------------------------------------------------------ */
/* what to work on next                                                */
/* ------------------------------------------------------------------ */
export type NextStep = { title: string; body: string; cta: string; slug?: string; again?: boolean };

export function buildNext(S: Summary): NextStep[] {
  const out: (NextStep & { w: number })[] = [];
  const rateOf = (p: DerivedProblem) => (p.history.seen ? p.history.clean / p.history.seen : 1);

  // Weakest pattern first, so this list agrees with the patterns table above it.
  for (const p of S.P.filter((x) => !x.solved)) {
    const note = noteFor(p.pattern, p.kind);
    out.push({ w: 100 + (1 - rateOf(p)) * 10, title: note.next.title, body: note.next.body, cta: "Drill it", slug: p.slug });
  }
  for (const p of S.P.filter((x) => x.solved)) {
    const rate = rateOf(p);
    if (rate < 0.7 && p.history.seen > 0) {
      const note = noteFor(p.pattern, p.kind);
      out.push({
        w: 70,
        title: note.next.title,
        body: `You got it this time, but your history on ${p.pattern ?? "this pattern"} is ${p.history.clean} of ${p.history.seen}. One clean run is not the same as owning it. ${note.next.body}`,
        cta: "Drill it",
        slug: p.slug,
      });
    }
  }

  const worst = [...S.P].sort((a, b) => b.t.debug - a.t.debug)[0];
  if (S.over > 0) {
    out.push({
      w: 85,
      title: `Call it at the ${Math.max(5, Math.round(S.len / 60) - 10)} minute mark`,
      body: `You ran ${mmss(S.over)} past the end. In the room nobody grants that. At about ${Math.max(5, Math.round(S.len / 60) - 10)} minutes, say “I want to make sure we have something working” and ship the straightforward version — a working brute force beats an unfinished clever solution, every time.`,
      cta: "Add to plan",
    });
  } else if (worst && worst.t.debug / Math.max(1, worst.t.total) > 0.3) {
    out.push({
      w: 75,
      title: "Narrate the debugging, not just the writing",
      body: `Your longest silent stretch was ${dur(worst.t.debug)} after a failing run on problem ${worst.index + 1}. That is exactly the window where an interviewer cannot tell whether you are close or lost. Say the hypothesis out loud before you test it.`,
      cta: "Add to plan",
    });
  }

  out.push({
    w: 40,
    title: "Run one more round before you stop tonight",
    body: "Two rounds back to back is the closest thing to the real fatigue. Record the second one and play it back — you will hear the dead air, and the dead air is what costs you.",
    cta: "Start a round",
    again: true,
  });

  // Process work from the interview-day notes, which fills the list when the
  // round itself was clean — because a clean round still has a "how did you
  // talk while you did it" answer.
  const slowStart = [...S.P].sort((a, b) => (b.firstKeyDelay ?? 0) - (a.firstKeyDelay ?? 0))[0];
  out.push({
    w: 34,
    title: "Finish out loud, not just correctly",
    body: "When the tests go green, do not stop. Walk your own edge cases, state the complexity — “O(n) time, O(n) space, one pass” — and offer the trade-off. Three sentences, real points, and most candidates skip all three.",
    cta: "Add to plan",
  });
  out.push({
    w: 32,
    title: "Two clarifying questions before you type",
    body:
      "“Can the input be empty?” · “Can there be duplicates?” · “Roughly how large is n?” " +
      (slowStart && (slowStart.firstKeyDelay ?? 0) > 120
        ? `You had ${mmss(slowStart.firstKeyDelay ?? 0)} of silent reading this round — that is exactly where those questions belong.`
        : "They cost thirty seconds and they catch the misunderstanding while it is still free."),
    cta: "Add to plan",
  });
  if (S.P.some((p) => p.kind === "sql")) {
    out.push({
      w: 30,
      title: "Say the grain of every table out loud",
      body: "Before the SQL question, name what one row means in each table: “submissions is one row per submission, quotes is one row per quote, so a submission can have several quotes — watch for fan-out.” It is the habit that separates people who write SQL from people you trust with a customer's numbers.",
      cta: "Add to plan",
    });
  }

  return out
    .sort((a, b) => b.w - a.w)
    .slice(0, 3)
    .map(({ title, body, cta, slug, again }) => ({ title, body, cta, slug, again }));
}

/* ------------------------------------------------------------------ */
/* the headline                                                        */
/* ------------------------------------------------------------------ */
export function eyebrow(S: Summary): string {
  const kinds = S.P.map((p) => (p.kind === "sql" ? "SQL" : "algorithms")).join(" · ");
  return `${S.sourceName} · ${Math.round(S.len / 60)} minute round · ${kinds}`;
}

/** Ranked weakest-first, matching the order of "what to work on next". */
export function patternRows(S: Summary) {
  return [...S.P].sort((a, b) => {
    const f = (p: DerivedProblem) => (p.history.seen ? p.history.clean / p.history.seen : 1);
    return f(a) - f(b);
  });
}

export function standing(clean: number, seen: number): { label: string; tone: "bad" | "warn" | "ok" } {
  // One encounter is not a record. Calling a pattern you met for the first
  // time today your "weakest" is the kind of judgment that makes a scorecard
  // feel like a grade rather than like feedback.
  if (seen < 2) return { label: "new to you", tone: "warn" };
  const rate = clean / seen;
  if (rate < 0.5) return { label: "weakest", tone: "bad" };
  if (rate < 0.8) return { label: "not owned yet", tone: "warn" };
  return { label: "solid", tone: "ok" };
}
