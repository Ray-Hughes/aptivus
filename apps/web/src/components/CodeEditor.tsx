"use client";

import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";

/**
 * The editor. CodeMirror rather than a highlighted overlay on a textarea:
 * bracket matching, real indentation and undo grouping are the difference
 * between a code box and somewhere you would actually write a solution under
 * time pressure.
 */
const theme = EditorView.theme(
  {
    "&": { backgroundColor: "#0b0c0f", color: "#e6e8ec", height: "100%" },
    "&.cm-focused": { outline: "none" },
    ".cm-content": { caretColor: "#ffffff", padding: "14px 0", fontSize: "13px" },
    ".cm-gutters": {
      backgroundColor: "#0b0c0f",
      color: "#4c525d",
      border: "none",
      paddingRight: "6px",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.035)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(255,255,255,0.035)", color: "#8b929d" },
    // The default is nearly invisible on this ground, which makes selecting
    // a block feel broken.
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#2c4a6b",
    },
    "&.cm-focused .cm-selectionBackground": { backgroundColor: "#3d6f9e" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#ffffff", borderLeftWidth: "2px" },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "transparent",
      color: "#39c06c",
      fontWeight: "700",
      outline: "1px solid rgba(57,192,108,.4)",
    },
    ".cm-scroller": { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", lineHeight: "1.6" },
  },
  { dark: true },
);

/** Token colours, kept in step with the rest of the product. */
const highlight = EditorView.baseTheme({});

export function CodeEditor({
  value, onChange, language, readOnly = false, ariaLabel = "Code editor",
}: {
  value: string;
  onChange: (v: string) => void;
  language: "python" | "sql";
  readOnly?: boolean;
  ariaLabel?: string;
}) {
  const extensions = useMemo(
    () => [language === "sql" ? sql() : python(), theme, highlight, EditorView.lineWrapping],
    [language],
  );

  return (
    <div className="h-full min-h-0 overflow-hidden" aria-label={ariaLabel}>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        readOnly={readOnly}
        height="100%"
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,   // suggestions during an interview drill are a crutch
          foldGutter: false,
          searchKeymap: false,
          indentOnInput: true,
        }}
        theme="dark"
        className="h-full text-[13px]"
      />
    </div>
  );
}
