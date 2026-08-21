/**
 * Write the JavaScript bindings into the migrated v2 problems.
 *
 * The JSON files under packs/ are the source of truth for content; this script
 * exists so the bindings could be authored as real JavaScript - lintable,
 * runnable, diffable - rather than typed into JSON string literals with
 * hand-escaped newlines. It is idempotent: run it again after editing a
 * solution here and the pack is updated in place.
 *
 *     node scripts/add-js-bindings.mjs
 *
 * Nothing is added speculatively. Every binding below is executed against the
 * problem's full test set by `verify.mjs`, hidden tests included, and a problem
 * with only Python filled in is a perfectly valid problem. A wrong JavaScript
 * solution is worse than an absent one.
 *
 * The notes are written for a Ruby developer learning JavaScript, mirroring how
 * the Python notes are written for a Rubyist learning Python. They are about
 * the places the two languages disagree, not about the algorithm - the
 * algorithm is explained once, language-neutrally, in `explanation`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PACKS_DIR } from "../src/index.mjs";

/* ------------------------------------------------------------------ */
/* Small helpers a few solutions share. Inlined into each solution so  */
/* that what the learner reads is what the verifier runs.              */
/* ------------------------------------------------------------------ */

const BINDINGS = {
  /* ---------------------------------------------------------------- */
  py_01_two_sum_premium: {
    starter: `function findPair(premiums, target) {
  // premiums: number[], target: number -> number[]
}
`,
    solution: `function findPair(premiums, target) {
  const seen = new Map();                 // value -> index we saw it at
  for (let i = 0; i < premiums.length; i++) {
    const need = target - premiums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(premiums[i], i);             // insert AFTER the check
  }
  return [];
}
`,
    notes: `### Ruby to JavaScript notes
- Use \`Map\`, not \`{}\`. A plain object turns every key into a string, so \`obj[2500]\` and \`obj["2500"]\` are the same entry and a numeric key silently changes type. Ruby's Hash never does that to you; \`Map\` is the type-preserving equivalent.
- \`seen.has(k)\` is \`hash.key?(k)\`, \`seen.get(k)\` is \`hash[k]\`, \`seen.set(k, v)\` is \`hash[k] = v\`. \`get\` on a missing key returns \`undefined\`, not \`nil\` -- close enough in practice, but \`undefined\` and \`null\` are two different things in JavaScript and you will meet both.
- There is no \`each_with_index\`. The nearest thing is \`for (const [i, p] of premiums.entries())\`, and like Python's \`enumerate\` it yields \`(index, value)\` -- the reverse of Ruby's \`|value, index|\`.
- **Nothing is returned implicitly.** A function that falls off the end returns \`undefined\`, not the last expression. Every branch that produces an answer needs its own \`return\`.

### Say this out loud
"Brute force is O(n squared). I will trade space for time with a Map of value to index,
checking for the complement before I insert so an element never pairs with itself."
`,
  },

  /* ---------------------------------------------------------------- */
  py_02_top_k_brokers: {
    starter: `function topKBrokers(records, k) {
  // records: [string, number][], k: number -> string[]
}
`,
    solution: `function topKBrokers(records, k) {
  const counts = new Map();
  for (const [name] of records) counts.set(name, (counts.get(name) ?? 0) + 1);

  const ranked = [...counts].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );
  return ranked.slice(0, k).map(([name]) => name);
}
`,
    notes: `### Ruby to JavaScript notes
- \`for (const [name] of records)\` destructures each pair and ignores the premium, the same as Ruby's \`|name, _premium|\`. Spare positions are simply left out.
- \`??\` is "if null or undefined", which is what you want for a counter. \`||\` is "if falsy", and in JavaScript \`0\` and \`""\` are falsy -- unlike Ruby, where only \`nil\` and \`false\` are. Reaching for \`||\` on a count is a real bug waiting for the first zero.
- \`sort\` mutates the array in place and returns it, so it behaves like Ruby's \`sort!\`. Spread into a fresh array first (\`[...counts]\`) when the input is not yours to reorder.
- **The default comparator sorts by string.** \`[10, 9].sort()\` gives \`[10, 9]\`. Always pass a comparator for numbers.
- JavaScript strings have no \`<=>\`. Write \`a < b ? -1 : a > b ? 1 : 0\` for code-point order. \`localeCompare\` looks tidier but is locale-dependent, which is not what a test expects.

### The tie-break, done the JavaScript way
A comparator returns a number, so chain them with \`||\`: \`b[1] - a[1] || nameCompare\`.
The count comparison returns \`0\` when the counts tie, \`0\` is falsy, and the name
comparison takes over. That is the idiomatic equivalent of Python's negated tuple key.
`,
  },

  /* ---------------------------------------------------------------- */
  py_03_group_anagrams: {
    starter: `function groupAnagrams(words) {
  // words: string[] -> string[][]
}
`,
    solution: `const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// JavaScript has no lexicographic comparison for arrays, so spell it out:
// element by element, and a prefix sorts before the longer array.
const byArray = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const c = byString(a[i], b[i]);
    if (c !== 0) return c;
  }
  return a.length - b.length;
};

function groupAnagrams(words) {
  const buckets = new Map();
  for (const w of words) {
    const key = [...w].sort().join("");    // canonical form
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(w);
  }
  return [...buckets.values()].map((g) => g.sort(byString)).sort(byArray);
}
`,
    notes: `### Ruby to JavaScript notes
- \`[...w]\` splits a string into an array of characters (\`w.split("")\` is the same thing). Strings are immutable, so you sort the array and \`join("")\` it back -- there is no \`String#chars.sort.join\` chain to lean on, but this is only one character longer.
- There is no \`Hash.new { |h, k| h[k] = [] }\`. The idiom is the two-line \`if (!m.has(k)) m.set(k, [])\`, and it is worth writing a tiny \`push(map, key, value)\` helper once a file needs it three times.
- **Ruby compares arrays with \`<=>\` and JavaScript cannot.** \`[1, 2] < [1, 3]\` compares two strings after an implicit \`toString()\`, which is a silent wrong answer rather than an error. Write the comparator, as \`byArray\` does above.
- Any string is a valid \`Map\` key, including \`""\` -- the empty-word case needs no special handling.

### Generalising it
Swap the key function and this becomes a fuzzy-match deduper:
\`const key = name.toLowerCase().replace(/[^a-z]/g, "")\` groups "ACME Corp." with "Acme Corp".
Regex literals are first class in JavaScript exactly as in Ruby; the \`g\` flag is what
\`gsub\` gives you for free.
`,
  },

  /* ---------------------------------------------------------------- */
  py_04_balanced_brackets: {
    starter: `function isValid(s) {
  // s: string -> boolean
}
`,
    solution: `function isValid(s) {
  const closers = new Map([[")", "("], ["]", "["], ["}", "{"]]);
  const stack = [];
  for (const ch of s) {
    if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
    else if (closers.has(ch) && stack.pop() !== closers.get(ch)) return false;
  }
  return stack.length === 0;
}
`,
    notes: `### Ruby to JavaScript notes
- An Array *is* the stack: \`push\` and \`pop\`, exactly as in Ruby. There is no Stack class and you do not want one.
- **\`pop()\` on an empty array returns \`undefined\` rather than raising.** Python raises \`IndexError\` and needs a guard first; here \`undefined !== "("\` is already false, so the empty case falls out. Know which one you are writing in.
- \`===\`, not \`==\`. \`==\` coerces types before comparing (\`"" == 0\` is true) and is the single most notorious thing about the language. Use \`===\` everywhere and the surprise disappears.
- \`for (const ch of s)\` iterates characters. \`for...in\` would give you the *indices* -- it is Ruby's \`each_key\`, not \`each\`, and mixing them up is a rite of passage.
- A \`Map\` is used for the pairs rather than an object literal because \`"toString" in obj\` is \`true\` on any plain object -- prototype keys leak into \`in\` checks. \`Map\` has no prototype keys.

### Say this out loud
"Matching pairs with a most-recent-first rule is a stack. One pass, and I check both
failure modes: a close with nothing open, and opens left over at the end."
`,
  },

  /* ---------------------------------------------------------------- */
  py_05_reconcile_feeds: {
    starter: `function reconcile(legacy, platform) {
  // legacy, platform: [string, number][] -> { missing, extra, mismatched }
}
`,
    solution: `const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function reconcile(legacy, platform) {
  const L = new Map(legacy);      // new Map(pairs) is Ruby's Hash[pairs]
  const P = new Map(platform);

  const missing = [];
  const mismatched = [];
  for (const [id, premium] of L) {
    if (!P.has(id)) missing.push(id);
    else if (P.get(id) !== premium) mismatched.push([id, premium, P.get(id)]);
  }
  const extra = [...P.keys()].filter((id) => !L.has(id));

  return {
    missing: missing.sort(byString),
    extra: extra.sort(byString),
    mismatched: mismatched.sort((a, b) => byString(a[0], b[0])),
  };
}
`,
    notes: `### Ruby to JavaScript notes
- \`new Map(pairs)\` builds a map from \`[key, value]\` pairs in one call -- \`Hash[pairs]\`.
- **There is no Set arithmetic.** JavaScript's \`Set\` has no \`-\`, \`&\` or \`|\`, so the difference is a \`filter\` over the keys and the intersection is a loop with a \`has\` check. Ruby's \`Set\` and Python's \`set\` both spoil you here; write the filter and move on.
- Iterating a \`Map\` yields \`[key, value]\` pairs, so \`for (const [id, premium] of L)\` is \`each_pair\`. \`L.keys()\`, \`L.values()\` and \`L.entries()\` return iterators, not arrays -- spread them with \`[...]\` when you need to \`filter\` or \`sort\`.
- \`sort\` returns the same array it mutated, so \`missing.sort(...)\` inside the object literal is safe and reads well. It is Ruby's \`sort!\` in a place that looks like \`sort\`.
- Ordinary object literals are the natural return type for a fixed set of named fields, and they serialise straight to JSON. Use \`Map\` for lookup tables, \`{}\` for records.

### What the interviewer is watching for
Do you ask about duplicate ids within a feed? Do you ask whether float premiums need
a tolerance instead of \`!==\`? In JavaScript every number is a double, so the float
question is not optional -- \`0.1 + 0.2 !== 0.3\` here just as it does in Ruby.
`,
  },

  /* ---------------------------------------------------------------- */
  py_06_longest_unique_run: {
    starter: `function longestUnique(codes) {
  // codes: string -> number
}
`,
    solution: `function longestUnique(codes) {
  const last = new Map();          // char -> most recent index
  let left = 0;
  let best = 0;
  for (let right = 0; right < codes.length; right++) {
    const ch = codes[right];
    if (last.has(ch) && last.get(ch) >= left) left = last.get(ch) + 1;
    last.set(ch, right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}
`,
    notes: `### Ruby to JavaScript notes
- \`codes[right]\` on a string gives a one-character string. There is no character type, and unlike Ruby there is no \`String#[]=\` -- strings are immutable.
- A plain indexed \`for\` loop is the right tool when you need the index for arithmetic. \`forEach\` cannot \`break\`, and \`for...of\` over a string gives you characters but not positions.
- \`let\`, never \`var\`. \`var\` is function-scoped and hoisted, which means a loop variable leaks out of the loop and closures capture the wrong thing. \`let\` and \`const\` are block-scoped like Ruby's locals.
- \`Math.max(a, b)\` takes varargs. For a whole array it is \`Math.max(...xs)\`, which blows the stack somewhere around 100k elements -- \`reduce\` for anything large.

### The guard is the whole problem
\`last.get(ch) >= left\` is what stops a stale index from before the window dragging
\`left\` backwards. Trace \`"abba"\` by hand before you code it; that is the case that
separates a pass from a fail, in any language.
`,
  },

  /* ---------------------------------------------------------------- */
  py_07_merge_intervals: {
    starter: `function mergeCoverage(periods) {
  // periods: number[][] -> number[][]
}
`,
    solution: `function mergeCoverage(periods) {
  if (periods.length === 0) return [];

  // Copy before sorting: sort mutates, and the caller's array is not ours.
  const sorted = [...periods].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const out = [[...sorted[0]]];
  for (const [start, end] of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);  // overlaps or touches
    else out.push([start, end]);
  }
  return out;
}
`,
    notes: `### Ruby to JavaScript notes
- **Sorting arrays of arrays does not work by default.** Ruby's \`sort\` uses \`<=>\`, which compares arrays element by element; JavaScript's default comparator calls \`toString()\` on each element, so \`[[10, 1], [9, 1]]\` sorts as the strings \`"10,1"\` and \`"9,1"\`. Pass \`(a, b) => a[0] - b[0] || a[1] - b[1]\`.
- There is no negative indexing. \`out[-1]\` is not the last element, it is \`undefined\` -- \`-1\` is just another property name on an object. Use \`out[out.length - 1]\`, or \`out.at(-1)\` in modern runtimes.
- \`[...sorted[0]]\` is a shallow copy, the equivalent of \`Array#dup\`. Saying "I am copying so I do not mutate the input" is free credit in an interview, and in JavaScript it is not optional: \`sort\` and \`reverse\` both mutate.
- \`slice\` copies, \`splice\` mutates. The names are one letter apart and do opposite things; this is the JavaScript equivalent of Ruby's \`sort\` versus \`sort!\`, minus the helpful bang.

### The variants you should expect as a follow-up
Insert-and-merge one new interval, count the max overlap at any point (sweep line with
+1/-1 events), and find the gaps. All three are the same sort-first idea.
`,
  },

  /* ---------------------------------------------------------------- */
  py_08_binary_search_rate: {
    starter: `function rateFor(table, tiv) {
  // table: [number, number][] sorted ascending by threshold
  // tiv: number -> number
}
`,
    solution: `function rateFor(table, tiv) {
  let lo = 0;
  let hi = table.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (table[mid][0] <= tiv) {
      ans = table[mid][1];     // candidate; maybe a higher band also fits
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
`,
    notes: `### Ruby to JavaScript notes
- **There is one number type and it is a double.** \`(lo + hi) / 2\` gives \`2.5\`, so you need \`Math.floor\`. Ruby's \`/\` on two integers already floors, which is the trap in the opposite direction -- and unlike Python, indexing with \`2.5\` does not raise, it quietly returns \`undefined\`. A silent wrong answer is worse than a crash, so floor deliberately.
- \`(lo + hi) >> 1\` is the shorter form and is what you will see in other people's code. It is a 32-bit operation, so it breaks above 2^31 elements; \`Math.floor\` does not.
- There is no \`bisect\`. JavaScript's standard library is small: no binary search, no counter, no heap. Writing them out is normal here, not a sign you have missed a helper.
- \`let\` for anything you reassign, \`const\` for anything you do not. The compiler enforces \`const\`, which catches the "I meant to update \`lo\`" class of bug at parse time.

### Getting the loop right every time
Use the \`while (lo <= hi)\` form with \`mid + 1\` / \`mid - 1\` and a saved \`ans\`. It terminates
by construction because the range strictly shrinks every iteration. If you find
yourself writing \`while (lo < hi)\` and then debugging an infinite loop live on Zoom,
you have chosen the harder template.
`,
  },

  /* ---------------------------------------------------------------- */
  py_09_broker_hierarchy: {
    starter: `function rollup(edges, premiums, root) {
  // edges: [string, string][], premiums: Record<string, number>, root: string
  // -> Record<string, number>
}
`,
    solution: `function rollup(edges, premiums, root) {
  const children = new Map();               // parent -> [children]
  for (const [parent, child] of edges) {
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(child);
  }

  const totals = {};
  const dfs = (node) => {
    let total = premiums[node] ?? 0;
    for (const c of children.get(node) ?? []) total += dfs(c);
    totals[node] = total;
    return total;
  };

  dfs(root);
  return totals;
}
`,
    notes: `### Ruby to JavaScript notes
- \`premiums[node] ?? 0\` is \`premiums.fetch(node, 0)\`. A missing key gives \`undefined\`, not an error -- closer to Ruby's \`nil\` than to Python's \`KeyError\` -- so the danger is not a crash but \`undefined + 5\` quietly becoming \`NaN\`. Default at the point of read, every time.
- \`children.get(node) ?? []\` is the \`defaultdict\` replacement, and it is better behaved: it does not insert the key as a side effect the way \`defaultdict\` does.
- An arrow function assigned to a \`const\` is the idiomatic nested helper. It closes over \`children\` and \`totals\` and, unlike Python, needs no \`nonlocal\` to reassign an outer variable -- closures in JavaScript capture bindings, not values, exactly as Ruby blocks do.
- Arrow functions also inherit \`this\` from the enclosing scope, which is why they are preferred over \`function\` for callbacks. \`this\` in JavaScript is decided by the *call site*, not the definition, and that is the deepest difference from Ruby's \`self\`.
- Recursion depth is limited (~10k frames), so the same "a 100k-deep chain needs an explicit stack" caveat applies as in Python.

### The iterative version, if they push
\`\`\`js
const stack = [[root, false]];
while (stack.length) {
  const [node, processed] = stack.pop();
  if (processed) {
    const kids = children.get(node) ?? [];
    totals[node] = (premiums[node] ?? 0) + kids.reduce((n, c) => n + totals[c], 0);
  } else {
    stack.push([node, true]);
    for (const c of children.get(node) ?? []) stack.push([c, false]);
  }
}
\`\`\`
`,
  },

  /* ---------------------------------------------------------------- */
  py_10_workflow_order: {
    starter: `function orderSteps(steps, deps) {
  // steps: string[], deps: [string, string][] -> string[]
}
`,
    solution: `// JavaScript has no heap in its standard library, so here is the whole thing.
// It is about fifteen lines and worth being able to write from memory.
class MinHeap {
  constructor() {
    this.a = [];
  }

  get size() {
    return this.a.length;
  }

  push(v) {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent] <= a[i]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < a.length && a[l] < a[smallest]) smallest = l;
        if (r < a.length && a[r] < a[smallest]) smallest = r;
        if (smallest === i) break;
        [a[smallest], a[i]] = [a[i], a[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

function orderSteps(steps, deps) {
  const unlocks = new Map();                       // requires -> [steps waiting on it]
  const indeg = new Map(steps.map((s) => [s, 0]));
  for (const [step, requires] of deps) {
    if (!unlocks.has(requires)) unlocks.set(requires, []);
    unlocks.get(requires).push(step);
    indeg.set(step, indeg.get(step) + 1);
  }

  const ready = new MinHeap();                     // min-heap => lexicographic order
  for (const s of steps) if (indeg.get(s) === 0) ready.push(s);

  const out = [];
  while (ready.size > 0) {
    const s = ready.pop();
    out.push(s);
    for (const next of unlocks.get(s) ?? []) {
      indeg.set(next, indeg.get(next) - 1);
      if (indeg.get(next) === 0) ready.push(next);
    }
  }

  return out.length === steps.length ? out : [];
}
`,
    notes: `### Ruby to JavaScript notes
- **There is no heap and no priority queue.** Python hands you \`heapq\`; here you write the sift-up and sift-down yourself, or you re-sort a plain array on every pop and accept O(n log n) per step. Interviewers know this, and writing the heap cleanly is a plus rather than an imposition.
- \`[a[i], a[j]] = [a[j], a[i]]\` is destructuring assignment, and it is exactly Ruby's \`a[i], a[j] = a[j], a[i]\`.
- \`<\` on strings compares by UTF-16 code unit, which gives the same alphabetical order as Python and Ruby for plain ASCII step names. For anything non-ASCII you need \`Intl.Collator\`, and you should say so.
- \`get size()\` defines a getter, so \`ready.size\` reads like a property while running code -- the same shape as a Ruby attribute method, minus the parentheses. \`class\` syntax in general maps closely onto Ruby's, right down to \`constructor\` being \`initialize\`.
- \`for (;;)\` is the idiomatic infinite loop. There is no \`loop do\`.

### Say this out loud
"Dependencies plus 'valid order' means topological sort. I will use Kahn's algorithm
because cycle detection is free -- if I cannot drain every node, the remainder is a cycle.
And because they asked for the lexicographically smallest order, my ready set is a
min-heap rather than a FIFO queue."
`,
  },

  /* ---------------------------------------------------------------- */
  py_11_accumulation_window: {
    starter: `function peakAccumulation(events, w) {
  // events: [number, number][], w: number -> number
}
`,
    solution: `function peakAccumulation(events, w) {
  if (events.length === 0) return 0;

  const sorted = [...events].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let best = 0;
  let total = 0;
  let right = 0;

  for (let left = 0; left < sorted.length; left++) {
    // extend the right edge as far as this window allows
    const limit = sorted[left][0] + w - 1;
    while (right < sorted.length && sorted[right][0] <= limit) {
      total += sorted[right][1];
      right += 1;
    }
    best = Math.max(best, total);
    total -= sorted[left][1];       // left is about to leave the window
  }
  return best;
}
`,
    notes: `### Ruby to JavaScript notes
- The two-pointer idiom is a \`for\` over \`left\` with \`right\` declared **outside** it. Ruby developers reach for a nested \`each\` here, which is O(n^2); the whole trick is that \`right\` never resets.
- \`[...events].sort(...)\` again -- copy first, and always pass a numeric comparator for numbers.
- \`total\` and \`best\` are \`let\` because they are reassigned. If you find yourself wanting \`const\` for a running total, that is a hint you could write it as a \`reduce\` -- but not here, where the sliding window needs mutable state.
- Every number is a double, so a running total of large TIVs is exact only up to 2^53. Say that if the numbers in the question look like real money; \`BigInt\` exists for when they are.

### Watch the ordering
\`total -= sorted[left][1]\` must come AFTER \`best = Math.max(...)\`, otherwise you drop the
left event before scoring the window it belongs to. Trace \`[[1, 5], [4, 5]]\` with w=4 by hand.
`,
  },

  /* ---------------------------------------------------------------- */
  py_13_min_layers: {
    starter: `function minLayers(sizes, limit) {
  // sizes: number[], limit: number -> number
}
`,
    solution: `function minLayers(sizes, limit) {
  // best[a] = fewest layers summing to exactly a
  const best = new Array(limit + 1).fill(Infinity);
  best[0] = 0;

  for (let amount = 1; amount <= limit; amount++) {
    for (const s of sizes) {
      if (s <= amount && best[amount - s] + 1 < best[amount]) {
        best[amount] = best[amount - s] + 1;
      }
    }
  }
  return Number.isFinite(best[limit]) ? best[limit] : -1;
}
`,
    notes: `### Ruby to JavaScript notes
- \`new Array(n).fill(x)\` is \`Array.new(n, x)\`. The \`.fill\` is not optional: \`new Array(n)\` on its own creates *holes*, and \`map\` and \`forEach\` skip holes entirely, so a table built without \`fill\` looks right in the debugger and silently does nothing.
- \`Array.new(3) { [] }\` has a direct equivalent for grids: \`Array.from({ length: rows }, () => new Array(cols).fill(0))\`. Do not write \`new Array(rows).fill([])\` -- every row would be the *same* array, the same trap as Python's \`[[]] * 3\`.
- \`Infinity\` is a normal number here: it compares greater than everything, arithmetic on it stays \`Infinity\`, and \`Number.isFinite\` is how you test for it. Ruby spells it \`Float::INFINITY\`.
- \`for (const s of sizes)\` is \`each\`; \`for (const i in sizes)\` gives you **string** indices and is almost never what you want.

### Memoised recursion, if you prefer it
\`\`\`js
function minLayers(sizes, limit) {
  const memo = new Map();
  const go = (amount) => {
    if (amount === 0) return 0;
    if (amount < 0) return Infinity;
    if (memo.has(amount)) return memo.get(amount);
    let best = Infinity;
    for (const s of sizes) best = Math.min(best, go(amount - s) + 1);
    memo.set(amount, best);
    return best;
  };
  const answer = go(limit);
  return Number.isFinite(answer) ? answer : -1;
}
\`\`\`
There is no \`lru_cache\` decorator to lean on, so the memo is explicit. Watch the
recursion depth: the engine gives you roughly ten thousand frames.
`,
  },

  /* ---------------------------------------------------------------- */
  py_14_lru_cache: {
    starter: `function runOps(capacity, ops) {
  // capacity: number, ops: (["put", key, value] | ["get", key])[] -> number[]
}
`,
    solution: `function runOps(capacity, ops) {
  // A Map iterates in insertion order: oldest at the front, newest at the back.
  const cache = new Map();
  const out = [];

  for (const op of ops) {
    if (op[0] === "get") {
      const key = op[1];
      if (cache.has(key)) {
        const value = cache.get(key);
        cache.delete(key);
        cache.set(key, value);          // delete + set = move to the back
        out.push(value);
      } else {
        out.push(-1);
      }
    } else {
      const [, key, value] = op;
      cache.delete(key);                // so an update also counts as a use
      cache.set(key, value);
      if (cache.size > capacity) {
        cache.delete(cache.keys().next().value);   // evict the oldest
      }
    }
  }
  return out;
}
`,
    notes: `### What to say when you reach for Map
"\`Map\` guarantees insertion order for every key type, so delete-then-set is an O(1)
move-to-back and \`map.keys().next().value\` is an O(1) look at the oldest key. That is a
hash map plus a doubly linked list, which is the structure an LRU needs -- the map gives
O(1) lookup, the list gives O(1) move-to-front and O(1) eviction from the tail. I can
write the linked list version if you would rather see it."

That answer gets full marks. Reaching for \`Map\` *without* being able to explain the
underlying structure is what loses the point.

### Ruby to JavaScript notes
- **Ruby's Hash and JavaScript's Map both preserve insertion order; a plain \`{}\` does not, quite.** Object keys that look like array indices are reordered ahead of string keys, so \`{2: "a", 1: "b"}\` iterates \`1\` then \`2\`. An LRU built on \`{}\` with numeric keys is broken for that reason alone.
- \`cache.keys()\` returns a lazy iterator, so \`.next().value\` peeks at the first key without materialising the rest. \`[...cache.keys()][0]\` would work and would be O(n).
- \`const [, key, value] = op\` skips the first element with an empty slot -- Ruby's \`_, key, value = op\`. Unlike Python it does not raise when the lengths disagree; extra elements are dropped and missing ones become \`undefined\`, which is why the two-element \`get\` case is still handled separately for clarity rather than necessity.
- \`delete\` on a \`Map\` is a method that returns a boolean. The \`delete\` *operator* (\`delete obj.k\`) is a different thing entirely and is slow on plain objects; another reason to prefer \`Map\` for anything you mutate.

### The capacity 0 edge case
It is in the tests deliberately. A cache with capacity 0 must evict immediately and
always miss. Candidates who never check their edge cases fail exactly here.
`,
  },

  /* ---------------------------------------------------------------- */
  py_15_flatten_payload: {
    starter: `function flatten(payload) {
  // payload: object -> Record<string, unknown>
}
`,
    solution: `const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function flatten(payload) {
  if (Object.keys(payload).length === 0) return {};
  const out = {};

  const walk = (node, prefix) => {
    if (isPlainObject(node)) {
      const keys = Object.keys(node);
      if (keys.length === 0) {
        out[prefix] = null;
        return;
      }
      for (const k of keys) walk(node[k], prefix ? \`\${prefix}.\${k}\` : k);
    } else if (Array.isArray(node)) {
      if (node.length === 0) {
        out[prefix] = null;
        return;
      }
      node.forEach((v, i) => walk(v, prefix ? \`\${prefix}.\${i}\` : String(i)));
    } else {
      out[prefix] = node;
    }
  };

  walk(payload, "");
  return out;
}
`,
    notes: `### Ruby to JavaScript notes
- **\`typeof null === "object"\`.** It is the language's oldest bug and it is never being fixed, so every type check on an object has to exclude \`null\` first. In this problem \`null\` is a leaf value, and a check that forgets it will recurse into it and crash.
- **Arrays are objects too.** \`typeof [] === "object"\`, so \`Array.isArray\` is the only reliable test -- and it has to be checked *before* the object branch, not after. Ruby's \`is_a?(Hash)\` versus \`is_a?(Array)\` needs no such care.
- Template literals \`\\\`\${prefix}.\${k}\\\`\` are Ruby's \`"#{prefix}.#{k}"\`, backticks instead of quotes.
- \`Object.keys(o)\` returns own enumerable string keys, in insertion order for non-numeric keys. \`for...in\` would also walk the prototype chain, which is how a stray \`toString\` ends up in your warehouse table.
- \`node.forEach((v, i) => ...)\` yields \`(value, index)\` -- the same order as Ruby's \`each_with_index\`, and the opposite of \`enumerate\` in Python. One fewer thing to unlearn.

### The three edge cases that separate answers
1. Empty object / empty array -- the spec says they become \`null\`, so handle them before the loop.
2. \`null\` as an actual value is a leaf, not an empty container.
3. Top-level keys must have no leading dot. Check your \`prefix ? ... : ...\` branch.

Read the spec back to the interviewer before coding. On a data-integration problem that
IS the skill being measured.
`,
  },
};

/* ------------------------------------------------------------------ */
let written = 0;
for (const [id, binding] of Object.entries(BINDINGS)) {
  const path = join(PACKS_DIR, "federato", `${id}.json`);
  const problem = JSON.parse(readFileSync(path, "utf8"));
  problem.languages.javascript = binding;
  writeFileSync(path, `${JSON.stringify(problem, null, 2)}\n`);
  written += 1;
}
console.log(`wrote JavaScript bindings into ${written} problems`);
