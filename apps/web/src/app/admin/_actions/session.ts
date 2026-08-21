"use server";

import { signOut } from "@/auth";

/** POST-only by construction: a Server Action cannot be triggered by a GET. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/signin" });
}
