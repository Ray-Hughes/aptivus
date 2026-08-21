/**
 * Problem format v2 - the runtime schema.
 *
 * This file is the single source of truth for the format. `src/types.ts` infers
 * the TypeScript types from it and `schema.json` is generated from it, so the
 * three artefacts cannot drift apart.
 *
 * It is plain ESM JavaScript rather than TypeScript on purpose: `verify.mjs`,
 * the import script and the Next app all need it at runtime, and none of them
 * should need a compile step or an experimental Node flag to read a problem.
 *
 * The design is `docs/multi-language.md` §4. The short version: everything that
 * is expensive to author - prompt, hints, tests, explanation, follow-ups - is
 * language-neutral, and the only per-language content is a `starter`, a
 * reference `solution` and a set of `notes`. A problem is valid with exactly
 * one language filled in, so the library can grow language by language.
 */
import { z } from "zod";

/** Languages that can carry a starter/solution/notes binding. */
export const LANGUAGES = ["python", "javascript", "ruby", "sql"];

/** The languages a `kind: "code"` problem can be solved in. */
export const CODE_LANGUAGES = ["python", "javascript", "ruby"];

export const DIFFICULTIES = ["easy", "medium", "hard"];

/**
 * A parameter type, written in a small language-neutral grammar:
 *
 *   int | float | number | string | bool | any   scalars
 *   T[]                                          a list of T ("int[]", "int[][]")
 *   map<string, T>                               an object keyed by string
 *
 * Python and Ruby do not need this. C++ and Java do - a harness cannot declare
 * a call site without it - and adding it now costs a few lines per problem
 * where retrofitting it across a large library would not.
 */
const TYPE_RE = /^(?:int|float|number|string|bool|any|map<\s*string\s*,\s*[^<>]+>)(?:\[\])*$/;
export const TypeName = z.string().regex(TYPE_RE, "not a valid v2 type expression");

export const ParamSchema = z.object({
  name: z.string().min(1),
  type: TypeName,
  /** Optional prose, for a param whose meaning is not obvious from its name. */
  description: z.string().optional(),
});

/**
 * Per-language function naming. Nothing here is translation: `find_pair` in
 * Python is `findPair` in JavaScript because those are the conventions, and a
 * candidate typing the wrong one has done nothing wrong.
 */
export const SignatureSchema = z.object({
  name: z.object({
    python: z.string().min(1).optional(),
    javascript: z.string().min(1).optional(),
    ruby: z.string().min(1).optional(),
  }),
  params: z.array(ParamSchema),
  returns: TypeName,
});

/**
 * A test is JSON in, JSON out, which is what makes it shareable across every
 * language. `args` is used by `mode: "function"` problems and `stdin` by
 * `mode: "stdin"` ones.
 */
export const TestSchema = z
  .object({
    args: z.array(z.unknown()).optional(),
    stdin: z.string().optional(),
    expected: z.unknown(),
    /** Sample tests are shown to the learner. Everything else is hidden. */
    sample: z.boolean().optional(),
    /** Compare lists as multisets for this case only. */
    unordered: z.boolean().optional(),
  })
  // `expected` may legitimately be null, so presence has to be checked rather
  // than truthiness.
  .refine((t) => "expected" in t, { message: "a test must state its expected value" });

export const BindingSchema = z.object({
  /** What the learner starts with. */
  starter: z.string(),
  /** The reference solution. `verify` runs this against every test. */
  solution: z.string(),
  /**
   * Written for someone who already knows another language, in this library a
   * Rubyist. Per-language on purpose: the notes a Rubyist needs for JavaScript
   * are different content, not a translation of the Python ones.
   */
  notes: z.string().optional(),
});

export const SqlSchema = z.object({
  schema: z.string().min(1),
  seed: z.string().min(1),
  /** Whether row order is part of the answer. */
  ordered: z.boolean().default(false),
  /** Dialect the reference solution is written against. */
  dialect: z.enum(["sqlite", "postgres"]).default("sqlite"),
  /**
   * Row count the reference query must return. Migrated from the row-count
   * claims the starters make ("your result must have 8 rows"), so the claim and
   * the query are checked against each other rather than only against a reader.
   */
  expectedRowCount: z.int().positive().optional(),
});

const Base = z.object({
  /** Stable, unique across all packs. Also the URL slug. */
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  pack: z.string().min(1),
  /**
   * "code" for a problem solved by writing a function or a program in one of
   * the code languages, "sql" for one solved by writing a query. Deliberately
   * not "python": the whole point of v2 is that a problem is not owned by a
   * language.
   */
  kind: z.enum(["code", "sql"]),
  title: z.string().min(1),
  difficulty: z.enum(DIFFICULTIES),
  pattern: z.string().default(""),
  tags: z.array(z.string()).default([]),
  minutes: z.int().positive(),

  /* --- language-neutral content ------------------------------------- */
  prompt: z.string().min(1),
  hints: z.array(z.string()).default([]),
  /** The idea, not the syntax. Syntax lives in `languages.<lang>.notes`. */
  explanation: z.string().default(""),
  complexity: z.string().optional(),
  followups: z.array(z.string()).default([]),

  languages: z
    .object({
      python: BindingSchema.optional(),
      javascript: BindingSchema.optional(),
      ruby: BindingSchema.optional(),
      sql: BindingSchema.optional(),
    })
    .default({}),
});

const CodeProblem = Base.extend({
  kind: z.literal("code"),
  /** "function" calls a named function; "stdin" runs the file against stdin. */
  mode: z.enum(["function", "stdin"]).default("function"),
  signature: SignatureSchema,
  tests: z.array(TestSchema).min(1),
  /** Compare every list result as a multiset. */
  unordered: z.boolean().default(false),
});

const SqlProblem = Base.extend({
  kind: z.literal("sql"),
  sql: SqlSchema,
});

/** Structural checks that need to see the whole problem. */
function crossCheck(p, ctx) {
  const langs = Object.keys(p.languages);

  if (p.kind === "sql") {
    if (!p.languages.sql) {
      ctx.addIssue({ code: "custom", path: ["languages", "sql"], message: "a sql problem needs a sql binding" });
    }
    for (const l of langs) {
      if (l !== "sql") {
        ctx.addIssue({ code: "custom", path: ["languages", l], message: `a sql problem cannot have a ${l} binding` });
      }
    }
    return;
  }

  const present = langs.filter((l) => l !== "sql");
  if (present.length === 0) {
    ctx.addIssue({ code: "custom", path: ["languages"], message: "at least one language binding is required" });
  }
  if (p.languages.sql) {
    ctx.addIssue({ code: "custom", path: ["languages", "sql"], message: "a code problem cannot have a sql binding" });
  }
  // Every language present must be callable: it needs a function name, unless
  // the problem is a whole-program stdin one where there is nothing to call.
  if (p.mode === "function") {
    for (const l of present) {
      if (!p.signature.name[l]) {
        ctx.addIssue({
          code: "custom",
          path: ["signature", "name", l],
          message: `languages.${l} is filled in but signature.name.${l} is missing`,
        });
      }
    }
  }
  p.tests.forEach((t, i) => {
    if (p.mode === "function" && !Array.isArray(t.args)) {
      ctx.addIssue({ code: "custom", path: ["tests", i, "args"], message: "a function-mode test needs args" });
    }
    if (p.mode === "stdin" && typeof t.stdin !== "string") {
      ctx.addIssue({ code: "custom", path: ["tests", i, "stdin"], message: "a stdin-mode test needs stdin" });
    }
  });
  if (p.mode === "function" && p.signature.params.length) {
    const arity = p.signature.params.length;
    p.tests.forEach((t, i) => {
      if (Array.isArray(t.args) && t.args.length !== arity) {
        ctx.addIssue({
          code: "custom",
          path: ["tests", i, "args"],
          message: `test passes ${t.args.length} args but the signature declares ${arity} params`,
        });
      }
    });
  }
}

export const ProblemSchema = z
  .discriminatedUnion("kind", [CodeProblem, SqlProblem])
  .superRefine(crossCheck);

/** A pack's manifest, `packs/<pack>/pack.json`. */
export const PackSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  /** Companies this pack is targeted at, matched against `companies.slug`. */
  companies: z.array(z.string()).default([]),
  source: z.string().default(""),
});

/** Parse and throw with a readable path on failure. */
export function parseProblem(raw, where = "<problem>") {
  const out = ProblemSchema.safeParse(raw);
  if (out.success) return out.data;
  const lines = out.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
  throw new Error(`${where} is not a valid v2 problem:\n${lines.join("\n")}`);
}
