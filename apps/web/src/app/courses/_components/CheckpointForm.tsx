"use client";

import { useActionState } from "react";
import { submitCheckpoint } from "../_actions";

/**
 * The checkpoint, before it has been marked.
 *
 * These questions are deliberately *not* the stored ones: the page hands over
 * the prompt, the options and - for the self-marked kinds - the model answer,
 * and nothing else. The correct index and the explanation stay on the server
 * until the attempt is in, so there is no answer key sitting in the bundle for
 * anyone who opens the network tab.
 */
export type ClientQuestion = {
  id: string;
  kind: "choice" | "recall" | "explain";
  prompt: string;
  options?: string[];
  modelAnswer?: string;
};

const KIND_NOTE: Record<ClientQuestion["kind"], string> = {
  choice: "Pick one",
  recall: "Blank editor, from memory - then mark yourself",
  explain: "Say it out loud, then mark yourself",
};

export function CheckpointForm({
  courseSlug,
  moduleId,
  questions,
  passScore,
}: {
  courseSlug: string;
  moduleId: string;
  questions: ClientQuestion[];
  passScore: number;
}) {
  const [state, formAction, pending] = useActionState(submitCheckpoint, null);

  return (
    <form action={formAction} className="mt-5">
      <input type="hidden" name="courseSlug" value={courseSlug} />
      <input type="hidden" name="moduleId" value={moduleId} />

      <ol className="space-y-5">
        {questions.map((q, i) => (
          <li key={q.id}>
            <fieldset className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <legend className="sr-only">Question {i + 1}</legend>
              <p className="flex items-baseline gap-2.5">
                <span className="font-mono text-[12px] text-[#7f8794]">Q{i + 1}</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-[#9aa1ad]">
                  {KIND_NOTE[q.kind]}
                </span>
              </p>
              <p className="mt-2.5 text-[15px] leading-relaxed text-[#e6e8ec]">{q.prompt}</p>

              {q.kind === "choice" ? (
                <div className="mt-3.5 space-y-2">
                  {(q.options ?? []).map((opt, oi) => (
                    <label
                      key={oi}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-[14px] leading-relaxed text-[#c8ccd4] transition hover:bg-white/[0.05] has-[:checked]:border-[#4aa3ff] has-[:checked]:bg-[#4aa3ff]/[0.08] has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#4aa3ff]"
                    >
                      <input
                        type="radio"
                        name={`choice:${q.id}`}
                        value={oi}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#00E5FF]"
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="mt-3.5">
                  <details className="rounded-lg border border-white/[0.08] bg-white/[0.02]">
                    <summary className="cursor-pointer rounded-lg px-3.5 py-2.5 text-[13px] text-[#7fc3ff] outline-none ring-offset-2 ring-offset-[#0b0c0f] transition hover:text-white focus-visible:ring-2 focus-visible:ring-[#4aa3ff]">
                      Show the model answer — after you have answered, not before
                    </summary>
                    <p className="border-t border-white/[0.07] px-3.5 py-3 text-[14px] leading-relaxed text-[#c8ccd4]">
                      {q.modelAnswer}
                    </p>
                  </details>

                  <div
                    role="radiogroup"
                    aria-label={`Mark your answer to question ${i + 1}`}
                    className="mt-3 flex flex-wrap gap-2"
                  >
                    {[
                      ["yes", "I had that"],
                      ["no", "Not yet"],
                    ].map(([value, label]) => (
                      <label
                        key={value}
                        className="cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2 text-[13.5px] text-[#c8ccd4] transition hover:bg-white/[0.05] has-[:checked]:border-[#4aa3ff] has-[:checked]:bg-[#4aa3ff]/[0.08] has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#4aa3ff]"
                      >
                        <input
                          type="radio"
                          name={`self:${q.id}`}
                          value={value}
                          className="mr-2 h-3.5 w-3.5 accent-[#00E5FF]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] px-5 py-2.5 text-[13.5px] font-semibold text-[#0b0c0f] outline-none ring-offset-2 ring-offset-[#0b0c0f] transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#4aa3ff] disabled:opacity-60"
        >
          {pending ? "Marking…" : "Mark the checkpoint"}
        </button>
        <p className="text-[12.5px] text-[#7f8794]">
          {Math.round(passScore * 100)}% to pass · you can retake it
        </p>
      </div>

      <p aria-live="polite" className="mt-3 text-[13px]">
        {state && !state.ok ? (
          <span role="alert" className="text-[#ff9d9d]">{state.message}</span>
        ) : state?.ok ? (
          <span className="text-[#7fe0a2]">{state.message}</span>
        ) : null}
      </p>
    </form>
  );
}
