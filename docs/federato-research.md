# Federato: what the research turned up

Compiled Aug 19, 2026. Sources at the bottom. Glassdoor and Fishbowl both block
automated fetching, so their detail below comes from search-result summaries rather
than full pages - treat those specific claims as second-hand.

---

## The company

- **Product:** "RiskOps" - an AI-native platform for P&C insurance underwriting and
  portfolio management. Unifies submission intake, pricing, documentation, quoting,
  referral, bind, billing and claims into one workflow.
- **The pitch:** carriers run 9+ disconnected legacy systems; underwriters drift from
  the portfolio strategy leadership set. Federato closes that loop with real-time
  appetite/winnability/accumulation signals plus a "Control Tower" portfolio view.
- **Claimed outcomes:** ~90% improvement in time-to-quote, 3x more good business bound,
  50-90% reduction in systems used, 2x submissions processed per day.
- **Funding:** $15M Series A (2022), then $80M announced Nov 2024.
- **HQ:** Palo Alto, CA. Customers include QBE North America (as a unified core system
  for the full policy lifecycle).
- **Notable:** federated data architecture pulling internal + external sources;
  agentic AI generating explained quotes; a forms engine and rate/quote interface;
  a broker/agent partner portal; compliance guardrails.

## The stack (from job postings)

**Python, TypeScript, React, Node.js, PostgreSQL**, containerized on **Kubernetes**,
**Kafka** for event-driven work, ETL/data pipelines, and ML/prompt-engineering pipelines.
There is no public engineering blog - this is assembled from listings.

For your rounds: use Python, reference Postgres and Kafka naturally, do not propose
an exotic stack.

## The role

Senior Forward Deployed Engineer, $160k-$200k plus equity. From the live posting:

- Drive planning, scoping and delivery of complex customer implementations
- Serve as technical escalation for integration issues; debug deep technical problems
- Lead discovery calls; translate requirements into scoped work
- Recommend architectural improvements based on what deployments reveal
- Feed product/roadmap prioritization; own delivery playbooks and onboarding
- **"This role will be heavily hands-on with coding, including writing and debugging
  production and integration code"**
- Languages named: **Python, JavaScript, SQL**
- 6-8+ years engineering / systems / technical program management

One reported candidate account says a TPM described the role as **70-80% customer-facing**
(communication and collaboration) - and also noted some inconsistency between
interviewers about how the role is framed. Worth being ready for both framings: be the
engineer who can obviously code, *and* the person a carrier trusts in a room.

## The interview loop

Reported full loop: HR call -> behavioral with TPM -> technical with an engineer ->
behavioral with the Director of FDE -> meeting with a co-founder. About 2 weeks.
Candidates rate overall difficulty ~2.8/5. Reported content: **SQL questions, LeetCode
questions, and thought-provoking behavioral questions.**

Your two scheduled rounds:

1. **45 min coding** - part SQL, part data structures/algorithms. Any language. HackerRank.
   No AI permitted.
2. **60 min system design** - workflow orchestration, distributed systems, event-driven
   architecture. Diagram in HackerRank's whiteboard.

**One reported system design question, verbatim:**
> "Explain how you would handle high-volume data ingestion from external insurance data
> providers without degrading platform performance."

Reported system design themes: API design (REST/GraphQL contracts supporting complex
frontend operations), data modeling for high-write/high-read workloads, scalability
(concurrency, caching, background job processing).

## Reading the signal for an FDE round

Industry write-ups on Forward Deployed Engineer interviews (Palantir, OpenAI, Anthropic
and similar) consistently say the technical round leans toward **practical work -
debugging an integration, writing SQL, sketching a data pipeline - rather than pure
LeetCode puzzles**, and that candidates over-index on algorithm grinding and
under-prepare the ambiguous case-study and communication dimensions.

Federato's own framing ("part SQL + part data structures/algo") means you do need the
algorithms. But it also means:

- **The SQL half is not filler.** Prepare it as seriously as the algorithms.
- **Domain-shaped problems are likely.** The problem pack here is deliberately written
  in insurance vocabulary - submissions, quotes, appetite, accumulation, loss ratio -
  so the words are familiar if they show up.
- **Narrating and asking clarifying questions is scored**, not tolerated. For a role
  that is majority customer-facing, how you reason out loud IS the assessment.

## Your interviewers

- **Taimur Hasan** - Forward Deployed Engineer at Federato, Toronto. Background mixes
  finance and engineering: Full Stack Software Engineer at Manulife on the insurance
  team (advisor/customer tools for managing policies and investments), and earlier
  financial analysis roles at PepsiCo and General Mills.
  **Read:** he knows insurance domain language and has built customer-facing insurance
  tooling. Domain vocabulary will land with him. He is an FDE, so he is assessing
  "would I put this person in front of a carrier."
- **Sandeep / "Sunny" Gonnabathula** - Senior Software Engineer at Federato, Austin TX.
  Previously Near Space Labs (formerly Swiftera), Descartes Labs, Hack Reactor.
  JavaScript, Node, Python. *(Search surfaced "Sunny Gonnabathula" at Federato and
  "Sandeep" on your calendar invite - likely the same person, Sunny being a nickname.
  Do not assume; just use whatever name they introduce themselves with.)*
  **Read:** geospatial/satellite imagery background means real experience with
  high-volume data pipelines. Your ingestion design should be honest and specific,
  not hand-wavy - he has actually built this.

---

## Sources

- [Federato - AI-Native Insurance Platform](https://www.federato.ai/)
- [Senior Forward Deployed Engineer job posting](https://job-boards.greenhouse.io/federato/jobs/5375752008)
- [Forward Deployed Engineer II job posting](https://job-boards.greenhouse.io/federato/jobs/5019876008)
- [Federato Interview Questions - Glassdoor](https://www.glassdoor.com/Interview/Federato-Interview-Questions-E6809618.htm) (403 to automated fetch; summarized from search results)
- [Federato FDE Interview Questions - Glassdoor](https://www.glassdoor.com/Interview/Federato-Forward-Deployed-Engineer-Interview-Questions-EI_IE6809618.0,8_KO9,34.htm) (403)
- [Federato Software Engineer Interview Guide - Dataford](https://dataford.io/interview-guides/federato/software-engineer)
- [Federato $80M raise announcement](https://www.prnewswire.com/news-releases/federato-announces-80-million-raised-to-bring-riskops-to-insurance-302311553.html)
- [Federato $15M Series A announcement](https://www.prnewswire.com/news-releases/federato-first-solution-to-unify-insurance-underwriting-and-portfolio-management-announces-15m-series-a-investment-301626692.html)
- [Federato - Crunchbase](https://www.crunchbase.com/organization/federato)
- [Staff Full-Stack Engineer - Built In SF](https://www.builtinsf.com/job/staff-full-stack-engineer/6346317) (stack details)
- [FDE Interview Questions Guide - fde.academy](https://fde.academy/blog/forward-deployed-engineer-interview-questions)
- [Forward Deployed Engineer Interview Guide - Exponent](https://www.tryexponent.com/blog/forward-deployed-engineer-interview-the-definitive-2026-guide-fde)
- [FDE Interview Questions 2026 - Perspective AI](https://getperspective.ai/blog/forward-deployed-engineer-interview-questions-2026-prep-guide)
- [Taimur Hasan - LinkedIn](https://www.linkedin.com/in/taimur-h/)
- [Sunny Gonnabathula - LinkedIn](https://www.linkedin.com/in/sunnygonna/)
