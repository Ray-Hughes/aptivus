# Phase 2: Aptivus as a product

Turning a local single-user practice tool into a hosted service with accounts,
subscriptions, and generated content.

Written Aug 20, 2026. Nothing here is built yet.

---

## 0. The thing to decide before anything else

Phase 1 is a **zero-install, local, single-user, MIT-licensed tool**. Phase 2 is a
**hosted multi-tenant SaaS with metered features and payments**. Those are different
products with different architectures, and one of them cannot enforce the other's rules:
you cannot meter hints in code the user has a copy of and can edit.

Three coherent options:

| | What it means | Cost |
|---|---|---|
| **A. Dual** *(recommended)* | The OSS repo stays a free, unlimited, local tool. The hosted product shares the problem format and the runner, and adds accounts, generated content, and billing on top. | Slightly more structure: split the shared core from the two front ends. |
| **B. Hosted only** | Stop publishing the local tool; everything moves behind accounts. | Loses the open-source distribution channel, which is currently the cheapest way to be found. |
| **C. Open core** | Repo keeps the engine, the paid features live in a private repo. | Common and workable, but expect friction every time a feature straddles the line. |

**Recommendation: A.** The local tool is the top of the funnel and costs almost nothing
to keep. The hosted product sells what a local tool fundamentally cannot give you:
generated content targeted at your actual interview, progress that follows you, and
nothing to install.

Concretely:

```
aptivus/
  core/          # problem format, runner, tracer, verifier - shared, MIT
  local/         # today's stdlib server + CLI - MIT, unlimited, no accounts
  web/           # Django project - accounts, billing, generation
  packs/         # curated problem packs - MIT
```

---

## 1. Where user code runs — the biggest risk in Phase 2

Right now we execute arbitrary user Python in a subprocess on the machine running the
server. Locally that is fine: it is the user's own machine and their own code. **Hosted,
that is a remote code execution service**, and it is the single most dangerous thing in
this plan. A `subprocess` with a timeout is not a sandbox. Neither is a plain Docker
container — shared-kernel isolation is no longer considered adequate for untrusted code.

Doing it server-side properly means microVM isolation (Firecracker/Kata) or at minimum
gVisor, with no network, read-only filesystem, memory and CPU caps, and a fresh sandbox
per run. That is real ops work and a real per-run cost, forever, including for free users.

### The alternative: run everything in the browser

**Verified on Aug 20:** `sys.settrace` works in Pyodide. A test in headless Chrome traced
the same two-sum input and produced **18 steps — identical to our server-side tracer**.
SQL problems can run on SQLite compiled to WASM (`sql.js`) the same way.

That means the entire execution engine — runner, tracer, expression console, SQL grader —
can move into the browser:

- **The RCE risk disappears.** Users run their own code in their own tab. The blast
  radius is their own browser sandbox.
- **Free tier costs approximately nothing** to serve. No compute per run.
- **It stays fast** and works offline once loaded.
- **The server keeps only what must be trusted**: accounts, entitlements, gem balances,
  and the reference solutions and hidden tests it will not hand over unmetered.

Costs: a ~10MB Pyodide download on first use (cacheable), and the runner/tracer need
rework to run in a Web Worker instead of a subprocess. The tracing logic itself carries
over — it is the same CPython.

**Recommendation: move execution to the browser.** This is the decision that makes the
free tier economically viable and removes the scariest security surface.

### M0 result — done Aug 20, it holds

`core/engine.py` is now the single implementation of run/trace/eval. The local server
runs it in a subprocess; `web/static/engine-worker.js` runs *the same file* in Pyodide in
a Web Worker. A parity harness at `/parity` runs both and diffs them.

**57 checks across all 27 problems, zero mismatches** (`docs/parity.png`): per-test
pass/fail and return values, full step-by-step traces including every variable at every
step, expression evaluation mid-trace, and SQL results via `sql.js` against SQLite.

Three environment differences surfaced, all now handled:

1. **Memory addresses in reprs** (`<function walk at 0x…>`) differ by construction.
   Masked when comparing; nothing to fix.
2. **Set iteration order** differs between CPython and the WASM build, because it is
   hash-derived. Fixed properly rather than papered over: `stable_repr()` renders sets
   sorted, so a set now displays the same way twice in a row anywhere. That is a better
   product, not just a greener test.
3. **JSON has one number type**, so parsing problem data in JavaScript turns `1.0` into
   `1` and cannot turn it back. Fixed by shipping problem data to the browser as text and
   parsing it in Python, which keeps ints and floats distinct.

Point 3 is the one to remember when wiring the real client: **parse problem data in
Python, not in JS.**

Startup cost measured informally: Pyodide boots in a few seconds on first load and is
cached afterwards; each subsequent run is effectively instant.

One consequence to design around, and the reason `/api/dev/bundle` is gated behind an
env var: **hidden tests and reference solutions must not be sent to the client** unless the user has paid or spent for them. Grading a submission client-side
means either shipping the expected outputs (and losing the metering) or keeping a
server-side check for the hidden set. Simplest workable split: run sample tests in the
browser, submit to the server for the hidden set (cheap — the server runs the *reference*
solution, not the user's code, and compares hashes of outputs).

---

## 2. Stack

The current stdlib `http.server` is right for a local tool and wrong for this. Auth,
sessions, password reset, migrations, an admin, and CSRF are all things you do not want
to hand-roll on a service holding user credentials.

**Recommendation: Django.** It ships auth, sessions, password reset, an ORM with
migrations, CSRF, and an admin. Coming from Rails it will feel familiar — models,
migrations, middleware, an admin console. It keeps the language the same as the tracer
and the problem format, so `core/` is imported directly rather than called over a wire.

FastAPI is the fashionable answer and is a worse fit here: you would be assembling auth
and admin by hand, which is precisely the part where mistakes are expensive.

Postgres for the database. Redis only if and when you need rate-limit counters or
background jobs — do not start with it.

---

## 3. Data model

```
user                id, email(unique, citext), email_verified_at, password_hash(nullable),
                    display_name, created_at, last_seen_at, timezone
                    -- password_hash nullable so passwordless-only accounts are first class

auth_token          id, user_id, kind(magic_link|password_reset|email_verify),
                    token_hash, expires_at, consumed_at, created_ip
                    -- store the HASH, never the token

session             handled by Django

profile             user_id, target_company, target_role, target_round(coding|system_design),
                    experience_level, primary_language

subscription        user_id, stripe_customer_id, stripe_subscription_id,
                    status(active|past_due|canceled|trialing), current_period_end, plan

gem_ledger          id, user_id, delta, kind(earn|purchase|spend|grant|refund),
                    reason, problem_id(nullable), stripe_ref(nullable), created_at
                    -- append only; balance is derived and cached on user

daily_usage         user_id, day_utc, hints_used, solutions_used
                    -- free-tier allowance, separate from gems

problem             id, pack, kind, difficulty, pattern, body(json), source(curated|generated),
                    owner_user_id(nullable for curated), verified_at

attempt             id, user_id, problem_id, status(tried|solved), code, tests_passed,
                    tests_total, hint_level_used, solution_revealed, duration_ms, created_at
                    -- one row per submission, not one per problem: this is the stats table

reveal              user_id, problem_id, kind(hint|solution), level, paid_with(free|gem|pro)
                    -- what has been unlocked, so re-opening is never charged twice
```

Two deliberate choices:

- **`attempt` is append-only.** Today's `progress.json` keeps only the latest state, so
  there is no history to build stats from. One row per submission gives you time-to-solve,
  attempts-per-problem, and improvement over time — which is most of the dashboard.
- **`gem_ledger` is append-only.** Never mutate a balance directly. When a payment is
  disputed or a bug over-charges someone, a ledger is the difference between a five-minute
  fix and an unanswerable question.

---

## 4. Accounts

### Pages

| Route | Notes |
|---|---|
| `/` | Landing page (new — see §6) |
| `/signup` | Email + optional password. Passwordless is the default path. |
| `/signin` | Password **or** "email me a link" |
| `/signout` | POST only, never GET (a GET signout can be triggered by an image tag) |
| `/forgot` | Request a reset; always the same response |
| `/reset/<token>` | Set a new password |
| `/magic/<token>` | One-click sign-in |
| `/verify/<token>` | Confirm email |
| `/dashboard` | Stats, target company, plan |
| `/settings` | Profile, password, email, plan, data export/delete |
| `/problems` | The practice app, now behind an account |

### Security requirements

Non-negotiable, because this is where a small mistake is a large incident:

- **Argon2id** for password hashing (Django supports it; set it as the first hasher).
- **Tokens**: 32 bytes from `secrets.token_urlsafe`, stored as SHA-256, compared in
  constant time, single-use, 15-minute expiry, invalidated on use and on password change.
- **No account enumeration**: `/forgot` and magic-link requests return the same response
  whether or not the address exists.
- **Rate limits** on every auth endpoint, per-IP and per-email, with backoff.
- **Cookies**: `HttpOnly`, `Secure`, `SameSite=Lax`. Rotate the session on sign-in and on
  password change.
- **CSRF** on every state-changing request. Django gives you this if you do not fight it.
- **Never log** tokens, passwords, or full session cookies.
- Email verification required before a first purchase.

### Email

Transactional email needs a real sender: Postmark or Resend, with SPF and DKIM on the
domain. Magic links that land in spam are the same as a broken login. Budget a day for
domain auth and deliverability testing — it is always slower than it looks.

---

## 5. Free tier, Pro, and gems

### The tiers

| | Free | Pro — $7.99/mo |
|---|---|---|
| All curated packs | yes | yes |
| Run, submit, trace, expression console | unlimited | unlimited |
| Hints | 5/day | unlimited |
| Solutions | 3/day | unlimited |
| Generated problems for your target company | 5 gems each | included, fair-use cap ~40/month |
| Progress and stats | yes | yes |

Daily allowances reset at 00:00 UTC and the dashboard should say so plainly, with a
countdown. "Resets in 6h" prevents most support email.

### Gems

**Earning** — server-authoritative, first clean solve of a problem only:

| | Gems |
|---|---|
| Solve an easy problem with no hint and no solution revealed | 2 |
| Same, medium | 4 |
| Same, hard | 6 |
| 7-day streak (at least one clean solve per day) | +10 |

Cap earnings at **30 gems/day** so the loop cannot be farmed by grinding easy problems.
Only the *first* clean solve of a given problem ever pays.

**Spending**: hint 1 gem, solution 3 gems, generated problem 5 gems.

**Buying**: 60 gems $1.99 · 200 gems $4.99 · 500 gems $9.99.

The pricing has to make Pro the obvious choice for anyone who actually studies daily. A
user who exceeds the free allowance most days needs roughly 150–300 gems a month, which
is $5–10 in packs against $7.99 for unlimited. That is the intended shape: gems are a
top-up and a reward, not a cheaper substitute.

**Spend order matters**: consume the free daily allowance first, then gems, then show the
upsell. Spending someone's earned gems while they still had free hints left is the kind
of thing that gets you a chargeback and a bad review.

### One product concern worth raising

Metering **solutions** monetises giving up, and the moment a learner most needs the
explanation is right after they have struggled. Two adjustments that keep the revenue and
remove the perverse incentive:

1. **Always free after a correct solve.** Once someone passes the tests, show the
   reference solution and the write-up for nothing. They have earned it, it is the single
   highest-learning moment in the loop, and it costs you nothing to give away.
2. **Meter only the pre-solve reveal** — giving up and looking. That is the scarce thing,
   and gating it is defensible rather than annoying.

The gem-earning loop then reads coherently: solve it yourself, earn gems; give up, spend
them. Your call, but I would ship it this way.

---

## 6. Landing page

Replace the problem list at `/` with a real front page.

- **Hero**: logo, "Prepare. Perform.", one sentence on what it is, two buttons —
  *Start free* and *See the problems*.
- **Show the product immediately.** The stepper is the differentiator and no competitor
  has it. A short loop of stepping through two-sum with the variables changing will sell
  this better than any copy. Put it above the fold.
- **How it works**: pick your company → practise the round → step through what your code
  actually did.
- **Packs**: what is in the curated set; that generated problems target your company.
- **Pricing**: free vs $7.99, stated plainly, with the daily limits visible rather than
  buried.
- **FAQ**: is this the real interview questions (no — original problems teaching the same
  patterns), can I use it offline (the OSS local version), how do I cancel.
- Footer: Terms, Privacy, GitHub.

`/problems` stays browsable without an account — let people try one before signing up.
Requiring signup to see the product is the most common way to kill conversion.

---

## 7. Billing

**Stripe Checkout + Customer Portal.** Do not build a card form. Checkout keeps card data
entirely out of your infrastructure and reduces PCI scope to the simplest questionnaire.
The Portal gives you cancel, update card, and invoice history for free — all three of
which you would otherwise build and support.

- Subscription: recurring price, $7.99/mo.
- Gems: one-time Checkout in payment mode, one price per pack.
- **Entitlement is granted only by a signature-verified webhook**, never by the browser
  returning from Checkout. The success redirect is a UI hint, not proof of payment.
- Handle `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`.
- **Dedupe on Stripe event id** — webhooks are delivered at least once, so granting 500
  gems twice is a question of when, not if.
- Enable **Stripe Tax**; VAT on digital goods to EU customers is not optional.
- Decide what happens to gems on cancellation. Recommendation: purchased gems never
  expire. Anything else generates support load out of proportion to the revenue.

You will need a business identity for Stripe — sole trader is fine in most places, but it
needs to exist before you can take money.

---

## 8. Generated problems — the actual paid feature

This is what justifies the subscription, and we already have most of it.

Flow: user sets target company and role → we generate problems in the existing pack format
with Claude → **the generated problem is run through `verify` before the user ever sees
it** → it is saved to their private pack.

That verification step is the whole ballgame. LLM-generated problems fail in one specific
way: the reference solution does not actually satisfy the stated tests, or the expected
values are subtly wrong. We already have a harness that catches exactly that — it caught
four bad expected-values in the curated set. **Generate, verify, discard and retry on
failure, and never show an unverified problem.** That is a quality bar competitors
generating straight into a UI cannot match.

Cost control: generation is the main variable cost per user. Cap Pro at a fair-use number
(~40/month) and price the free-tier taste at 5 gems, which doubles as the conversion lever.

**Content and legal**: generate *original* problems that teach the patterns a company's
round is known to cover. Do not reproduce actual proprietary interview questions, and do
not imply endorsement by or affiliation with any company. Naming a company descriptively
("practice for a Federato-style round") is normal comparative use; a logo wall of
employers who have not agreed to anything is not.

---

## 9. Before launch

- Terms of Service, Privacy Policy, refund policy. Needed before taking money, not after.
- GDPR-shaped basics: export my data, delete my account, and actually delete it.
- Backups of Postgres, and one tested restore. Untested backups are not backups.
- Error tracking (Sentry) and uptime monitoring.
- A staging environment with Stripe in test mode.
- Rate limits on generation, or one user with a script becomes your largest cost centre.

---

## 10. Sequencing

Roughly, for one person working evenings and weekends:

| | Milestone | Estimate | Why this order |
|---|---|---|---|
| **M0** | ~~Pyodide spike~~ **done Aug 20** — see below | — | Everything else assumed it. It holds. |
| **M1** | Django skeleton, accounts, magic links, email | 1–1.5 weeks | Nothing is multi-user until this exists. |
| **M2** | Landing page + dashboard + settings | 1 week | Makes it feel like a product; needed for any real feedback. |
| **M3** | Entitlements, daily limits, gem ledger | 1 week | Server-authoritative from day one; retrofitting metering is painful. |
| **M4** | Stripe subscription + gem packs + webhooks | 1 week | Only after entitlements exist to grant. |
| **M5** | Generated problems with the verify gate | 1–2 weeks | The reason anyone pays. |
| **M6** | Legal, monitoring, backups, staging, launch | 1 week | |

**~7–9 weeks part-time.** The two estimates most likely to be wrong are M0 (WASM is
fiddly) and M5 (generation quality takes iteration).

A reasonable smaller first target: M0 + M1 + M2 with everything free and no billing.
That is a real, usable, multi-user product, and it will teach you more about what to
charge for than any amount of planning.

---

## 11. Open decisions

1. **Dual repo, hosted-only, or open core?** (recommend dual)
2. **Browser execution or a server sandbox?** (recommend browser — verified feasible)
3. **Django, or something else?** (recommend Django)
4. Domain name, and the sending domain for email.
5. Business entity for Stripe.
6. Do you want the "solution is free once you have solved it" change from §5?

---

## Timing

The interview is **Aug 24–25**. None of this should start before then. Planning is cheap
and does not compete with practice; building does. M0 is the right first move afterwards.
