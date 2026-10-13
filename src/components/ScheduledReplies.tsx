"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  APPROVABLE,
  EDITABLE,
  STATUS_LABELS,
  type ThreadReplyStatus,
} from "@/lib/threadReplyDraft";

interface Item {
  id: string;
  threadId: string;
  company: string;
  accountLabel: string;
  to: string;
  subject: string;
  body: string;
  excerpt: string;
  attachments: string[];
  status: ThreadReplyStatus;
  note: string | null;
  model: string | null;
  createdAt: string;
  sentAt: string | null;
}

interface Data {
  items: Item[];
  attachments?: { files: { key: string }[] };
  sender: { host: string; alive: boolean } | null;
}

const STATUS_STYLE: Record<ThreadReplyStatus, string> = {
  generalas: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]",
  atnezendo: "border-amber-500/60 bg-amber-500/15 text-amber-300",
  jovahagyva: "border-blue-500/60 bg-blue-500/15 text-blue-300",
  kuldes: "border-red-500/60 bg-red-500/15 text-red-300",
  kiment: "border-emerald-500/60 bg-emerald-500/15 text-emerald-300",
  megallt: "border-amber-500/60 bg-amber-500/15 text-amber-300",
  hiba: "border-red-500/60 bg-red-500/15 text-red-300",
};

const BUTTON =
  "h-8 rounded-lg border border-[var(--border)] px-3 text-xs transition hover:border-blue-500 disabled:opacity-40";

/**
 * Időzített válaszok a szálakba: a levelezés oldalán kijelölt szálakra készült
 * piszkozatok. Itt nézhetők át, írhatók át és hagyhatók jóvá — a jóváhagyott
 * levél a fiók következő szabad helyén megy ki.
 */
export default function ScheduledReplies({
  embedded = false,
  refreshKey = 0,
  onChanged,
}: {
  /** A levelezés oldalán: előnézet a még ki nem ment levelekről. */
  embedded?: boolean;
  /** Ha változik, a lista újratölt (pl. friss időzítés után). */
  refreshKey?: number;
  /** Szól, ha egy sor állapota megváltozott — a szállista jelvényeihez. */
  onChanged?: () => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [edits, setEdits] = useState<
    Record<string, { subject?: string; body?: string }>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A szülő függvénye minden rendernél új — refből hívjuk, nem függőségként.
  const changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  }, [onChanged]);
  const seen = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/mail/scheduled", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Betöltési hiba");
      setData(body as Data);
      setError(null);
      const signature = (body as Data).items
        .map((item) => `${item.id}:${item.status}`)
        .join("|");
      if (seen.current !== null && seen.current !== signature) {
        changed.current?.();
      }
      seen.current = signature;
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  const items = (data?.items ?? []).filter(
    (item) => !embedded || item.status !== "kiment",
  );
  // Amíg piszkozat készül vagy levél vár kiküldésre, magától frissül.
  const moving = items.some(
    (item) => item.status === "generalas" || item.status === "jovahagyva",
  );
  useEffect(() => {
    // Az első lekérdezés is időzítőből indul: effekt törzsében nincs setState.
    const first = setTimeout(() => void refresh(), 0);
    const timer = moving ? setInterval(() => void refresh(), 10_000) : null;
    return () => {
      clearTimeout(first);
      if (timer) clearInterval(timer);
    };
  }, [refresh, moving, refreshKey]);

  const post = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/mail/scheduled", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Hiba");
  };

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  /** A függő átírás mentése — jóváhagyás előtt is ez fut le. */
  const save = async (item: Item) => {
    const edit = edits[item.id];
    if (!edit) return;
    await post({ action: "edit", id: item.id, ...edit });
    setEdits(({ [item.id]: _saved, ...rest }) => {
      void _saved;
      return rest;
    });
  };

  if (!data && !error) return null;
  if (data && !items.length) return null;

  const files = (data?.attachments?.files ?? []).map((file) => file.key);
  const reviewable = items.filter(
    (item) =>
      item.status === "atnezendo" && item.body && item.attachments.length,
  );

  return (
    <section
      className={
        embedded
          ? "space-y-3 rounded-xl border border-violet-500/40 bg-violet-500/5 p-3"
          : "mx-auto w-full max-w-[1500px] space-y-3 p-4 sm:p-6"
      }
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {embedded ? "Időzített válaszok — előnézet" : "Időzített válaszok"}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            A levelezésben kijelölt szálakra írt levelek. Jóváhagyás után annak
            a fióknak a következő szabad helyén mennek ki, amelyikre a válasz
            jött — az első levelek után megmaradt napi keretből.
          </p>
        </div>
        {reviewable.length ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                for (const item of reviewable) await save(item);
                await post({
                  action: "approve",
                  ids: reviewable.map((item) => item.id),
                });
              })
            }
            className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            Mind jóváhagyása ({reviewable.length})
          </button>
        ) : null}
      </header>

      {data && !data.sender?.alive ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          A küldő gép most nem fut — piszkozat és küldés csak akkor lesz, ha
          elindul.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2">
        {items.map((item) => {
          const editable = EDITABLE.includes(item.status);
          const edit = edits[item.id];
          const change = (patch: { subject?: string; body?: string }) =>
            setEdits((current) => ({
              ...current,
              [item.id]: { ...current[item.id], ...patch },
            }));
          return (
            <li
              key={item.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            >
              <details open={item.status === "atnezendo"}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{item.company}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {item.accountLabel} → {item.to}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[item.status]}`}
                  >
                    {STATUS_LABELS[item.status]}
                  </span>
                  {item.sentAt ? (
                    <span className="text-[11px] text-[var(--muted)]">
                      {new Date(item.sentAt).toLocaleString("hu-HU")}
                    </span>
                  ) : null}
                </summary>
                <div className="space-y-2 border-t border-[var(--border)] p-3">
                  {item.note ? (
                    <p className="text-xs text-amber-300">{item.note}</p>
                  ) : null}
                  <details>
                    <summary className="cursor-pointer text-xs text-[var(--muted)]">
                      A levél, amire válaszol
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words border-l-2 border-[var(--border)] pl-3 font-sans text-[12px] text-[var(--muted)]">
                      {item.excerpt}
                    </pre>
                  </details>
                  {item.status === "generalas" ? (
                    <p className="text-xs text-[var(--muted)]">
                      A küldő gép írja a piszkozatot…
                    </p>
                  ) : (
                    <>
                      <input
                        value={edit?.subject ?? item.subject}
                        onChange={(event) =>
                          change({ subject: event.target.value })
                        }
                        disabled={!editable || busy}
                        aria-label="Tárgy"
                        className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-blue-500 disabled:opacity-70"
                      />
                      <textarea
                        value={edit?.body ?? item.body}
                        onChange={(event) =>
                          change({ body: event.target.value })
                        }
                        disabled={!editable || busy}
                        rows={9}
                        aria-label="A levél szövege"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[13px] leading-relaxed outline-none focus:border-blue-500 disabled:opacity-70"
                      />
                    </>
                  )}
                  {editable && files.length ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="text-[var(--muted)]">
                        Csatolmány (kötelező — a levél hivatkozik rá):
                      </span>
                      {files.map((key) => (
                        <label key={key} className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={item.attachments.includes(key)}
                            onChange={() =>
                              void act(async () => {
                                await post({
                                  action: "edit",
                                  id: item.id,
                                  attachments: item.attachments.includes(key)
                                    ? item.attachments.filter(
                                        (name) => name !== key,
                                      )
                                    : [...item.attachments, key],
                                });
                              })
                            }
                          />
                          {key}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[var(--muted)]">
                      {item.attachments.length
                        ? `📎 ${item.attachments.join(", ")}`
                        : "csatolmány nélkül"}
                    </p>
                  )}
                  {item.model ? (
                    <p className="text-[11px] text-[var(--muted)]">
                      {item.model}
                    </p>
                  ) : null}
                  {item.status !== "kiment" ? (
                    <div className="flex flex-wrap gap-2">
                      {APPROVABLE.includes(item.status) &&
                      item.body &&
                      item.attachments.length ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await save(item);
                              await post({ action: "approve", ids: [item.id] });
                            })
                          }
                          className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
                        >
                          Jóváhagyás
                        </button>
                      ) : null}
                      {edit && editable ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void act(() => save(item))}
                          className={BUTTON}
                        >
                          Mentés
                        </button>
                      ) : null}
                      {item.status !== "generalas" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void act(() =>
                              post({ action: "regenerate", id: item.id }),
                            )
                          }
                          className={BUTTON}
                        >
                          Újragenerálás
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            post({ action: "cancel", ids: [item.id] }),
                          )
                        }
                        className={BUTTON}
                      >
                        Lemondás
                      </button>
                    </div>
                  ) : null}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
