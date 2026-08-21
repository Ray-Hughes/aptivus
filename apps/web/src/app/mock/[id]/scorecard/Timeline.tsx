/**
 * "Where the time actually went" — one chart, not a pie.
 *
 * Problem bands along the top, the activity bar underneath, a marker for every
 * run, solve and stop, a dashed halfway line, a danger line at the round length
 * and a hatched overtime tail. One picture that answers *what you were doing*,
 * *which problem*, *in what order* and *how close to the wire* at the same time.
 *
 * Four **textures** rather than four hues — diagonal stripes for reading, solid
 * for writing, dots for debugging, faint dots for idle — so it survives the
 * same colour-blindness rule as the rest of the product. It is also the same
 * encoding as the in-round clock bar, at a higher resolution: you learn to read
 * one by using the other.
 *
 * Rendered on the server. No script, no hydration, nothing to go wrong.
 */
import { ACTIVITY_LABEL, dur, mmss, type Summary } from "@/lib/mock-scorecard";

const W = 940;
const H = 156;
const PROBLEM_COLOR = ["#00E5FF", "#9E7BFF"];

const FILL: Record<string, string> = {
  read: "url(#tlRead)",
  write: "#00E5FF",
  debug: "url(#tlDebug)",
  idle: "url(#tlIdle)",
};
const OPACITY: Record<string, number> = { read: 1, write: 0.82, debug: 1, idle: 1 };

/** Left to right, lifting alternate markers when they crowd each other. */
function layoutMarkers(S: Summary, x: (t: number) => number) {
  let lastX = -999;
  let lift = 0;
  return S.events
    .filter((e) => e.k !== "switch")
    .map((e, i) => {
      const cx = x(e.at);
      if (cx - lastX < 26) lift = lift ? 0 : 20;
      else lift = 0;
      lastX = cx;
      const passed = e.k === "solved" || (e.pass !== undefined && e.pass === e.total);
      const color = e.k === "stopped" ? "#9E7BFF" : passed ? "#39c06c" : "#e6b455";
      const label =
        e.k === "solved" ? `Solved problem ${e.p + 1} at ${mmss(e.at)}`
          : e.k === "stopped" ? `Stopped problem ${e.p + 1} at ${mmss(e.at)}`
            : e.k === "done" ? `Marked problem ${e.p + 1} done at ${mmss(e.at)}`
              : e.pass !== undefined
                ? `Run at ${mmss(e.at)} · ${e.pass} of ${e.total} checks · problem ${e.p + 1}`
                : `Run at ${mmss(e.at)} · problem ${e.p + 1}`;
      return { key: `${i}-${e.at}-${e.k}`, cx, y: 40 - lift, color, label, kind: e.k, passed };
    });
}

export function Timeline({ S }: { S: Summary }) {
  const tmax = Math.max(S.len, S.total, 1);
  const x = (t: number) => (t / tmax) * W;
  const step = tmax > 3000 ? 600 : 300;
  const axis: number[] = [];
  for (let t = 0; t <= tmax; t += step) axis.push(t);

  const markers = layoutMarkers(S, x);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Timeline of the round: ${mmss(S.total)} across ${S.P.length} problems.`}
        /* Scales with the column, but never below the width the labels need —
           at which point the wrapper scrolls rather than the page. */
        className="block w-full min-w-[640px]"
      >
        <defs>
          <pattern id="tlRead" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="#9E7BFF" opacity=".18" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="#9E7BFF" strokeWidth="3" opacity=".8" />
          </pattern>
          <pattern id="tlDebug" width="7" height="7" patternUnits="userSpaceOnUse">
            <rect width="7" height="7" fill="#e6b455" opacity=".16" />
            <circle cx="3.5" cy="3.5" r="1.6" fill="#e6b455" />
          </pattern>
          <pattern id="tlIdle" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#6f747c" opacity=".08" />
            <circle cx="3" cy="3" r="1" fill="#6f747c" opacity=".7" />
          </pattern>
          <pattern id="tlOver" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#ec5b5b" opacity=".1" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#ec5b5b" strokeWidth="2.5" opacity=".55" />
          </pattern>
        </defs>

        {S.over > 0 && <rect x={x(S.len)} y={6} width={W - x(S.len)} height={116} fill="url(#tlOver)" />}

        {/* which problem, when */}
        {S.runsMerged.map((r, i) => (
          <g key={`band-${i}`}>
            <rect x={x(r.at)} y={6} width={Math.max(1, x(r.d))} height={18} rx={4}
                  fill={PROBLEM_COLOR[r.p % 2]} opacity={0.22} />
            {x(r.d) > 110 && (
              <text x={x(r.at) + 9} y={19} fontSize="10.5" fill="#c8ccd4">
                Problem {r.p + 1} · {mmss(r.d)}
              </text>
            )}
          </g>
        ))}

        {/* what you were doing */}
        {S.laid.map((b, i) => (
          <rect key={`act-${i}`} x={x(b.at)} y={58} width={Math.max(0.7, x(b.d))} height={44}
                fill={FILL[b.a]} opacity={OPACITY[b.a]}>
            <title>{`${ACTIVITY_LABEL[b.a]} · ${dur(b.d)} · problem ${b.p + 1} · from ${mmss(b.at)}`}</title>
          </rect>
        ))}
        {S.runsMerged.slice(1).map((r, i) => (
          <line key={`sw-${i}`} x1={x(r.at)} y1={56} x2={x(r.at)} y2={104} stroke="#0b0c0f" strokeWidth={2} />
        ))}
        <rect x={0} y={58} width={W} height={44} rx={6} fill="none" stroke="#24262b" />

        {/* every run, solve and stop */}
        {markers.map((m) => (
          <g key={m.key}>
            <line x1={m.cx} y1={m.y + 10} x2={m.cx} y2={58} stroke={m.color} strokeWidth={1.5} opacity={0.65} />
            <circle cx={m.cx} cy={m.y} r={7.5} fill="#0b0c0f" stroke={m.color} strokeWidth={1.6} />
            {m.kind === "stopped" ? (
              <rect x={m.cx - 2.6} y={m.y - 2.6} width={5.2} height={5.2} rx={1} fill={m.color} />
            ) : m.passed ? (
              <path d={`M${m.cx - 3.4} ${m.y} l2.4 2.4 l4.4 -4.8`} fill="none" stroke={m.color}
                    strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d={`M${m.cx} ${m.y - 3.4} v3.6 M${m.cx} ${m.y + 2.6} v.6`} fill="none" stroke={m.color}
                    strokeWidth={1.9} strokeLinecap="round" />
            )}
            <title>{m.label}</title>
          </g>
        ))}

        {/* the clock underneath it */}
        {axis.map((t) => (
          Math.abs(x(t) - x(S.len)) < 34 ? null : (
            <g key={`ax-${t}`}>
              <line x1={x(t)} y1={104} x2={x(t)} y2={110} stroke="#3a3d42" />
              <text x={x(t)} y={124} fontSize="10" fill="#6f747c" textAnchor={t === 0 ? "start" : "middle"}>
                {mmss(t)}
              </text>
            </g>
          )
        ))}
        <line x1={0} y1={110} x2={W} y2={110} stroke="#24262b" />
        <line x1={x(S.len / 2)} y1={52} x2={x(S.len / 2)} y2={108} stroke="#6f747c" strokeDasharray="3 3" opacity={0.6} />
        <text x={x(S.len / 2) + 6} y={141} fontSize="10" fill="#6f747c">halfway</text>
        <line x1={x(S.len)} y1={30} x2={x(S.len)} y2={108} stroke="#ec5b5b" strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={x(S.len) - 7} y={141} fontSize="10" fill="#ec5b5b" textAnchor="end">{mmss(S.len)} — time</text>
      </svg>
    </div>
  );
}
