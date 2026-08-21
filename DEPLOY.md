# Deploying Aptivus

The repo is a monorepo. The deployable app is `apps/web`; everything else is
content and tooling.

## You do not need to give anyone credentials

Vercel deploys on every push to `main` once the repo is imported. There is
nothing to hand over for that to work.

If you want deploys driven from a terminal instead, run `vercel login` on your
own machine — the CLI stores its own credential under `~/.vercel` and no token
ever needs to be pasted anywhere. **Do not paste a Vercel token into a chat
window**: it grants full account access and would then live in the transcript
and in any log that captured it. If you must use one, put it in your shell as
`VERCEL_TOKEN` and rotate it afterwards.

## 1. Point Vercel at the right directory

Project → Settings → General → **Root Directory: `apps/web`**.

Without this the build fails immediately: the repository root has no
`package.json` with a Next app in it.

## 2. Use a hosted database

The local development database is a SQLite file. **A file cannot work on
Vercel** — the filesystem is ephemeral, so every signup would vanish on the
next cold start. The app now refuses to boot in that configuration rather than
losing data silently.

Use Turso, which is hosted libsql — the same driver already in use, so no code
changes:

```bash
brew install tursodatabase/tap/turso
turso auth login
turso db create aptivus
turso db show aptivus --url          # -> libsql://aptivus-<org>.turso.io
turso db tokens create aptivus       # -> the auth token
```

Then apply the schema to it:

```bash
cd apps/web
DATABASE_URL='libsql://…' DATABASE_AUTH_TOKEN='…' node scripts/migrate.mjs
DATABASE_URL='libsql://…' DATABASE_AUTH_TOKEN='…' ADMIN_PASSWORD='<a real one>' node scripts/seed.mjs
DATABASE_URL='libsql://…' DATABASE_AUTH_TOKEN='…' node scripts/import-problems.mjs
DATABASE_URL='libsql://…' DATABASE_AUTH_TOKEN='…' node scripts/import-companies.mjs
```

`seed.mjs` refuses to run against a production database without
`ADMIN_PASSWORD`, on purpose: a known default password on a live admin account
is an open door.

## 3. Environment variables

Project → Settings → Environment Variables.

| Variable | Value | Required |
|---|---|---|
| `DATABASE_URL` | `libsql://…` from Turso | yes |
| `DATABASE_AUTH_TOKEN` | Turso token | yes |
| `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` | yes |
| `AUTH_URL` | `https://<your-domain>` — must be https | yes |
| `APTIVUS_ENV` | `production` | recommended |
| `EMAIL_FROM` | `Aptivus <hello@aptivus.dev>` | yes |
| `RESEND_API_KEY` | needed for real email; without it links print to the log | no |
| `STRIPE_SECRET_KEY` etc. | billing stays off without them | no |

The app **refuses to start** in production on a weak `AUTH_SECRET` or a
non-https `AUTH_URL`. With JWT sessions, anyone holding the secret can mint an
admin session, so this is deliberate.

## 4. Email

Magic links and password resets print to the server log until `RESEND_API_KEY`
is set. That is fine for a first deploy and useless for real users — sign-in
silently fails for anyone who is not reading your logs. Add a sending domain
with SPF and DKIM before inviting anybody.

## 5. Custom domain

Add `aptivus.dev` in Project → Settings → Domains once purchased, then update
`AUTH_URL` to match. Auth callbacks break if `AUTH_URL` and the real origin
disagree.

## Known gaps before real users

- Email delivery is unconfigured (above).
- Billing is behind the `billing` feature flag and has no Stripe keys.
- Rate limiting is in-process, so it resets on each cold start and is per
  instance. Move it to Redis or Upstash before it matters.
- No Terms, Privacy or refund policy, which are needed before taking money.
- No backups configured on the Turso database.
