import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { TraceDemo } from "@/components/TraceDemo";

export const metadata = {
  title: "Aptivus — Prepare. Perform.",
  description:
    "Interview practice with a step-through debugger built in. See what your code actually did, line by line, on the round you are actually sitting.",
};

const PATTERNS = [
  "hash map", "sliding window", "two pointers", "intervals", "binary search",
  "graph / BFS-DFS", "topological sort", "dynamic programming", "recursion",
  "window functions", "anti-joins", "fan-out",
];

export default async function Home() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  return (
    <div className="min-h-screen bg-[#0b0c0f] text-[#e6e8ec]">
      {/* ---------- nav ---------- */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0b0c0f]/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="" width={26} height={26} priority />
            <span className="text-[15px] font-semibold tracking-tight">Aptivus</span>
          </Link>
          <div className="hidden items-center gap-7 text-[13.5px] text-[#9aa1ad] md:flex">
            <a href="#debugger" className="transition hover:text-white">The debugger</a>
            <a href="#how" className="transition hover:text-white">How it works</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            {signedIn ? (
              <Link href="/dashboard" className="rounded-lg bg-white/[0.08] px-4 py-2 text-[13.5px] font-medium transition hover:bg-white/[0.14]">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/signin" className="text-[13.5px] text-[#9aa1ad] transition hover:text-white">
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] px-4 py-2 text-[13.5px] font-semibold text-[#0b0c0f] transition hover:brightness-110"
                >
                  Start free
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden px-5 pb-20 pt-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            background:
              "radial-gradient(56rem 34rem at 12% -12%, #00E5FF 0%, transparent 58%), radial-gradient(46rem 34rem at 92% 8%, #7C4DFF 0%, transparent 58%)",
          }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[12.5px] text-[#9aa1ad]">
            <span className="rounded-full bg-[#7C4DFF]/25 px-2 py-0.5 text-[11px] font-semibold text-[#c3aaff]">
              NEW
            </span>
            Step-through tracing runs entirely in your browser
          </p>
          <h1 className="text-[clamp(2.6rem,7vw,4.2rem)] font-bold leading-[1.05] tracking-[-0.03em]">
            Prepare.{" "}
            <span className="bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] bg-clip-text text-transparent">
              Perform.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-[16.5px] leading-relaxed text-[#9aa1ad]">
            Interview practice that shows you <em className="text-[#c8ccd4] not-italic">what your code actually did</em> —
            line by line, variable by variable — on the round you are actually sitting.
            Not a wall of 3,000 problems with no opinion.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={signedIn ? "/dashboard" : "/signup"}
              className="rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] px-6 py-3 text-[14.5px] font-semibold text-[#0b0c0f] transition hover:brightness-110"
            >
              {signedIn ? "Go to dashboard" : "Start free — no card"}
            </Link>
            <a
              href="#debugger"
              className="rounded-xl border border-white/12 bg-white/[0.04] px-6 py-3 text-[14.5px] font-medium transition hover:bg-white/[0.09]"
            >
              See the debugger
            </a>
          </div>
          <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[13px] text-[#7f8794]">
            <li>32 curated problems, every solution verified</li>
            <li>Python and SQL run in your tab</li>
            <li>Open source local version, forever free</li>
          </ul>
        </div>
      </section>

      {/* ---------- the differentiator ---------- */}
      <section id="debugger" className="scroll-mt-20 px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[#00E5FF]">
            The thing no competitor has
          </p>
          <h2 className="mx-auto mt-3 max-w-2xl text-center text-[clamp(1.8rem,4vw,2.6rem)] font-bold leading-tight tracking-[-0.02em]">
            A debugger inside the practice pad
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-[15.5px] leading-relaxed text-[#9aa1ad]">
            Every other site tells you the test failed. Aptivus lets you step through the run
            and watch the dictionary fill up, one key at a time — on your half-finished
            attempt, not the model answer.
          </p>
          <div className="mt-10">
            <TraceDemo />
          </div>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how" className="scroll-mt-20 border-t border-white/[0.06] px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-[clamp(1.6rem,3.4vw,2.2rem)] font-bold tracking-[-0.02em]">
            How it works
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                n: "01",
                t: "Pick your target",
                d: "Choose the company you are interviewing at. We hold researched profiles of what each one actually tests — the round shape, the patterns, the languages.",
              },
              {
                n: "02",
                t: "Practise the real round",
                d: "Part SQL, part algorithms, on a clock, in a pad that behaves like the one you will be sitting in. Hints when you need them, honestly rationed.",
              },
              {
                n: "03",
                t: "Step through what happened",
                d: "When a test fails, do not guess. Step the run, pin the variable that is wrong, and evaluate any expression at any step.",
              },
            ].map((c) => (
              <div key={c.n} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
                <span className="font-mono text-[12px] text-[#00E5FF]">{c.n}</span>
                <h3 className="mt-3 text-[16px] font-semibold">{c.t}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[#9aa1ad]">{c.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
            <h3 className="text-[14px] font-semibold text-[#c8ccd4]">Patterns covered</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {PATTERNS.map((p) => (
                <li key={p} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[12px] text-[#9aa1ad]">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- pricing ---------- */}
      <section id="pricing" className="scroll-mt-20 border-t border-white/[0.06] px-5 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-[clamp(1.6rem,3.4vw,2.2rem)] font-bold tracking-[-0.02em]">
            Pricing
          </h2>
          <p className="mt-3 text-center text-[14.5px] text-[#9aa1ad]">
            The limits are stated plainly, because finding them mid-practice is worse than knowing.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-7">
              <h3 className="text-[17px] font-semibold">Free</h3>
              <p className="mt-1 text-[13px] text-[#7f8794]">Everything you need to actually prepare.</p>
              <p className="mt-5 text-[30px] font-bold">£0</p>
              <ul className="mt-6 space-y-2.5 text-[13.5px] text-[#9aa1ad]">
                <li>All 32 curated problems</li>
                <li>Unlimited running, tracing and the expression console</li>
                <li>5 hints a day</li>
                <li>3 solutions a day</li>
                <li>Progress, streaks and achievements</li>
              </ul>
              <Link href="/signup" className="mt-7 block rounded-xl border border-white/12 bg-white/[0.05] py-2.5 text-center text-[14px] font-medium transition hover:bg-white/[0.1]">
                Start free
              </Link>
            </div>

            <div className="relative rounded-2xl border border-[#7C4DFF]/40 bg-gradient-to-b from-[#7C4DFF]/[0.09] to-transparent p-7">
              <span className="absolute right-6 top-6 rounded-full bg-[#7C4DFF]/25 px-2.5 py-1 text-[11px] font-semibold text-[#c3aaff]">
                Coming soon
              </span>
              <h3 className="text-[17px] font-semibold">Pro</h3>
              <p className="mt-1 text-[13px] text-[#7f8794]">For the fortnight before the interview.</p>
              <p className="mt-5 text-[30px] font-bold">
                $7.99<span className="text-[15px] font-normal text-[#7f8794]">/month</span>
              </p>
              <ul className="mt-6 space-y-2.5 text-[13.5px] text-[#9aa1ad]">
                <li>Everything in Free</li>
                <li>Unlimited hints and solutions</li>
                <li>Problems generated for your target company</li>
                <li>Full mock rounds with a scorecard</li>
              </ul>
              <button
                disabled
                className="mt-7 block w-full cursor-not-allowed rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-center text-[14px] font-medium text-[#7f8794]"
              >
                Not yet available
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="border-t border-white/[0.06] px-5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-[13px] text-[#7f8794] sm:flex-row">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="" width={20} height={20} />
            <span>Aptivus — Prepare. Perform.</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://github.com/Ray-Hughes/aptivus" className="transition hover:text-white" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link href="/signin" className="transition hover:text-white">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
