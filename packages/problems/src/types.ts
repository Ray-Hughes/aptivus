/**
 * Problem format v2 - the TypeScript view of the format.
 *
 * Every type here is inferred from the zod schema in `schema.mjs`, so there is
 * exactly one definition of the format and these cannot drift from what the
 * verifier and the importer actually enforce.
 */
import type { z } from "zod";
import type {
  BindingSchema,
  PackSchema,
  ParamSchema,
  ProblemSchema,
  SignatureSchema,
  SqlSchema,
  TestSchema,
} from "./schema.mjs";

/** "python" | "javascript" | "ruby" | "sql" */
export type Language = keyof Problem["languages"];

/** The languages a `kind: "code"` problem can be solved in. */
export type CodeLanguage = Exclude<Language, "sql">;

export type Difficulty = Problem["difficulty"];

export type Param = z.infer<typeof ParamSchema>;
export type Signature = z.infer<typeof SignatureSchema>;
export type Test = z.infer<typeof TestSchema>;
export type Binding = z.infer<typeof BindingSchema>;
export type SqlSpec = z.infer<typeof SqlSchema>;
export type Pack = z.infer<typeof PackSchema>;

/** A problem in format v2. Discriminated on `kind`. */
export type Problem = z.infer<typeof ProblemSchema>;

export type CodeProblem = Extract<Problem, { kind: "code" }>;
export type SqlProblem = Extract<Problem, { kind: "sql" }>;

/**
 * What a problem looks like once it has left the server.
 *
 * This is the contract the API's redaction has to satisfy, and it lives here
 * rather than in the web app because "what is safe to send" is a property of
 * the format. Four things are deliberately absent:
 *
 *   - hidden tests (only the sample ones travel, plus a count)
 *   - every reference `solution`
 *   - the hint text, which is metered per hint
 *   - the `explanation`, `complexity` and per-language `notes`, which are the
 *     write-up the solution endpoint meters
 *
 * Those are the paid tier. If any of them ever appears in this type by
 * accident, the product has been given away.
 */
export type PublicTest = Omit<Test, "sample"> & { sample: true };

/** The starter is the only part of a language binding that is free. */
export type PublicBinding = Pick<Binding, "starter">;

export type ProblemSummary = {
  id: string;
  pack: string;
  kind: Problem["kind"];
  title: string;
  difficulty: Difficulty;
  pattern: string;
  tags: string[];
  minutes: number;
  /** Languages this problem can be attempted in. */
  languages: Language[];
  company: { slug: string; name: string } | null;
};

export type PublicProblem = ProblemSummary & {
  prompt: string;
  followups: string[];
  /** How many hints exist. The text of each is metered. */
  hintCount: number;
  /** Present for `kind: "code"`. */
  mode?: CodeProblem["mode"];
  signature?: Signature;
  unordered?: boolean;
  sampleTests?: PublicTest[];
  hiddenTestCount?: number;
  /** Present for `kind: "sql"`: enough to run the query locally, nothing more. */
  sql?: Omit<SqlSpec, "expectedRowCount">;
  /** Starters only. */
  starters: Partial<Record<Language, PublicBinding>>;
};
