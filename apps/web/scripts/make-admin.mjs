/**
 * Promote an account to admin:  node scripts/make-admin.mjs you@example.com
 *
 * There is deliberately no admin signup route, so this is the only way in.
 * Run it against whichever database you want to change - local by default,
 * production when DATABASE_URL points there.
 */
import { connectChecked } from "./db.mjs";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("usage: node scripts/make-admin.mjs you@example.com");
  process.exit(1);
}

const c = await connectChecked();
const found = await c.execute({ sql: "SELECT id, role FROM users WHERE email = ?", args: [email] });

if (!found.rows.length) {
  console.error(`\nNo account with that address. Accounts on this database:\n`);
  const all = await c.execute("SELECT email, role FROM users ORDER BY created_at DESC LIMIT 20");
  for (const r of all.rows) console.error(`  ${r.email}  (${r.role})`);
  console.error("\nSign up first, then run this again.\n");
  process.exit(1);
}

if (found.rows[0].role === "admin") {
  console.log(`${email} is already an admin.`);
} else {
  await c.execute({ sql: "UPDATE users SET role = 'admin' WHERE email = ?", args: [email] });
  console.log(`${email} is now an admin.`);
}
console.log("Sign out and back in - the role is carried in the session token.");
