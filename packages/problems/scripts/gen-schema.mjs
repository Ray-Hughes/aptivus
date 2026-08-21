/**
 * Generate schema.json from the zod schema, so the JSON Schema is derived
 * rather than maintained. `verify.mjs` re-runs this in memory and fails if the
 * checked-in file is stale.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ProblemSchema } from "../src/schema.mjs";

export const SCHEMA_FILE = join(dirname(dirname(fileURLToPath(import.meta.url))), "schema.json");

export function buildJsonSchema() {
  const schema = z.toJSONSchema(ProblemSchema, { io: "input", unrepresentable: "any" });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://aptivus.dev/schemas/problem-v2.json",
    title: "Aptivus problem format v2",
    description:
      "A language-neutral practice problem: prompt, hints, tests and explanation are shared, " +
      "and each language contributes only a starter, a reference solution and its own notes. " +
      "Generated from packages/problems/src/schema.mjs - edit that, then run `npm run schema`.",
    ...schema,
  };
}

export function serialize(schema) {
  return `${JSON.stringify(schema, null, 2)}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(SCHEMA_FILE, serialize(buildJsonSchema()));
  console.log(`wrote ${SCHEMA_FILE}`);
}
