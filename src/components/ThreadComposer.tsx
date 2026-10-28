"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

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

/** A Válasz ház korábbi Gmail-piszkozata ehhez a szálhoz. */
interface Draft {
  subject: string;
  body: string;
  attachment: string | null;
}

interface Sent {
  account: string;
  to: string;
  attachments: string[];
}

/** Egy szál levele: amit beírtál, amit a modell írt, és hol tart. */
interface Composition {
  instruction: string;
  subject: string;
  body: string;
  picked: string[];
  model: string | null;
  busy: "draft" | "send" | null;
  error: string | null;
  sent: Sent | null;
  fromDraft: boolean;
}

const EMPTY: Composition = {
  instruction: "",
  subject: "",
  body: "",
  picked: [],
  model: null,
  busy: null,
  error: null,
  sent: null,
  fromDraft: false,
};

// Szálanként a komponensen kívül él: szálváltáskor a futó generálás nem vész
// el, és visszaváltva ott folytatod, ahol abbahagytad.
const compositions = new Map<string, Composition>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function update(threadId: string, patch: Partial<Composition>) {
  compositions.set(threadId, {
    ...(compositions.get(threadId) ?? EMPTY),
    ...patch,
  });
  listeners.forEach((listener) => listener());
}

/**
 * Válasz egy megnyitott szálba: a helyi LLM az alap válasz-prompttal és a
 * kiegészítő utasításoddal megírja, a nyelvhez beállított csatolmány bejelölve,
 * átírható, és a gombra azonnal kimegy a szálba. Generálás közben másik
 * szálra válthatsz — ott is írhatsz, ez közben elkészül.
 */
export default function ThreadComposer({ threadId }: { threadId: string }) {
  const mail = useSyncExternalStore(
    subscribe,
    () => compositions.get(threadId) ?? EMPTY,
    () => EMPTY,
  );
  const set = (patch: Partial<Composition>) => update(threadId, patch);
  const [open, setOpen] = useState(mail !== EMPTY);
  const [target, setTarget] = useState<Target | null>(null);
  const [files, setFiles] = useState<AttachmentChoice[] | null>(null);
  const section = useRef<HTMLElement>(null);

  // Honnan, kinek — és ha van korábbi piszkozat, azzal nyílik ki.
  useEffect(() => {
    let alive = true;
    void fetch(`/api/mail/thread?threadId=${encodeURIComponent(threadId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!alive) return;
        if (!response.ok) {
          update(threadId, { error: data.error ?? "Hiba" });
          return;
        }
        setTarget(data.target as Target);
        const draft = data.draft as Draft | null;
        if (draft && !compositions.get(threadId)?.body) {
          update(threadId, {
            subject: draft.subject,
            body: draft.body,
            picked: draft.attachment ? [draft.attachment] : [],
            fromDraft: true,
          });
          setOpen(true);
          requestAnimationFrame(() =>
            section.current?.scrollIntoView({ block: "end" }),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [threadId]);

  // Kinyitáskor: milyen csatolmány választható.
  useEffect(() => {
    if (!open) return;
    let alive = true;
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
  }, [open]);

  // A kérés a szálhoz kötött, nem a komponenshez: ha közben máshová váltasz,
  // az eredmény ide íródik, és visszaváltva látod.
  const draft = async () => {
    const id = threadId;
    update(id, { busy: "draft", error: null, sent: null });
    try {
      const response = await fetch("/api/mail/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft",
          threadId: id,
          instruction: compositions.get(id)?.instruction ?? "",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      update(id, {
        subject: data.draft.subject,
        body: data.draft.body,
        model: data.draft.model,
        picked: data.draft.attachments,
      });
    } catch (caught) {
      update(id, { error: (caught as Error).message });
    } finally {
      update(id, { busy: null });
    }
  };

  const send = async () => {
    const id = threadId;
    const current = compositions.get(id) ?? EMPTY;
    update(id, { busy: "send", error: null });
    try {
      const response = await fetch("/api/mail/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          threadId: id,
          subject: current.subject,
          body: current.body,
          attachments: current.picked,
          fromDraft: current.fromDraft,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      update(id, {
        ...EMPTY,
        sent: data as Sent,
      });
    } catch (caught) {
      update(id, { error: (caught as Error).message });
    } finally {
      update(id, { busy: null });
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition hover:border-blue-500 hover:text-foreground"
      >
        ✎ Válasz írása ebbe a szálba
      </button>
    );
  }

  const { busy, body } = mail;
  return (
    <section
      ref={section}
      className="space-y-3 rounded-xl border border-blue-500/40 bg-blue-500/5 p-3"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        <span className="text-sm font-medium text-foreground">
          Válasz a szálba
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
        value={mail.instruction}
        onChange={(event) => set({ instruction: event.target.value })}
        rows={3}
        placeholder="Kiegészítő utasítás (nem kötelező) — pl.: kérdezd meg, mikor lenne alkalmas egy 20 perces hívás jövő héten."
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-blue-500"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void draft()}
          disabled={busy !== null}
          className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
        >
          {busy === "draft"
            ? "Írja a helyi LLM…"
            : body
              ? "Újragenerálás"
              : "Levél generálása"}
        </button>
        {busy === "draft" ? (
          <span className="text-[11px] text-[var(--muted)]">
            Közben nyugodtan válts másik levélre — ez itt elkészül.
          </span>
        ) : mail.model && body ? (
          <span className="text-[11px] text-[var(--muted)]">{mail.model}</span>
        ) : null}
      </div>

      {body ? (
        <div className="space-y-2">
          <input
            value={mail.subject}
            onChange={(event) => set({ subject: event.target.value })}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-blue-500"
          />
          <textarea
            value={body}
            onChange={(event) => set({ body: event.target.value })}
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
                    checked={mail.picked.includes(file.key)}
                    onChange={() =>
                      set({
                        picked: mail.picked.includes(file.key)
                          ? mail.picked.filter((key) => key !== file.key)
                          : [...mail.picked, file.key],
                      })
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
            disabled={busy !== null || !mail.subject.trim() || !body.trim()}
            className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {busy === "send" ? "Küldés…" : "Küldés a szálba"}
          </button>
        </div>
      ) : null}

      {mail.sent ? (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          Elküldve: {mail.sent.account} → {mail.sent.to}
          {mail.sent.attachments.length
            ? ` · csatolva: ${mail.sent.attachments.join(", ")}`
            : ""}
          . A szálban a következő levél-szinkron után jelenik meg.
        </p>
      ) : null}
      {mail.error ? (
        <p className="whitespace-pre-wrap rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {mail.error}
        </p>
      ) : null}
    </section>
  );
}
