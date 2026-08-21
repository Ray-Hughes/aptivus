/**
 * Shared shape for every Server Action in the admin panel.
 *
 * Deliberately free of server-only imports so a Client Component can `import
 * type { ActionState }` without dragging the database into the browser bundle.
 */
export type ActionState = {
  ok: boolean;
  message: string;
  /** Field-level messages, keyed by input name. */
  fields?: Record<string, string>;
} | null;

export const idle: ActionState = null;

export function ok(message: string): ActionState {
  return { ok: true, message };
}

export function fail(message: string, fields?: Record<string, string>): ActionState {
  return { ok: false, message, fields };
}
