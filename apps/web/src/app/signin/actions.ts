"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/auth";
import { safeNext } from "@/lib/admin";
import { fail, type ActionState } from "@/lib/forms";

const Credentials = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export async function signInWithPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = Credentials.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    // Deliberately vague: a precise message here is an account-enumeration oracle.
    return fail("Enter an email address and a password.");
  }

  try {
    await signIn("password", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: safeNext(parsed.data.next),
    });
  } catch (error) {
    // signIn signals a successful redirect by throwing NEXT_REDIRECT; only real
    // auth failures are ours to swallow.
    if (error instanceof AuthError) {
      return fail("That email and password did not match an account.");
    }
    throw error;
  }
  return null;
}
