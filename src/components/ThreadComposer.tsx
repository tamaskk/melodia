"use client";

import { useEffect, useState } from "react";

interface Target {
  company: string;
  account: string;
  to: string;
  toName: string | null;
  subject: string;
  inReplyTo: string | null;
}

interface AttachmentChoice {
  key: string;
  name: string;
}

interface Sent {
  account: string;
  to: string;
  attachments: string[];
}

/**
 * Levél egy megnyitott szálba: a felhasználó leírja, mit akar, a Claude
 * megírja a szál előzményéből, átírható, és a gombra azonnal kimegy a szálba.
 * A szülő `key={threadId}`-vel adja, így szálváltáskor tiszta lappal indul.
 */
export default function ThreadComposer({ threadId }: { threadId: string }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [instruction, setInstruction] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [files, setFiles] = useState<AttachmentChoice[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  // Kinyitáskor: honnan, kinek, és milyen csatolmány választható.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetch(`/api/mail/thread?threadId=${encodeURIComponent(threadId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!alive) return;
        if (!response.ok) setError(data.error ?? "Hiba");
        else setTarget(data.target as Target);
      })
      .catch(() => undefined);
    void fetch("/api/mail/scheduled", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (alive) {
          setFiles((data.attachments?.files ?? []) as AttachmentChoice[]);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, threadId]);

  const draft = async () => {
    setBusy("draft");
    setError(null);
    setSent(null);
    try {
      const response = await fetch("/api/mail/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", threadId, instruction }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      setSubject(data.draft.subject);
      setBody(data.draft.body);
      setModel(data.draft.model);
      setTarget(data.draft.target);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy("send");
    setError(null);
    try {
      const response = await fetch("/api/mail/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          threadId,
          subject,
          body,
          attachments: picked,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      setSent(data as Sent);
      setBody("");
      setInstruction("");
      setPicked([]);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition hover:border-blue-500 hover:text-foreground"
      >
        ✎ Levél írása ebbe a szálba, prompttal
      </button>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-blue-500/40 bg-blue-500/5 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        <span className="text-sm font-medium text-foreground">
          Levél a szálba
        </span>
        {target ? (
          <span>
            {target.account} →{" "}
            {target.toName ? `${target.toName} <${target.to}>` : target.to}
            {target.inReplyTo ? "" : " · nincs mihez fűzni, új szálként megy"}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto transition hover:text-foreground"
        >
          Bezár
        </button>
      </div>

      <textarea
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        rows={3}
        placeholder="Mit írjon? Pl.: Köszönd meg a választ, kérdezd meg, mikor lenne alkalmas egy 20 perces hívás jövő héten."
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-blue-500"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void draft()}
          disabled={busy !== null || !instruction.trim()}
          className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
        >
          {busy === "draft"
            ? "Írja a Claude…"
            : body
              ? "Újragenerálás"
              : "Levél generálása"}
        </button>
        {model && body ? (
          <span className="text-[11px] text-[var(--muted)]">{model}</span>
        ) : null}
      </div>

      {body ? (
        <div className="space-y-2">
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-blue-500"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={Math.min(18, Math.max(6, body.split("\n").length + 1))}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm leading-relaxed outline-none focus:border-blue-500"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-[var(--muted)]">Csatolmány:</span>
            {files?.length ? (
              files.map((file) => (
                <label key={file.key} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={picked.includes(file.key)}
                    onChange={() =>
                      setPicked((current) =>
                        current.includes(file.key)
                          ? current.filter((key) => key !== file.key)
                          : [...current, file.key],
                      )
                    }
                  />
                  {file.key}
                </label>
              ))
            ) : (
              <span className="text-[var(--muted)]">
                {files === null
                  ? "betöltés…"
                  : "nincs fájl az attachments mappában"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy !== null || !subject.trim() || !body.trim()}
            className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {busy === "send" ? "Küldés…" : "Küldés a szálba"}
          </button>
        </div>
      ) : null}

      {sent ? (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          Elküldve: {sent.account} → {sent.to}
          {sent.attachments.length
            ? ` · csatolva: ${sent.attachments.join(", ")}`
            : ""}
          . A szálban a következő levél-szinkron után jelenik meg.
        </p>
      ) : null}
      {error ? (
        <p className="whitespace-pre-wrap rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
    </section>
  );
}
