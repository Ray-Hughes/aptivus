import "server-only";
import { generateJson, type AiResult } from "./ai";

/**
 * Generating a language roadmap aimed at one person's actual job.
 *
 * The whole point is ordering by relevance rather than by the language's own
 * structure, so every lesson has to justify itself against the job. A lesson
 * that cannot say why this role needs it does not belong in the roadmap.
 */

/** Only languages we can genuinely execute. Offering more would be a lie. */
export const RUNNABLE = ["python", "javascript", "ruby"] as const;
export type Runnable = (typeof RUNNABLE)[number];

export const LANGUAGE_LABEL: Record<string, string> = {
  python: "Python", javascript: "JavaScript", ruby: "Ruby",
  go: "Go", rust: "Rust", java: "Java", c: "C", csharp: "C#", typescript: "TypeScript",
};

/** Named so the model cannot invent a signature we then cannot call. */
export type Lesson = {
  title: string;
  relevance: string;
  estimatedMinutes: number;
  teaching: string;
  func: string;
  scaffold: string;
  solution: string;
  hints: [string, string, string];
  tests: { args: unknown[]; expected: unknown; sample: boolean }[];
};

export type Roadmap = {
  rationale: string;
  lessons: { title: string; relevance: string; concepts: string[]; estimatedMinutes: number }[];
};

const ROADMAP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rationale", "lessons"],
  properties: {
    rationale: { type: "string", minLength: 80, maxLength: 900 },
    lessons: {
      type: "array", minItems: 8, maxItems: 14,
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "relevance", "concepts", "estimatedMinutes"],
        properties: {
          title: { type: "string", maxLength: 80 },
          relevance: { type: "string", minLength: 30, maxLength: 260 },
          concepts: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
          estimatedMinutes: { type: "integer", minimum: 5, maximum: 25 },
        },
      },
    },
  },
} as const;

const LESSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "relevance", "estimatedMinutes", "teaching", "func",
             "scaffold", "solution", "hints", "tests"],
  properties: {
    title: { type: "string", maxLength: 80 },
    relevance: { type: "string", minLength: 30, maxLength: 260 },
    estimatedMinutes: { type: "integer", minimum: 3, maximum: 25 },
    teaching: { type: "string", minLength: 300, maxLength: 3000 },
    func: { type: "string", maxLength: 60 },
    scaffold: { type: "string", minLength: 20, maxLength: 2000 },
    solution: { type: "string", minLength: 20, maxLength: 2000 },
    hints: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", maxLength: 300 } },
    tests: {
      type: "array", minItems: 4, maxItems: 10,
      items: {
        type: "object", additionalProperties: false,
        required: ["args", "expected", "sample"],
        properties: {
          args: { type: "array" },
          expected: {},
          sample: { type: "boolean" },
        },
      },
    },
  },
} as const;

const VOICE = `
Write the way a good senior colleague explains something at a desk: concrete,
specific, and opinionated. No filler, no "in today's fast-paced world", no
restating the task back at the reader.

The reader is an experienced engineer. They are not learning to program; they
are learning one language's way of doing what they already know. Lead with
where their existing instinct produces the WRONG thing in this language - that
is the highest-value sentence you can write for them.
`.trim();

export function roadmapPrompt(input: {
  targetLanguage: string;
  knownLanguages: string[];
  jobTitle: string;
  jobContext?: string | null;
}) {
  const known = input.knownLanguages.length ? input.knownLanguages.join(", ") : "unspecified";
  return `
Build a hands-on ${LANGUAGE_LABEL[input.targetLanguage] ?? input.targetLanguage} roadmap for
an experienced engineer who already knows ${known} and is starting this role:

Role: ${input.jobTitle}
${input.jobContext ? `What the job involves:\n${input.jobContext}` : ""}

Order the lessons by what this job needs FIRST, not by how the language is
usually taught. Skip anything a working engineer in this role would rarely
touch, however traditional it is to teach it early.

Every lesson's "relevance" must name something concrete about THIS role - the
kind of code they will be reading or writing in their first fortnight. If you
cannot justify a lesson that way, leave it out.

In "rationale", say plainly what you have prioritised and, just as usefully,
what you have deliberately left out and why.
`.trim();
}

export function lessonPrompt(input: {
  targetLanguage: string;
  knownLanguages: string[];
  jobTitle: string;
  spec: Roadmap["lessons"][number];
  position: number;
  total: number;
}) {
  return `
Write lesson ${input.position} of ${input.total} in a ${LANGUAGE_LABEL[input.targetLanguage]}
roadmap for an engineer who knows ${input.knownLanguages.join(", ") || "another language"}
and is starting as: ${input.jobTitle}

Lesson: ${input.spec.title}
Why it is here: ${input.spec.relevance}
Concepts: ${input.spec.concepts.join(", ")}

Produce:

- "teaching": markdown. Short. Explain the idea, then show the shape of it in
  code. Where the reader's existing language would lead them astray, say so
  explicitly ("in Ruby this returns nil; here it raises"). This is read in a
  narrow pane, so keep code lines under about 70 characters.

- "scaffold": the starting code the learner sees. It must be MOSTLY WRITTEN -
  imports, the signature, the surrounding structure - with one clearly marked
  gap they complete. Mark it with a comment in the language's own idiom. The
  learner should be finishing a thought, not facing a blank file.

- "solution": the same code with the gap filled correctly. It must define a
  function named exactly "${"${func}"}" and must pass every test you write.

- "func": the exact function name the tests will call.

- "tests": JSON in, JSON out. Arguments as an array, expected as a JSON value.
  At least one must be an edge case that a nearly-correct answer would fail -
  an empty input, a duplicate, a boundary. Mark two as "sample": true.

- "hints": exactly three, escalating - a nudge, then the structure, then
  almost the answer.

${VOICE}
`.trim();
}

export async function generateRoadmap(input: Parameters<typeof roadmapPrompt>[0]) {
  return generateJson<Roadmap>({
    system:
      "You design hands-on programming curricula targeted at a specific job. " +
      "You are ruthless about relevance and honest about what you omit.",
    prompt: roadmapPrompt(input),
    schema: ROADMAP_SCHEMA as unknown as Record<string, unknown>,
    effort: "high",
  });
}

export async function generateLesson(
  input: Parameters<typeof lessonPrompt>[0],
): Promise<AiResult<Lesson>> {
  return generateJson<Lesson>({
    system:
      "You write short, hands-on programming lessons for experienced engineers " +
      "learning a new language for a specific job. Every lesson ends in code the " +
      "reader completes, and your reference solution always passes your own tests.",
    prompt: lessonPrompt(input),
    schema: LESSON_SCHEMA as unknown as Record<string, unknown>,
    effort: "high",
  });
}
