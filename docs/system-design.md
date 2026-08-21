# System design round - Tue Aug 25, 4:00-5:00pm ET

Interviewer: Sandeep Gonnabathula (Senior Software Engineer, Federato).
Stated focus: **workflow orchestration, distributed systems, event-driven architecture.**
You will diagram in HackerRank's whiteboard.

That topic list is not generic. It is a description of Federato's actual architecture
problem, and it tells you what they want to hear.

---

## What Federato actually does, in system terms

Federato sells "RiskOps" to P&C insurance carriers and MGAs. Strip the marketing and
the system is:

1. **Ingest** submissions from brokers (email, portal, API, spreadsheets) and enrich them
   with third-party data (property characteristics, CAT models, financials, sanctions).
2. **Run a workflow** per submission: intake -> clearance -> triage against appetite ->
   rating -> quote -> bind -> issue -> billing -> claims.
3. **Aggregate continuously** into portfolio views ("Control Tower"): appetite alignment,
   accumulation by CAT zone, exposure limits.
4. **Integrate** with each customer's existing policy admin, document, and rating systems.

A publicly reported system design question from their loop:

> *"Explain how you would handle high-volume data ingestion from external insurance data
> providers without degrading platform performance."*

Prepare that one cold. The workflow orchestration question is its sibling.

Known stack signals from their job postings: **Python, TypeScript/React, Node,
PostgreSQL, Kubernetes, Kafka**, ETL/data pipelines, AI/ML pipelines.
So: reference Kafka and Postgres naturally, do not propose an exotic stack.

---

## How to run the 60 minutes

| Time | Phase | What you do |
|---|---|---|
| 0-8 min | **Scope** | Ask questions. Write the requirements on the board. Do not draw yet. |
| 8-15 min | **Estimate + contract** | Scale numbers. Define the core entities and the API/event contract. |
| 15-40 min | **Draw the happy path** | One clean box-and-arrow diagram. Narrate the flow of one record end to end. |
| 40-52 min | **Break it** | Failure modes, retries, idempotency, backpressure, hot partitions. This is where senior candidates separate. |
| 52-60 min | **Trade-offs + close** | What you would build first, what you deliberately deferred, what you would monitor. |

**The single most common failure is drawing too early.** Spend the first eight minutes
asking questions. It costs you nothing and it is the strongest signal you send.

---

## The questions to actually ask

Pick 5-6, not all of them.

**Scale and shape**
- How many carriers are we serving, and how many submissions per day at peak?
- Is the load spiky? (Insurance is *brutally* seasonal - 1/1, 4/1, 7/1 renewal dates.
  Naming that shows domain fluency.)
- What is the payload size? A submission with a 50k-location schedule of values is a
  very different problem from a one-line quote request.

**Latency and consistency**
- Is enrichment synchronous (underwriter is waiting) or can it be async?
- What is acceptable staleness for portfolio aggregates? Seconds, or minutes?
- Do we need read-after-write consistency for the underwriter who just edited a submission?

**Failure semantics**
- If a third-party data provider is down, do we block the submission or proceed degraded?
- Is duplicate processing acceptable, or must it be exactly-once as observed?

**Multi-tenancy** (ask this - it is the Forward Deployed Engineer question)
- Shared infrastructure with tenant isolation, or per-tenant deployments?
- Can one carrier's bulk backfill degrade another carrier's interactive experience?

---

## Design 1: High-volume ingestion from external data providers

This is the one most likely to be asked. Learn this diagram.

```
                                   +-----------------------+
 brokers  --email/SFTP/API-->      |   Ingest API / Gateway|
 carriers                          |  authn, validate,     |
                                   |  dedupe by idem key   |
                                   +-----------+-----------+
                                               |
                                     write raw payload
                                               v
                                   +-----------------------+
                                   |  Raw landing store    |  (S3/GCS, immutable)
                                   |  + Postgres metadata  |
                                   +-----------+-----------+
                                               |
                                        emit event
                                               v
                        +======================================+
                        |   Kafka: submission.received         |
                        |   (partition key = tenant+submission)|
                        +==============+=======================+
                                       |
             +-------------------------+--------------------------+
             v                         v                          v
      +-------------+          +--------------+           +--------------+
      | Parse /     |          | Enrich:      |           | Enrich:      |
      | normalize   |          | property data|           | CAT model    |
      +------+------+          +------+-------+           +------+-------+
             |                        |                          |
             |     (each: retry w/ backoff, circuit breaker,      |
             |      cache by (provider, key), DLQ on give-up)     |
             +------------------------+--------------------------+
                                      v
                        +======================================+
                        |   Kafka: submission.enriched         |
                        +==============+=======================+
                                       |
                    +------------------+------------------+
                    v                                     v
          +-------------------+                 +--------------------+
          | Canonical store   |                 | Aggregation /      |
          | Postgres (OLTP)   |                 | portfolio rollups  |
          | serves the app    |                 | (materialized)     |
          +-------------------+                 +--------------------+
```

**The narrative that makes it good** (say this, do not just draw it):

1. **Accept fast, process later.** The ingest endpoint does authentication, cheap schema
   validation, an idempotency check, and a durable write. Then it returns 202. It does
   *not* call a third-party API inline. That one decision is what stops external
   providers from degrading your platform - which is literally what the question asks.

2. **Keep the raw payload immutably.** When a carrier says "you dropped my submission",
   you need the bytes they sent. Also lets you reprocess after a parser bug without
   asking them to resend. This is the Forward Deployed Engineer's favorite design
   decision and you should say why.

3. **Enrichment is where the blast radius lives.** Third-party insurance data providers
   are slow, rate-limited, and unreliable. So per provider:
   - **Bulkhead**: its own worker pool / consumer group, so a slow provider cannot
     starve the others.
   - **Circuit breaker**: after N consecutive failures, stop calling, serve degraded,
     retry on a timer.
   - **Cache** on `(provider, natural key)` - the same property gets looked up repeatedly.
   - **Retry with exponential backoff and jitter**; a fixed delay creates a thundering herd.
   - **Dead letter queue** after the retry budget, with an operator-visible replay path.

4. **Backpressure, not unbounded buffering.** Kafka is the buffer; consumer lag is the
   backpressure signal. If lag grows past a threshold you scale consumers, and if you
   cannot, you shed *low priority* work (a bulk historical backfill) before interactive
   work. Say explicitly: "I would rather delay a backfill than delay an underwriter."

5. **Isolate tenants.** Partition key includes the tenant. A carrier dumping 2 million
   historical records must not stall another carrier's live submissions - separate
   topics or priority lanes for bulk versus interactive.

### Scale estimate to have ready

Say a large carrier does 50,000 submissions/day, and you serve 20 carriers:
- 1M submissions/day ~ 12/sec average, but insurance is seasonal and renewal-date driven,
  so assume **20-50x peak: ~500/sec**.
- Each submission triggers ~5 enrichment calls -> 2,500 external calls/sec at peak,
  against providers that rate limit you at maybe 50/sec.
- **That gap is the whole design.** It is why the queue exists, why you cache, and why
  bulk work gets a slower lane. Say that number out loud; it justifies every choice.
- Payload ~50KB average, some schedules 100MB+ -> keep blobs in object storage and
  pass references through Kafka, never the payload itself (Kafka messages should be
  small; 1MB default max).

---

## Design 2: Workflow orchestration for underwriting

The second likely question. The submission lifecycle is a long-running,
human-in-the-loop, multi-step process:

```
intake -> clearance -> appetite triage -> enrich -> rate -> quote
       -> referral (human) -> bind -> issue -> billing
```

Properties that make this hard:
- Steps take **milliseconds to weeks** (an underwriter referral may sit for days).
- Steps are **heterogeneous**: some automated, some human, some third-party.
- It must **survive deploys and crashes**. You cannot lose a submission because a pod restarted.
- It needs **auditability**: regulators and carriers ask "why was this declined?"
- Steps have **dependencies** - and that is a DAG, which is exactly the topological
  sort you solved in `py_10`. Make that connection out loud if it fits.

### The three approaches, and how to compare them

| Approach | How | Good | Bad |
|---|---|---|---|
| **Choreography** (pure events) | Each service listens for events, emits the next | Loosely coupled, easy to add a consumer | No one knows the overall state; debugging is archaeology; hard to answer "where is this submission stuck?" |
| **Orchestration** (central engine) | A workflow service drives each step | State is explicit and queryable; retries and timeouts centralized; auditable | The engine is a critical dependency; risk of a god-service |
| **Durable execution** (Temporal, Step Functions, Cadence) | Workflow written as code; engine persists every step's result | Survives crashes and deploys; retries/timeouts/compensation built in; the code IS the diagram | Operational weight; another system to run; learning curve |

**Recommend orchestration, most likely via a durable execution engine, and say why:**
the differentiator is that you can always answer "where is submission X and why", which
is the number one question a carrier asks. Then note the cost honestly.

### The pieces to draw

- **Workflow definition** - a versioned DAG per carrier, because every carrier's
  underwriting process differs. *(This is the Forward Deployed Engineer's real problem:
  it must be configuration, not a code fork per customer. Say that.)*
- **Workflow state store** - Postgres. `workflow_instance`, `step_execution` with
  status, attempt count, input/output, timestamps.
- **Task queue + workers** - workers claim tasks, execute activities, report results.
- **Timers/durable sleeps** - "escalate if not reviewed in 48 hours."
- **Event log** - every transition appended. This is your audit trail *and* your
  debugging tool. Immutable.
- **Compensation / saga** - bind failed after the policy number was reserved? You need
  a defined undo per step. Distributed transactions do not exist; sagas are how you cope.

### Say these words

- **Idempotency**: every step keyed so a retry is safe. At-least-once delivery is what
  you actually get; idempotent consumers are how you turn it into effectively-once.
- **The outbox pattern**: writing to Postgres and publishing to Kafka is not atomic.
  Write the event to an `outbox` table **in the same transaction** as the state change,
  then a relay (or CDC via Debezium) publishes it. Otherwise you eventually get a state
  change with no event, or an event for a rolled-back change. **This is the single best
  thing you can say in an event-driven design interview.**
- **Ordering**: Kafka guarantees order only within a partition. Key by submission id so
  one submission's events stay ordered, and accept that global ordering is not a thing.

---

## Design 3: Real-time portfolio accumulation (the Control Tower)

If they push toward the analytics side:

The problem: an underwriter needs to know *before binding* whether this risk pushes the
portfolio past an accumulation limit in a CAT zone. That is an aggregate over millions
of policies, needed in interactive time.

- **Do not compute on read** across the whole book. Maintain **incremental aggregates**
  updated from the `policy.bound` event stream, keyed by (tenant, cat_zone, line, period).
- Serve from a **materialized aggregate table** in Postgres, or a pre-aggregated store.
- **Lambda-ish reconciliation**: the streaming path gives you fresh-but-approximate;
  a nightly batch recomputes from the source of truth and corrects drift. Streaming
  aggregates drift - acknowledging that is the senior move.
- For "what if I bind this?" - compute the delta against the cached aggregate, do not
  recompute the base.
- Watch for **hot keys**: one CAT zone in Florida gets vastly more traffic than Idaho.

---

## Failure modes to raise unprompted

Have three of these ready. Raising them before being asked is the difference between
mid and senior.

- **Duplicate events.** At-least-once means you *will* process twice. Idempotency keys,
  a processed-message table, or naturally idempotent operations.
- **Poison messages.** One malformed payload blocks a partition forever. Retry budget,
  then DLQ, then alert - never infinite retry in place.
- **Slow consumer / lag.** Monitor consumer lag as a first-class SLI. It is the early
  warning for everything.
- **Schema evolution.** A broker adds a field, a provider changes a type. Schema registry
  with compatibility rules; tolerant readers; version the events.
- **Thundering herd on recovery.** Provider comes back up and 400k queued calls hit it at
  once. Rate limit your own egress; jitter your retries.
- **Split brain on deploys.** Two versions of a workflow running concurrently. Version
  workflow definitions; in-flight instances finish on the version they started with.
- **The customer's system is the bottleneck.** Their on-prem policy admin does 5 req/sec
  and they will not upgrade it. You cannot fix that - you design around it with queueing
  and honest SLAs. *(Very FDE. Say it.)*

---

## Diagramming on HackerRank's whiteboard

The tool is basic. Plan for that.

- **Practice once before Tuesday.** Open https://hr.gs/sampleint, click the Whiteboard
  tab, and draw a five-box pipeline. Find the shape, text, arrow, and undo controls.
  Do not learn the UI while being evaluated.
- **Boxes and labeled arrows only.** No colors, no icons, no beauty.
- **Left to right, request flow on top, data stores below.** Consistent layout beats
  detailed layout.
- **Label the arrows** with what flows: `submission.received`, `HTTP 202`, `enriched payload`.
  Unlabelled arrows are where designs become vague.
- **Leave room.** Start the first box far left. You will add things.
- **Narrate while you draw.** Silence while drawing is dead air. "I'm putting the queue
  here because I want the ingest endpoint to return before we call any third party."

---

## Closing the round well

When they ask "anything else" or you have ~5 minutes left:

1. **What you would build first.** "Week one I would ship the ingest endpoint, raw
   landing store, and one enrichment provider end to end, because that proves the
   contract with the customer's data. Everything else is elaboration."
2. **What you deliberately did not build.** "I did not add a schema registry today;
   at two providers it is overhead, at twenty it is essential."
3. **What you would monitor.** Consumer lag, DLQ depth, enrichment provider error rate
   and p99 latency, end-to-end submission age. "If I could have one dashboard it would
   be the age of the oldest unprocessed submission per tenant."
4. **The customer angle** - you are interviewing for Forward Deployed Engineer:
   "In a deployment the risk is not usually the architecture, it is that the carrier's
   data does not look like their documentation said it would. So I would want the raw
   store and a reconciliation report from day one."

That last point is the one an FDE hiring manager remembers.
