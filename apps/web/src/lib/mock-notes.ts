/**
 * "What an interviewer would have written."
 *
 * These are authored per *pattern* rather than templated, because generic
 * coaching is exactly what makes a scorecard feel like a grade. A note that
 * names the actual trap - `while`, not `if`; the second sort key; the fan-out -
 * reads like feedback. A note that says "good effort, keep practising" reads
 * like a number with the number hidden.
 *
 * Keyed on `problems.pattern`, which is authored in the pack alongside the
 * problem. Anything without an entry falls back to `genericNote` below, which
 * is deliberately duller: it is a prompt to write the real one.
 */
export type PatternNote = {
  /** Written when they closed it. Names what they did right, then the follow-up. */
  solved: string;
  /** Written when they did not. Names the specific bug, not the feeling. */
  stuck: string;
  /** The drill, for "what to work on next". */
  next: { title: string; body: string };
};

export const PATTERN_NOTES: Record<string, PatternNote> = {
  /* ---------------- algorithms ---------------- */
  "hash map": {
    solved:
      "One pass, dict of value to index, no nested loop. Exactly right. The follow-up an interviewer usually reaches for next is “what if there could be several pairs?” — have an answer ready before they ask.",
    stuck:
      "The bug that catches everyone here is storing before you check: put the value into the dict above the membership test and an input like [3000, 3000] pairs a number with itself. Check first, then store.",
    next: {
      title: "Dict-as-lookup, until it is muscle memory",
      body: "This is the most likely warm-up in a 45 minute round and it should cost you four minutes, not ten. Type it from blank three times: check whether the complement is in the map, then store.",
    },
  },
  "counting + heap": {
    solved:
      "Count first, then take the top K off a heap rather than sorting everything. Say the complexity out loud when you finish — n log k against n log n is the entire reason the question exists.",
    stuck:
      "Two ways this one goes wrong: counting and sorting the whole thing (correct, but it throws away the point of the question), and pushing onto the heap without bounding it to k. Say “I'll count, then keep a heap of size k” before you type it.",
    next: {
      title: "Top-K with a bounded heap",
      body: "Counter, then heapq.nlargest or a size-k heap you pop from. Practise stating why it beats a full sort — the interviewer is listening for n log k.",
    },
  },
  "hash grouping": {
    solved:
      "You picked a canonical key and grouped on it in one pass. That is the whole pattern, and choosing the key out loud is the part interviewers score.",
    stuck:
      "The pattern is: find a key that is identical for everything that belongs together, then group in a single dict pass. Most stalls here are spent trying to compare items pairwise instead of naming a key.",
    next: {
      title: "Canonical keys",
      body: "Practise saying the key before you write the loop: “sorted characters”, “frozen set of ids”, “the tuple of counts”. Naming it correctly makes the code four lines.",
    },
  },
  stack: {
    solved:
      "Push, match, and the empty-at-the-end check. Clean. The edge case worth naming out loud is the closer that arrives on an empty stack — you handled it, so say that you did.",
    stuck:
      "Two edge cases sink this: a closing bracket with nothing on the stack, and a stack that is non-empty when the input runs out. Both fail quietly on happy-path samples and loudly on the hidden set.",
    next: {
      title: "Stack matching, both edges",
      body: "Retype it from blank with the two failure cases written first: closer-on-empty, and leftovers-at-the-end. It is a five minute problem once those are reflex.",
    },
  },
  "dict diff": {
    solved:
      "You diffed by key rather than by position, which is what makes this survive reordered input. Worth saying: “I'm comparing on the id, not on the index.”",
    stuck:
      "The trap is comparing the two feeds positionally. Build a dict on the identifying key from each side, then walk the union of the keys — added, removed and changed fall out of that in one pass.",
    next: {
      title: "Diff by key, never by position",
      body: "Two dicts keyed on the id, then walk `a.keys() | b.keys()`. This is the shape of nearly every reconciliation question you will be asked in a data-heavy role.",
    },
  },
  "sliding window": {
    solved:
      "You held the window with a set and shrank it in a loop, which is the template. Worth saying the complexity out loud when you finish: O(n) time, one pass, space bounded by the alphabet. It is free points and most candidates skip it.",
    stuck:
      "The shrink has to be a `while`, not an `if`. With an `if` you remove one element and carry on, so an input like \"abba\" comes back one too long — and the first few samples still pass, which is exactly why the bug survives to the hidden tests.",
    next: {
      title: "The sliding-window template",
      body: "left = 0 · add the right element · `while` the window is invalid, remove the left one and advance · record the best. Every window problem is that six-line shape. Retype it until the `while` is automatic.",
    },
  },
  "sliding window on sorted events": {
    solved:
      "Sorted first, then swept with two pointers instead of re-scanning. Naming the sort as a precondition is the sentence that earns the point here.",
    stuck:
      "This one needs the input sorted before the window means anything, and the window has to advance on the *left* whenever the span exceeds the limit. Skipping the sort gives plausible wrong answers on unordered input.",
    next: {
      title: "Sort, then sweep with two pointers",
      body: "Say the precondition out loud — “this only works if events are in time order” — then write the two-pointer sweep. The habit of stating preconditions is worth more than the algorithm.",
    },
  },
  "intervals / sort": {
    solved:
      "Sort first, then one sweep. That is the pattern, and you got the touching case right — `<=`, not `<`. In an insurance or billing context that distinction is a real question, which is worth saying out loud.",
    stuck:
      "Two things sink this: forgetting to sort (the input is not given in order) and using `<` where the spec says touching counts as continuous. Both pass the samples and fail the hidden cases.",
    next: {
      title: "Sort-then-sweep for intervals",
      body: "The second most common medium after two-sum. Sort by start, keep the last merged interval, extend it while the next one starts at or before its end. Type it from blank.",
    },
  },
  intervals: {
    solved:
      "You split it into before / overlapping / after rather than trying to handle every case in one branch. That decomposition is the answer, and stating it first is what makes the code short.",
    stuck:
      "Insertion is three phases, not one: everything that ends before the new interval starts, then the merge of everything that overlaps, then the rest. Trying to do it in a single conditional is where this goes wrong.",
    next: {
      title: "Insert-into-intervals, three phases",
      body: "Write the three phases as three comments first, then fill them in. It converts a fiddly problem into three trivial loops.",
    },
  },
  "binary search": {
    solved:
      "Clean bounds and a terminating loop. The thing to say out loud is which invariant you are holding — “lo is always a candidate, hi is always past the end” — because that is what stops the off-by-one.",
    stuck:
      "Binary search fails on the boundary, never in the middle. State the invariant before you write the loop, and decide up front whether `hi` is inclusive. Almost every stall here is a `lo <= hi` versus `lo < hi` question that was never decided.",
    next: {
      title: "Binary search, invariant first",
      body: "Pick one form — half-open, `lo < hi`, `hi = mid`, `lo = mid + 1` — and use only that one forever. The people who get this right are not smarter, they just stopped improvising it.",
    },
  },
  "binary search on the answer": {
    solved:
      "You spotted that the answer space is monotonic and searched *that* rather than the input. That leap is the whole question, and naming it out loud is worth more than the implementation.",
    stuck:
      "The move is to stop searching the array and start searching the answer: “can I do it with capacity X?” is a yes/no that is monotonic in X, so binary search over X. Without that sentence the problem looks like an unbounded search.",
    next: {
      title: "Binary search the answer, not the array",
      body: "Practise the framing sentence: “feasible(x) is monotonic, so I binary search x and write feasible as a linear scan.” Then write feasible() first and the search second.",
    },
  },
  "two pointers": {
    solved:
      "Two pointers from both ends, no extra space. Say the precondition — “this relies on the input being sorted” — because that is the assumption an interviewer will poke at.",
    stuck:
      "Two pointers only work on sorted input, and the move rule has to be justified: too small, advance the left; too large, retreat the right. Guessing which one to move is where this stalls.",
    next: {
      title: "Two pointers with a stated rule",
      body: "Write the two-line justification as a comment before the loop. It is thirty seconds and it removes the entire class of bug this problem exists to catch.",
    },
  },
  "graph / BFS-DFS": {
    solved:
      "Adjacency built first, then one traversal with a visited set. That order is the pattern. The follow-up to be ready for is what changes if the graph has cycles or is disconnected.",
    stuck:
      "Almost every graph stall is one of two things: no `visited` set, so cycles run forever, or building the adjacency lazily inside the traversal. Build the adjacency map first as its own step, then traverse.",
    next: {
      title: "Adjacency, then traverse",
      body: "Two separate steps, always, and a visited set from the first line. Practise both BFS with a deque and DFS with an explicit stack so you are not choosing under pressure.",
    },
  },
  "topological sort": {
    solved:
      "In-degrees, a queue of zeroes, and a cycle check at the end from the count of emitted nodes. That last part is what most people forget — you did not.",
    stuck:
      "The piece that goes missing is the cycle detection: if you emit fewer nodes than the graph has, there is a cycle and there is no valid order. Kahn's algorithm gives you that check for free and it should be in the code before you run it.",
    next: {
      title: "Kahn's algorithm, with the cycle check",
      body: "In-degree map · queue of zero in-degree · decrement as you emit · compare the emitted count to n. Four steps, and the fourth is the one interviewers ask about.",
    },
  },
  "dynamic programming": {
    solved:
      "You named the state before you wrote the loop, which is the only way this ever goes well. Say the recurrence out loud in a real round — it is the part the interviewer is actually assessing.",
    stuck:
      "DP goes wrong before any code is written. Say the three sentences first: what does dp[i] mean, what is the recurrence, what are the base cases. Typing a table before those exist is what produces the loop nobody can debug.",
    next: {
      title: "State, recurrence, base case — out loud",
      body: "Three sentences before any code, every time. If you cannot say what dp[i] means in one sentence, the code will not work no matter how long you stare at it.",
    },
  },
  "dynamic programming (grid)": {
    solved:
      "One row at a time, with the edges seeded before the loop. Clean. Worth mentioning that the row-rolling version drops the space to O(width) — free points.",
    stuck:
      "Grid DP falls over on the first row and first column. Seed them explicitly before the main loop rather than special-casing inside it, and the body becomes one line.",
    next: {
      title: "Seed the edges, then one clean loop",
      body: "Fill row 0 and column 0 first, then the double loop has no conditionals in it. Then say the O(width) space optimisation out loud even if you do not write it.",
    },
  },
  "design / ordered dict": {
    solved:
      "You reached for the structure that gives you both orderings at once instead of maintaining two things that can disagree. That is the design instinct the question is testing.",
    stuck:
      "The trap is keeping a dict and a list and trying to hold them in step — the list makes eviction O(n) and the two drift. A doubly linked list plus a dict of nodes, or an OrderedDict, gives O(1) on both operations.",
    next: {
      title: "O(1) on both operations, or say why not",
      body: "Practise the LRU shape until you can write it in ten minutes. Even if you use OrderedDict, be able to explain the linked-list version — that is the follow-up.",
    },
  },
  recursion: {
    solved:
      "Base case first, then the recursive step. Worth stating the depth bound out loud — an interviewer will ask what happens on deeply nested input.",
    stuck:
      "Write the base case before the recursive call, every time. Most stalls here are a missing terminating condition on one branch of the shape — lists handled, dicts handled, scalars forgotten.",
    next: {
      title: "Base cases before recursive steps",
      body: "Enumerate every type the input can be and give each one a line before you write the recursion. The code then writes itself and the edge cases are already covered.",
    },
  },
  "stdin parsing": {
    solved:
      "Parsed defensively and did not assume the input was well-formed. Unglamorous and exactly right — this is the shape of most real production bugs.",
    stuck:
      "Input parsing questions are lost on the blank line, the trailing newline and the header row. Strip, skip empties, and decide explicitly what a malformed line does before you write the aggregation.",
    next: {
      title: "Parse defensively, aggregate second",
      body: "Two phases, never mixed: turn the text into records, then compute. Mixing them is what makes these unreadable and unfixable under time pressure.",
    },
  },

  /* ---------------- SQL ---------------- */
  "ROW_NUMBER dedupe": {
    solved:
      "Clean. You reached for ROW_NUMBER() OVER (PARTITION BY …) without visibly casting around for it, and you remembered the tie-break — most people forget the second sort key and only find out when a customer reports a flapping row.",
    stuck:
      "You had the shape of it. What is usually missing is the second key in the window's ORDER BY — latest timestamp DESC, then the id DESC. In a real round that is a nudge, not a fail, but this is the one SQL pattern worth being able to type from blank.",
    next: {
      title: "ROW_NUMBER dedupe, from a blank editor",
      body: "Type ROW_NUMBER() OVER (PARTITION BY key ORDER BY ts DESC, id DESC) then WHERE rn = 1 into a text file. Three times. It is the most likely SQL question you will be asked and it should cost you no thinking time at all.",
    },
  },
  "LEFT JOIN + GROUP BY": {
    solved:
      "You spotted that an INNER JOIN here quietly loses rows and gives a wrong total. Say that out loud in a real round — noticing it is the whole question, and the interviewer cannot award you for a thought you did not narrate.",
    stuck:
      "The trap is that the obvious join is an inner one, and it silently drops the rows with no match. Your total would have looked plausible and been wrong. That is the failure mode this problem exists to teach.",
    next: {
      title: "LEFT JOIN and the totals check",
      body: "Every time you write an aggregate, say the sanity check out loud: “there are 24 submissions, my groups sum to 24.” Interviewers love it, and it is the habit that catches a dropped join before a customer does.",
    },
  },
  "LEFT JOIN + conditional aggregate": {
    solved:
      "SUM(CASE WHEN …) rather than a second join or a subquery. That is the idiomatic answer and it is one pass over the data.",
    stuck:
      "The move is a conditional aggregate — SUM(CASE WHEN condition THEN 1 ELSE 0 END) — inside the same GROUP BY, not a second join. And the outer join has to stay LEFT or the zero-conversion rows vanish.",
    next: {
      title: "Conditional aggregates over second joins",
      body: "Practise expressing “how many of them were X” as a SUM(CASE …) in the aggregate you already have. It replaces a whole class of correlated subquery.",
    },
  },
  "anti-join": {
    solved:
      "NOT EXISTS, or a LEFT JOIN with an IS NULL filter. Either is right; being able to say why NOT IN is the dangerous one is the part that earns the point.",
    stuck:
      "“Things with no matching row” is an anti-join: LEFT JOIN … WHERE the right side IS NULL, or NOT EXISTS. Avoid NOT IN against a nullable column — a single NULL makes the whole predicate return nothing, silently.",
    next: {
      title: "Anti-join three ways, and the NOT IN trap",
      body: "Write the same anti-join as NOT EXISTS, as LEFT JOIN … IS NULL, and as NOT IN, then say out loud why the third one is a landmine on nullable columns.",
    },
  },
  "top-N per group": {
    solved:
      "Window function, filtered on the rank, with an explicit tie-break. That is the answer, and having a view on RANK versus ROW_NUMBER when ties matter is the follow-up.",
    stuck:
      "Top-N per group is a window function filtered in an outer query — you cannot filter on a window function in the same WHERE clause it is computed in. And decide deliberately whether ties should all appear (RANK) or exactly N rows come back (ROW_NUMBER).",
    next: {
      title: "Top-N per group, and RANK vs ROW_NUMBER",
      body: "Write the CTE-plus-filter shape from blank, then say the one-sentence difference between RANK, DENSE_RANK and ROW_NUMBER. It comes up constantly.",
    },
  },
  "date bucketing": {
    solved:
      "Bucketed on a derived month key and grouped on the same expression. Straightforward, and you kept the ordering chronological rather than alphabetical — which is the bug this one hides.",
    stuck:
      "The quiet failure is ordering by a formatted month string, which sorts alphabetically, and losing months that have no rows. Bucket to a sortable key, and be explicit about whether empty periods must appear.",
    next: {
      title: "Sortable date keys, and the missing months",
      body: "Always bucket to something that sorts correctly (YYYY-MM), and have an answer ready for “what about a month with no activity?” — usually a calendar table or a generated series.",
    },
  },
  "HAVING on a computed aggregate": {
    solved:
      "Filter in HAVING, not WHERE, because the thing being filtered does not exist until after the grouping. Clean, and worth saying out loud.",
    stuck:
      "WHERE runs before the grouping and HAVING runs after, so a condition on an aggregate has to live in HAVING. Saying that sentence out loud is most of what this question is testing.",
    next: {
      title: "WHERE before grouping, HAVING after",
      body: "Rehearse the one-line explanation of the logical order of a SELECT: FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY. It answers half the SQL follow-ups you will be asked.",
    },
  },
  "running total / window frame": {
    solved:
      "You wrote the frame explicitly rather than relying on the default. That is the detail that separates people who have used window functions from people who have read about them.",
    stuck:
      "A running total needs SUM(…) OVER (PARTITION BY … ORDER BY … ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW). Leave the frame off and the default RANGE frame does something subtly different when values tie.",
    next: {
      title: "Always write the window frame",
      body: "Type the full ROWS BETWEEN clause every time, even when the default would do. It costs five seconds and removes a bug you would otherwise find in production.",
    },
  },
  "pre-aggregate before joining": {
    solved:
      "You pre-aggregated in a CTE before joining. That is the whole problem, and it is the single most valuable SQL bug to be able to spot — join the detail table directly and your totals inflate silently, so the number looks plausible and is wrong.",
    stuck:
      "The fan-out is the trap: a parent with two children gets its own amount counted twice, and nothing errors. Pre-aggregate the child to one row per parent in a CTE, *then* join. Say the sentence out loud in a round: “this is one-to-many, so I'll pre-aggregate first.”",
    next: {
      title: "Fan-out avoidance",
      body: "Drill this until the CTE is reflex. If you learn one thing from the SQL set, learn this: double-counting from a one-to-many join is the bug that makes a customer stop trusting your numbers.",
    },
  },
  "LAG / compare to previous row": {
    solved:
      "LAG with an explicit partition and order. The part worth narrating is what happens to the first row of each partition — you handled the NULL rather than letting it fall through.",
    stuck:
      "Comparing a row to its predecessor is LAG(col) OVER (PARTITION BY … ORDER BY …), and the first row of every partition comes back NULL. Decide what that means before you write the filter, or the gaps at the start of each group vanish.",
    next: {
      title: "LAG, and the NULL at the start of every partition",
      body: "Write it once with an explicit COALESCE or IS NULL branch and say out loud what the first row means. That is the follow-up question, every time.",
    },
  },
  "multi-stage funnel with CTEs": {
    solved:
      "One CTE per stage, joined at the end, rather than a pyramid of subqueries. That is a readability answer as much as a correctness one, and interviewers notice.",
    stuck:
      "A funnel is one named CTE per stage and a final assembly — not nested subqueries. Each stage should be countable on its own so you can sanity-check the drop-off between them out loud.",
    next: {
      title: "One CTE per funnel stage",
      body: "Name each stage after the business event. It makes the query readable, and it lets you check the counts stage by stage instead of debugging the whole thing at once.",
    },
  },
  "recursive CTE": {
    solved:
      "Anchor, recursive member, UNION ALL, and a depth guard. Getting the termination condition right first time is the hard part and you did.",
    stuck:
      "A recursive CTE is an anchor SELECT, then UNION ALL, then the member that references the CTE. The two things that go wrong are using UNION instead of UNION ALL and having no termination — add a depth column and cap it while you are developing.",
    next: {
      title: "Recursive CTE with a depth guard",
      body: "Write the anchor and the recursive member as two separate statements first, then join them with UNION ALL. Carry a level column so you can see it terminating.",
    },
  },
};

/** For a pattern nobody has written a note for yet. Deliberately plainer. */
export function genericNote(pattern: string, kind: "sql" | "code"): PatternNote {
  const p = pattern || (kind === "sql" ? "this query shape" : "this shape");
  return {
    solved: `You closed it. The pattern here is ${p}, and the thing worth practising next is saying which pattern you reached for and why, before you start typing — that narration is most of what a real interviewer is scoring.`,
    stuck: `This one is ${p}. The most useful thing you can do with an unfinished attempt is to reopen it untimed and get it to green before you look at anything — the second pass is where the pattern actually lands.`,
    next: {
      title: `Drill ${p}`,
      body: `Reopen it untimed with the hints and the write-up open, get it green, then close everything and type it again from blank. The second pass is the one that sticks.`,
    },
  };
}

export const noteFor = (pattern: string | null, kind: "sql" | "code"): PatternNote =>
  (pattern && PATTERN_NOTES[pattern]) || genericNote(pattern ?? "", kind);
