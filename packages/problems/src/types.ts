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
 * What a problem looks like once it has left the server: no hidden tests, no
 * reference solutions, no per-language notes beyond the starter. Built by
 * `redactProblem` in the web app, and typed here so the redaction and the
 * format cannot disagree.
 */
export type PublicBinding = Pick<Binding, "starter">;

export type PublicProblem = Omit<Problem, "languages" | "tests" | "explanation" | "sql"> & {
  languages: Partial<Record<Language, PublicBinding>>;
  /** Sample tests only. */
  tests?: Test[];
  /** Hidden tests are not sent, but their count is not a secret. */
  hiddenTestCount: number;
  sql?: Omit<SqlSpec, "expectedRowCount">;
};
