/**
 * Aptivus course format.
 *
 * The JSON Schema in ../course-schema.json is the authority; these types are the
 * hand-maintained mirror of it. If you change one, change the other, then run
 * `node validate.mjs` - it checks the JSON files against the schema, not against
 * these types.
 *
 * A course is a sequence of modules. A module is teaching content, an ordered list
 * of problems, a checkpoint, and a rule for what counts as done. Progress is tracked
 * per module, keyed by `course.slug` then `module.id`, so both must be stable for the
 * life of the course.
 */

/** Lower-case kebab-case: `sql-for-interviews`, `window-functions-i`. */
export type Slug = string;

/**
 * A problem id as the loader derives it: the filename stem under
 * `packs/<pack>/{python,sql}/`, e.g. `py_07_merge_intervals`, `sql_09_loss_ratio`.
 * Ids are unique across packs, so a course never needs to name the pack.
 */
export type ProblemSlug = string;

export type Level = "foundational" | "intermediate" | "advanced";

export interface Course {
  /** Editor convenience: relative path to course-schema.json. */
  $schema?: string;
  /** Stable identifier, used in URLs and as the top-level progress key. */
  slug: Slug;
  title: string;
  subtitle: string;
  /** Who this is for. Say who it is *not* for as well. */
  audience: string;
  level?: Level;
  /** Honest total. Must agree with the sum of module estimatedMinutes. */
  estimatedHours: number;
  /** Where the estimate comes from, and what makes it longer or shorter. */
  timeNote?: string;
  /** Plain-English prerequisites. Empty array means none. */
  prerequisites: string[];
  /** Slugs of courses that should come first. Validated to exist. */
  prerequisiteCourses?: Slug[];
  /** Observable things the learner can do afterwards. */
  outcomes: string[];
  tags?: string[];
  version?: number;
  modules: Module[];
}

export interface Module {
  /** Stable within the course. This is the per-module progress key. */
  id: Slug;
  title: string;
  summary: string;
  /** Honest working time for this module, including solving the problems. */
  estimatedMinutes: number;
  objectives?: string[];
  /**
   * Markdown. The lesson itself. Concrete and opinionated: name the trap, show the
   * line, say what an interviewer is listening for. The schema sets a minimum length
   * so placeholders fail validation.
   */
  teaching: string;
  /** Ordered. Order is the curriculum; do not sort it in the UI. */
  problems: ProblemRef[];
  checkpoint: Checkpoint;
  completion: Completion;
  /** Markdown shown after the checkpoint: what to carry into the next module. */
  recap?: string;
}

export interface ProblemRef {
  slug: ProblemSlug;
  /** Why this problem is here and what to watch for while solving it. */
  note?: string;
  /** Not required for completion. Planned problems must set this. */
  optional?: boolean;
  /**
   * The problem has not been authored yet. The course still validates: the checker
   * expects the slug to be absent from `packs/` and requires `optional: true`, so
   * every course stays completable with the content that exists today.
   */
  planned?: boolean;
  /** Required when `planned` is true: the brief for whoever writes it. */
  plannedSpec?: PlannedSpec;
}

export interface PlannedSpec {
  title: string;
  pattern: string;
  difficulty: "easy" | "medium" | "hard";
  minutes: number;
  brief?: string;
}

export interface Checkpoint {
  id: Slug;
  title: string;
  intro?: string;
  questions: Question[];
}

export type QuestionKind =
  /** Multiple choice, auto-graded from `answer`. */
  | "choice"
  /** Type it from memory; self-graded against `modelAnswer`. */
  | "recall"
  /** Say it out loud; self-graded against `modelAnswer`. */
  | "explain";

export interface Question {
  id: Slug;
  kind: QuestionKind;
  prompt: string;
  /** `choice` only. */
  options?: string[];
  /** `choice` only: index into `options`. */
  answer?: number;
  /** `recall` and `explain`: what a good answer contains. */
  modelAnswer?: string;
  /** `choice`: why the right answer is right and the others are not. */
  explanation?: string;
}

export type CompletionRule =
  /** Every non-optional problem in the module is solved. */
  | "all-required-problems"
  /** Any `minProblemsSolved` of the module's problems. */
  | "min-problems"
  /** No problems needed; the checkpoint is the bar. */
  | "checkpoint-only"
  /** The learner ticks it off: reading, drawing, speaking practice. */
  | "self-attested";

export interface Completion {
  rule: CompletionRule;
  /** Required when rule is `min-problems`. */
  minProblemsSolved?: number;
  /** Default true. */
  requireCheckpoint?: boolean;
  /** Fraction of checkpoint questions correct, 0..1. Default 0.8. */
  checkpointPassScore?: number;
  notes?: string;
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

/**
 * Progress is stored separately from the course, keyed by course slug then module id.
 * It never contains course content, so a course can be edited underneath a learner
 * without invalidating what they have done.
 */
export interface CourseProgress {
  courseSlug: Slug;
  /** Course version the learner started on, for migration decisions. */
  version?: number;
  startedAt?: string;
  completedAt?: string;
  modules: Record<Slug, ModuleProgress>;
}

export interface ModuleProgress {
  startedAt?: string;
  completedAt?: string;
  /** Problem slugs the learner has solved *within this course*. */
  solved: ProblemSlug[];
  /** Latest checkpoint attempt. Earlier attempts are not kept. */
  checkpoint?: CheckpointResult;
  /** For `self-attested` modules. */
  attested?: boolean;
  /** Free-text notes the learner wrote while working through the module. */
  notes?: string;
}

export interface CheckpointResult {
  at: string;
  /** 0..1. Auto-graded for `choice`, self-marked for `recall` and `explain`. */
  score: number;
  answers: Record<Slug, { correct: boolean; response?: string }>;
}

/** Everything a UI needs to render a module's state without re-deriving rules. */
export interface ModuleStatus {
  moduleId: Slug;
  state: "locked" | "available" | "in-progress" | "complete";
  requiredProblems: ProblemSlug[];
  solvedRequired: ProblemSlug[];
  checkpointPassed: boolean;
  /** 0..1, for a progress bar. */
  fraction: number;
}
