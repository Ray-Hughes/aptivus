"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addFlagAllowUser } from "../_actions/flags";
import { ghostButtonClass, inputClass } from "./ui";

type Result = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
};

export default function AllowListEditor({ flagKey }: { flagKey: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();

  async function search() {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setMessage({ ok: false, text: "Type an email or name to search." });
      return;
    }
    setSearching(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        setResults([]);
        setMessage({ ok: false, text: `Search failed (${response.status}).` });
        return;
      }
      const data = (await response.json()) as { results?: Result[] };
      setResults(data.results ?? []);
      if ((data.results ?? []).length === 0) {
        setMessage({ ok: false, text: "No users matched." });
      }
    } catch {
      setMessage({ ok: false, text: "Search failed." });
    } finally {
      setSearching(false);
    }
  }

  function add(user: Result) {
    startTransition(async () => {
      const result = await addFlagAllowUser(flagKey, user.id);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setResults([]);
        setQuery("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
          placeholder="Find a user by email"
          aria-label={`Find a user to allow for ${flagKey}`}
          className={`${inputClass} min-w-48 flex-1`}
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={searching}
          className={ghostButtonClass}
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {results.length > 0 && (
        <ul className="divide-y divide-edge overflow-hidden rounded-md border border-edge">
          {results.map((user) => (
            <li key={user.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm">{user.displayName ?? "—"}</span>
                <span className="block truncate text-xs text-muted">{user.email}</span>
              </span>
              <button
                type="button"
                onClick={() => add(user)}
                disabled={pending}
                className="rounded-md border border-edge bg-raised px-2.5 py-1 text-xs transition hover:border-accent2 disabled:opacity-60"
              >
                Allow
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p
          role="status"
          aria-live="polite"
          className={`text-xs ${message.ok ? "text-accent" : "text-danger"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
