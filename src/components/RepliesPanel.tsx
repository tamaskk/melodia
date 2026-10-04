"use client";

import { useCallback, useEffect, useState } from "react";
import { formatNumber } from "@/lib/format";
import { STAGE_BY_VALUE } from "@/lib/stage";
import type { Outcome } from "@/lib/stage";
import type { ReplyCategory, ReplyTriage } from "@/lib/types";
import { button } from "./ui";

interface ReplyItem {
  id: string;
  company: string;
  outcome: Outcome | null;
  outcomeSource: "kezi" | "ai" | null;
  triage: ReplyTriage | null;
  reply: {
    from: string;
    subject: string;
    date: string;
    excerpt: string;
    threaded: boolean;
  } | null;
}

const CATEGORY: Record<
  ReplyCategory,
  { label: string; tone: string; rank: number }
> = {
  interju: {
    label: "interjú",
    tone: "border-sky-400/60 bg-sky-400/15 text-sky-200",
    rank: 0,
  },
  kerdes: {
    label: "kérdés",
    tone: "border-amber-500/50 bg-amber-500/10 text-amber-300",
    rank: 1,
  },
  kesobb: {
    label: "később",
    tone: "border-[var(--border)] text-[var(--muted)]",
    rank: 2,
  },
  elutasitas: {
    label: "elutasítás",
    tone: "border-[var(--border)] text-[var(--muted)]",
    rank: 3,
  },
  automatikus: {
    label: "automatikus",
    tone: "border-[var(--border)] text-[var(--muted)]",
    rank: 4,
  },
  egyeb: {
    label: "egyéb",
    tone: "border-[var(--border)] text-[var(--muted)]",
    rank: 5,
  },
};

/**
 * Új válaszok: az osztályozás (interjú / kérdés / elutasítás / később), a levél
 * kivonata és egy szerkeszthető válaszpiszkozat. Küldés a szálban, arról a
 * címről, amire a levél jött — vagy „Kész, nem válaszolok”.
 */
export default function RepliesPanel({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<ReplyItem[]>([]);
  const [count, setCount] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/contacts/replies", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      const list = (data.items ?? []) as ReplyItem[];
      // A teendő elöl: interjú, kérdés — aztán a többi.
      list.sort(
        (a, b) =>
          (CATEGORY[a.triage?.category ?? "egyeb"].rank ?? 9) -
          (CATEGORY[b.triage?.category ?? "egyeb"].rank ?? 9),
      );
      setItems(list);
      setCount(Number(data.count ?? 0));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const act = async (
    id: string,
    payload: Record<string, unknown>,
    done: string,
  ) => {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch("/api/contacts/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      setNote(done);
      setOpenId(null);
      await load();
      onChanged?.();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const closeQuiet = async () => {
    const quiet = items.filter(
      (item) =>
        item.triage &&
        (item.triage.category === "elutasitas" ||
          item.triage.category === "kesobb"),
    );
    if (!quiet.length) return;
    if (
      !window.confirm(
        `${quiet.length} elutasítás és „később” válasz lezárása válasz nélkül? A kimenetelük megmarad.`,
      )
    ) {
      return;
    }
    setBusy("bulk");
    for (const item of quiet) {
      await fetch("/api/contacts/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "handled", id: item.id }),
      });
    }
    setBusy(null);
    setNote(`${quiet.length} válasz lezárva.`);
    await load();
    onChanged?.();
  };

  const quietCount = items.filter(
    (item) =>
      item.triage &&
      (item.triage.category === "elutasitas" ||
        item.triage.category === "kesobb"),
  ).length;

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Új válaszok</span>
        <span className="text-[var(--muted)]">
          {formatNumber(count)} kezeletlen · az AI osztályoz és piszkozatot ír,
          te hagyod jóvá
        </span>
        {quietCount ? (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void closeQuiet()}
            className={`ml-auto ${button("secondary", "sm")}`}
            title="Az elutasítások és a „később” válaszok lezárása válasz nélkül — a kimenetel megmarad"
          >
            Elutasítások és „később” lezárása ({formatNumber(quietCount)})
          </button>
        ) : null}
      </div>

      {note ? <p className="text-xs text-emerald-300">{note}</p> : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}

      {items.length ? (
        <ul className="max-h-[60vh] divide-y divide-[var(--border)] overflow-auto rounded-lg border border-[var(--border)]">
          {items.map((item) => {
            const category = item.triage?.category ?? "egyeb";
            const draft = drafts[item.id] ?? item.triage?.draft?.body ?? "";
            const open = openId === item.id;
            return (
              <li key={item.id} className="space-y-2 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${CATEGORY[category].tone}`}
                  >
                    {CATEGORY[category].label}
                    {item.triage
                      ? ` · ${Math.round(item.triage.confidence * 100)}%`
                      : ""}
                  </span>
                  <span className="font-medium">{item.company}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {item.reply?.from} ·{" "}
                    {item.reply
                      ? new Date(item.reply.date).toLocaleDateString("hu-HU")
                      : ""}
                  </span>
                  {item.outcome ? (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${STAGE_BY_VALUE[item.outcome].tone}`}
                      title={
                        item.outcomeSource === "ai"
                          ? "Az osztályozó állította — a kontakt paneljén átírható"
                          : "Kézzel állítva"
                      }
                    >
                      {STAGE_BY_VALUE[item.outcome].label}
                      {item.outcomeSource === "ai" ? " (AI)" : ""}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : item.id)}
                    className="ml-auto text-xs text-[var(--muted)] hover:text-foreground"
                  >
                    {open ? "bezár ▴" : "megnyit ▾"}
                  </button>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {item.triage?.summary ?? "Még nincs osztályozva."}
                </p>

                {open ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                        A válasz
                      </div>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-2)] p-2 font-sans text-xs">
                        {item.reply?.excerpt}
                      </pre>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                        Válaszpiszkozat{" "}
                        {item.reply?.threaded ? "(a szálban megy)" : ""}
                      </div>
                      <textarea
                        value={draft}
                        onChange={(event) =>
                          setDrafts((previous) => ({
                            ...previous,
                            [item.id]: event.target.value,
                          }))
                        }
                        rows={9}
                        placeholder="Nincs piszkozat — írd meg, vagy zárd le válasz nélkül."
                        className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs outline-none focus:border-blue-500"
                      />
                      {/\[kitöltendő/i.test(draft) ? (
                        <p className="text-[11px] text-amber-300">
                          Van benne [kitöltendő] rész — töltsd ki, különben nem
                          küldöm el.
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy === item.id || !draft.trim()}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Válasz küldése neki: ${item.reply?.from}?`,
                              )
                            )
                              return;
                            void act(
                              item.id,
                              {
                                action: "send",
                                subject: item.triage?.draft?.subject,
                                text: draft,
                              },
                              `Válasz elküldve: ${item.company}.`,
                            );
                          }}
                          className={button("primary", "sm")}
                        >
                          Válasz küldése
                        </button>
                        <button
                          type="button"
                          disabled={busy === item.id}
                          onClick={() =>
                            void act(
                              item.id,
                              { action: "handled" },
                              `${item.company}: lezárva.`,
                            )
                          }
                          className={button("secondary", "sm")}
                        >
                          Kész, nem válaszolok
                        </button>
                        <button
                          type="button"
                          disabled={busy === item.id}
                          onClick={() =>
                            void act(
                              item.id,
                              { action: "triage", ids: [item.id], force: true },
                              `${item.company}: újraosztályozva.`,
                            )
                          }
                          className={button("ghost", "sm")}
                        >
                          Újra osztályoz
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-[var(--muted)]">Nincs kezeletlen válasz.</p>
      )}
    </div>
  );
}
