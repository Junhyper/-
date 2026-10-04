"use client";

import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/types";

function describe(p: Place): string {
  return [p.admin1, p.country].filter(Boolean).join(" / ");
}

export function SearchBox({ onSelect, disabled }: { onSelect: (p: Place) => void; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 入力が止まってから 300ms 後に地名検索
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { places?: Place[]; error?: string };
        setResults(data.places ?? []);
        setActive(0);
        setMessage(data.error ?? (data.places?.length ? null : "該当する地名が見つかりませんでした"));
        setOpen(true);
      } catch {
        /* 中断時は無視 */
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function choose(p: Place) {
    setQuery(p.name);
    setOpen(false);
    onSelect(p);
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setMessage("このブラウザは位置情報に対応していません");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setQuery("");
        onSelect({ name: "現在地", lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setMessage("位置情報を取得できませんでした");
        setOpen(true);
      },
      { timeout: 10_000 },
    );
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (results[active]) choose(results[active]);
        }}
      >
        <label className="sr-only" htmlFor="place">
          地域名
        </label>
        <input
          id="place"
          type="search"
          autoComplete="off"
          placeholder="地域名を入力（例: 札幌、那覇、London）"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) {
              setResults([]);
              setOpen(false);
            }
          }}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + results.length) % results.length);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls="place-results"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-cool focus:ring-2 focus:ring-cool/30"
        />
        <button
          type="button"
          onClick={locateMe}
          disabled={disabled || locating}
          className="shrink-0 rounded-xl border border-line bg-surface px-3 py-3 text-sm text-ink-2 hover:bg-surface-2 disabled:opacity-50"
          title="現在地の天気を表示"
        >
          {locating ? "取得中…" : "📍 現在地"}
        </button>
      </form>

      {open && (results.length > 0 || message) && (
        <ul
          id="place-results"
          role="listbox"
          className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-lg"
        >
          {results.map((p, i) => (
            <li key={`${p.lat},${p.lon},${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(p)}
                className={`flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left ${
                  i === active ? "bg-surface-2" : ""
                }`}
              >
                <span className="font-medium">{p.name}</span>
                <span className="truncate text-xs text-muted">{describe(p)}</span>
              </button>
            </li>
          ))}
          {!results.length && message && <li className="px-4 py-2 text-sm text-muted">{message}</li>}
        </ul>
      )}
    </div>
  );
}
