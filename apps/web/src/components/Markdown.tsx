import { Fragment, type ReactNode } from "react";

/**
 * The small subset of markdown our problem prompts actually use: headings,
 * fenced code, bullets, inline code and bold. Deliberately not a full parser -
 * the content is ours, and a dependency here would be all cost.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Split on `code` and **bold**, keeping the delimiters.
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  parts.forEach((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      out.push(
        <code key={key} className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.9em] text-[#9ecbff]">
          {part.slice(1, -1)}
        </code>,
      );
    } else if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      out.push(<strong key={key} className="font-semibold text-white">{part.slice(2, -2)}</strong>);
    } else if (part) {
      out.push(<Fragment key={key}>{part}</Fragment>);
    }
  });
  return out;
}

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let fence: string[] | null = null;
  let k = 0;

  const flushPara = () => {
    if (!para.length) return;
    blocks.push(
      <p key={`p${k++}`} className="my-2.5 leading-relaxed">
        {inline(para.join(" "), `p${k}`)}
      </p>,
    );
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`u${k++}`} className="my-2.5 list-disc space-y-1 pl-5">
        {list.map((li, i) => <li key={i}>{inline(li, `li${k}-${i}`)}</li>)}
      </ul>,
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trimStart().startsWith("```")) {
      if (fence === null) { flushPara(); flushList(); fence = []; }
      else {
        blocks.push(
          <pre key={`c${k++}`} className="my-3 overflow-x-auto rounded-lg border border-white/[0.08] bg-[#0b0c0f] p-3 font-mono text-[12px] leading-relaxed text-[#c8ccd4]">
            {fence.join("\n")}
          </pre>,
        );
        fence = null;
      }
      continue;
    }
    if (fence !== null) { fence.push(raw); continue; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushPara(); flushList();
      blocks.push(
        <h3 key={`h${k++}`} className="mb-1.5 mt-5 text-[13.5px] font-semibold uppercase tracking-[0.08em] text-[#4aa3ff]">
          {inline(heading[2], `h${k}`)}
        </h3>,
      );
      continue;
    }
    if (/^[-*]\s+/.test(line.trimStart())) {
      flushPara();
      list.push(line.trimStart().replace(/^[-*]\s+/, ""));
      continue;
    }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  if (fence?.length) {
    blocks.push(
      <pre key={`c${k++}`} className="my-3 overflow-x-auto rounded-lg border border-white/[0.08] bg-[#0b0c0f] p-3 font-mono text-[12px] text-[#c8ccd4]">
        {fence.join("\n")}
      </pre>,
    );
  }

  return <div className={className}>{blocks}</div>;
}
