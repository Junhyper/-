import type { ReactNode } from "react";

export type CommentaryStatus = "idle" | "streaming" | "done" | "unavailable" | "error";

/** **強調** だけを解釈するインライン描画 */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

/** LLM に指示した最小限の Markdown（#, ##, -, **）だけを React 要素として描画する */
function renderMarkdown(md: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-2 list-disc space-y-1 pl-5">
        {list.map((li, i) => (
          <li key={i}>{inline(li)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const key = `b-${blocks.length}`;
    if (/^\s*[-*・]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*・]\s+/, ""));
      continue;
    }
    flush();
    if (!line.trim()) continue;
    if (line.startsWith("## ")) {
      blocks.push(
        <h3 key={key} className="mt-5 mb-1 text-base font-bold text-ink">
          {inline(line.slice(3))}
        </h3>,
      );
    } else if (line.startsWith("# ")) {
      blocks.push(
        <h2 key={key} className="mb-2 text-xl font-bold leading-snug text-ink">
          {inline(line.slice(2))}
        </h2>,
      );
    } else {
      blocks.push(
        <p key={key} className="my-2">
          {inline(line.replace(/^#+\s*/, ""))}
        </p>,
      );
    }
  }
  flush();
  return blocks;
}

export function Commentary({
  text,
  status,
  message,
  meta,
}: {
  text: string;
  status: CommentaryStatus;
  message?: string | null;
  meta?: string | null;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-ink-2">
          ✨ AI 天気解説
        </span>
        {meta && <span className="text-xs text-muted">{meta}</span>}
      </div>

      {status === "idle" && !text && (
        <div className="space-y-2" aria-label="解説文を準備中">
          <div className="h-6 w-2/3 animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-full animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-surface-2" />
          <p className="pt-1 text-xs text-muted">過去20年の統計を読み込んでいます…</p>
        </div>
      )}

      {text && (
        <div
          className={`leading-relaxed text-ink-2 ${status === "streaming" ? "cursor" : ""}`}
          aria-live="polite"
        >
          {renderMarkdown(text)}
        </div>
      )}

      {status === "streaming" && !text && <p className="cursor text-sm text-muted">AI が解説文を書いています</p>}

      {(status === "unavailable" || status === "error") && message && (
        <p className={`mt-2 text-sm ${status === "error" ? "text-danger" : "text-muted"}`}>{message}</p>
      )}

      {status === "done" && (
        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          ※ AI による解説です。統計的な傾向は将来を保証するものではありません。最新の気象情報もあわせてご確認ください。
        </p>
      )}
    </section>
  );
}
