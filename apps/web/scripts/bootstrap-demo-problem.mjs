/* One problem so the practice route is demonstrable before the full pack
   import lands. Idempotent and keyed by slug, so the real importer wins. */
import { connectChecked } from "./db.mjs";
import { randomUUID } from "node:crypto";

const c = await connectChecked();
const body = {
  prompt:
    "An underwriter wants to bind exactly two accounts whose premiums add up to a target.\n\n" +
    "Given a list of premiums and a target, return the **indices** of the two accounts as a list " +
    "`[i, j]` with `i < j`. Exactly one valid pair exists. Return `[]` if none.\n\nDo it in one pass.",
  hints: [
    "The brute force is two nested loops, O(n^2). What would let you ask 'have I already seen the number I need?' in O(1)?",
    "As you walk the list, store {value: index} for everything you have already passed.",
    "For each premium p, the number you need is target - p. Check the dict BEFORE inserting p, so you never pair an element with itself.",
  ],
  signature: {
    name: { python: "find_pair", javascript: "findPair" },
    params: [{ name: "premiums", type: "int[]" }, { name: "target", type: "int" }],
    returns: "int[]",
  },
  tests: [
    { args: [[2500, 7500, 11000, 4000], 6500], expected: [0, 3], sample: true },
    { args: [[3000, 3000], 6000], expected: [0, 1], sample: true },
    { args: [[1000, 2000, 3000], 10000], expected: [] },
    { args: [[5, -2, 7, 1], 5], expected: [1, 2] },
    { args: [[0, 0, 4], 0], expected: [0, 1] },
    { args: [[42], 42], expected: [] },
  ],
  languages: {
    python: {
      starter: "def find_pair(premiums, target):\n    # premiums: list[int], target: int -> list[int]\n    pass\n",
      solution:
        "def find_pair(premiums, target):\n    seen = {}\n    for i, p in enumerate(premiums):\n" +
        "        need = target - p\n        if need in seen:\n            return [seen[need], i]\n" +
        "        seen[p] = i\n    return []\n",
    },
  },
  followups: [
    "What if there can be many valid pairs and you must return all of them, without duplicates?",
    "What if the input is already sorted? (Two pointers, O(1) extra space.)",
  ],
};

const slug = "two-sum-premium";
const existing = await c.execute({ sql: "SELECT id FROM problems WHERE slug = ?", args: [slug] });
if (existing.rows.length) {
  console.log("already present:", slug);
} else {
  await c.execute({
    sql: `INSERT INTO problems (id, slug, pack, kind, title, difficulty, pattern, minutes, body, source, is_published, created_at)
          VALUES (?, ?, 'federato', 'python', ?, 'easy', 'hash map', 10, ?, 'curated', 1, ?)`,
    args: [randomUUID(), slug, "Two accounts hitting a premium target",
           JSON.stringify(body), Math.floor(Date.now() / 1000)],
  });
  console.log("inserted:", slug);
}
