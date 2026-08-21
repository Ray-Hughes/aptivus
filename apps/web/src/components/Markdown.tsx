import { Fragment, type ReactNode } from "react";

/**
 * The markdown our own content actually uses: headings, fenced code, bullets,
 * numbered lists, tables, block quotes, inline code, bold and italic.
 * Deliberately not a full parser - the content is ours, and a dependency here
 * would be all cost.
 *
 * Two variants:
 *
 * - `compact` (the default) is the problem-prompt look the workbench uses:
 *   small type, tight leading, headings as blue eyebrows.
 * - `prose` is for the course teaching, which is long-form writing rather than
 *   a spec. Bigger type, real heading hierarchy, and generous leading. Set the
 *   measure on the container - around 68-72 characters - and let the tables and
 *   code blocks scroll inside it rather than widening the text.
 */
export type MarkdownVariant = "compact" | "prose";

/* ------------------------------------------------------------------ */
/* inline                                                              */
/* ------------------------------------------------------------------ */

/**
 * A tiny scanner rather than a split, because emphasis nests: the teaching is
 * full of things like *is it `.length` or `len()`*, and splitting on code spans
 * first tears the italic delimiters into different pieces.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = "";
  let i = 0;
  let k = 0;

  const flush = () => {
    if (buf) out.push(<Fragment key={`${keyBase}-t${k++}`}>{buf}</Fragment>);
    buf = "";
  };

  while (i < text.length) {
    const rest = text.slice(i);

    if (rest[0] === "`") {
      const end = rest.indexOf("`", 1);
      if (end > 1) {
        flush();
        out.push(
          <code
            key={`${keyBase}-c${k++}`}
            className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.9em] text-[#9ecbff]"
          >
            {rest.slice(1, end)}
          </code>,
        );
        i += end + 1;
        continue;
      }
    }

    if (rest.startsWith("**")) {
      const end = rest.indexOf("**", 2);
      if (end > 2) {
        flush();
        out.push(
          <strong key={`${keyBase}-b${k++}`} className="font-semibold text-white">
            {inline(rest.slice(2, end), `${keyBase}-b${k}`)}
          </strong>,
        );
        i += end + 2;
        continue;
      }
    }

    // A single star opens emphasis only when it is followed by a non-space, so
    // arithmetic like `a * b` in prose stays arithmetic.
    if (rest[0] === "*" && rest[1] && !/\s/.test(rest[1])) {
      const end = rest.indexOf("*", 1);
      if (end > 1) {
        flush();
        out.push(
          <em key={`${keyBase}-i${k++}`} className="italic text-[#d7dbe3]">
            {inline(rest.slice(1, end), `${keyBase}-i${k}`)}
          </em>,
        );
        i += end + 1;
        continue;
      }
    }

    buf += text[i];
    i++;
  }
  flush();
  return out;
}

/* ------------------------------------------------------------------ */
/* block styles                                                        */
/* ------------------------------------------------------------------ */

type Styles = {
  p: string;
  ul: string;
  ol: string;
  li: string;
  pre: string;
  quote: string;
  heading: (level: number) => string;
  headingTag: (level: number) => "h2" | "h3" | "h4";
  table: string;
  th: string;
  td: string;
};

const COMPACT: Styles = {
  p: "my-2.5 leading-relaxed",
  ul: "my-2.5 list-disc space-y-1 pl-5",
  ol: "my-2.5 list-decimal space-y-1 pl-5",
  li: "",
  pre: "my-3 overflow-x-auto rounded-lg border border-white/[0.08] bg-[#0b0c0f] p-3 font-mono text-[12px] leading-relaxed text-[#c8ccd4]",
  quote: "my-3 border-l-2 border-[#4aa3ff]/50 pl-3 text-[#9aa1ad]",
  heading: () =>
    "mb-1.5 mt-5 text-[13.5px] font-semibold uppercase tracking-[0.08em] text-[#4aa3ff]",
  headingTag: () => "h3",
  table: "my-3 w-full border-collapse text-left text-[12.5px]",
  th: "border-b border-white/[0.12] px-2.5 py-1.5 font-semibold text-white",
  td: "border-b border-white/[0.05] px-2.5 py-1.5 align-top text-[#c8ccd4]",
};

const PROSE: Styles = {
  p: "my-4 text-[16px] leading-[1.75] text-[#c8ccd4]",
  ul: "my-4 list-disc space-y-2.5 pl-6 text-[16px] leading-[1.7] text-[#c8ccd4] marker:text-[#6b727e]",
  ol: "my-4 list-decimal space-y-2.5 pl-6 text-[16px] leading-[1.7] text-[#c8ccd4] marker:text-[#6b727e]",
  li: "pl-1",
  pre: "my-6 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#08090c] p-4 font-mono text-[13px] leading-[1.65] text-[#c8ccd4]",
  quote:
    "my-5 rounded-r-lg border-l-2 border-[#00E5FF]/60 bg-white/[0.02] py-2 pl-4 pr-3 text-[15.5px] italic leading-[1.7] text-[#aeb5c0]",
  heading: (level) =>
    level <= 2
      ? "mb-3 mt-10 text-[21px] font-semibold leading-snug tracking-tight text-white first:mt-0"
      : level === 3
        ? "mb-2 mt-8 text-[16.5px] font-semibold leading-snug text-white"
        : "mb-1.5 mt-6 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#9aa1ad]",
  headingTag: (level) => (level <= 2 ? "h2" : level === 3 ? "h3" : "h4"),
  table: "w-full border-collapse text-left text-[14px]",
  th: "whitespace-nowrap border-b border-white/[0.14] px-3 py-2 font-semibold text-white",
  td: "border-b border-white/[0.06] px-3 py-2 align-top leading-[1.6] text-[#c8ccd4]",
};

const cells = (line: string) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

const isTableRow = (line: string) => /^\s*\|/.test(line);
const isTableRule = (line: string) => /^\s*\|[\s:|-]+\|?\s*$/.test(line) && line.includes("-");

/* ------------------------------------------------------------------ */
/* blocks                                                              */
/* ------------------------------------------------------------------ */

export function Markdown({
  source,
  className = "",
  variant = "compact",
}: {
  source: string;
  className?: string;
  variant?: MarkdownVariant;
}) {
  const s = variant === "prose" ? PROSE : COMPACT;
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  let para: string[] = [];
  let quote: string[] = [];
  let list: string[] = [];
  let listOrdered = false;
  let k = 0;

  const flushPara = () => {
    if (!para.length) return;
    blocks.push(
      <p key={`p${k++}`} className={s.p}>
        {inline(para.join(" "), `p${k}`)}
      </p>,
    );
    para = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    blocks.push(
      <blockquote key={`q${k++}`} className={s.quote}>
        {inline(quote.join(" "), `q${k}`)}
      </blockquote>,
    );
    quote = [];
  };
  const flushList = () => {
    if (!list.length) return;
    const items = list.map((li, i) => (
      <li key={i} className={s.li}>
        {inline(li, `li${k}-${i}`)}
      </li>
    ));
    blocks.push(
      listOrdered ? (
        <ol key={`o${k++}`} className={s.ol}>{items}</ol>
      ) : (
        <ul key={`u${k++}`} className={s.ul}>{items}</ul>
      ),
    );
    list = [];
  };
  const flushAll = () => {
    flushPara();
    flushQuote();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const trimmed = line.trimStart();

    /* fenced code -------------------------------------------------- */
    if (trimmed.startsWith("```")) {
      flushAll();
      const lang = trimmed.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        body.push(lines[i]);
        i++;
      }
      blocks.push(
        <pre key={`c${k++}`} className={s.pre} data-lang={lang || undefined}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    /* table --------------------------------------------------------- */
    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      flushAll();
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(cells(lines[i]));
        i++;
      }
      i--;
      blocks.push(
        // Wide tables scroll inside the measure rather than widening the text.
        <div key={`tw${k++}`} className="my-5 overflow-x-auto rounded-xl border border-white/[0.07]">
          <table className={s.table}>
            <thead>
              <tr>
                {head.map((c, ci) => (
                  <th key={ci} scope="col" className={s.th}>
                    {inline(c, `th${k}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className={s.td}>
                      {inline(c, `td${k}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    /* heading ------------------------------------------------------- */
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const cls = s.heading(level);
      const key = `h${k++}`;
      const body = inline(heading[2], `h${k}`);
      // Spelled out rather than `<Tag>`: a component built during render is a
      // new type on every pass, which throws away the subtree's state.
      blocks.push(
        s.headingTag(level) === "h2" ? (
          <h2 key={key} className={cls}>{body}</h2>
        ) : s.headingTag(level) === "h3" ? (
          <h3 key={key} className={cls}>{body}</h3>
        ) : (
          <h4 key={key} className={cls}>{body}</h4>
        ),
      );
      continue;
    }

    /* block quote --------------------------------------------------- */
    if (/^>\s?/.test(trimmed)) {
      flushPara();
      flushList();
      quote.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }

    /* lists --------------------------------------------------------- */
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      flushQuote();
      const ordered = !!numbered;
      if (list.length && ordered !== listOrdered) flushList();
      listOrdered = ordered;
      list.push((bullet ?? numbered)![1]);
      continue;
    }

    /* blank line ---------------------------------------------------- */
    if (!line.trim()) {
      flushAll();
      continue;
    }

    // An indented continuation belongs to the item above it. Without this every
    // wrapped list item breaks out into a stray paragraph, which is exactly how
    // long-form content renders wrong.
    if (list.length && /^\s+/.test(line)) {
      list[list.length - 1] += ` ${trimmed}`;
      continue;
    }
    if (quote.length) {
      quote.push(trimmed);
      continue;
    }

    flushList();
    para.push(trimmed);
  }
  flushAll();

  return <div className={className}>{blocks}</div>;
}
