"use client";

import { useCallback, useEffect, useState } from "react";
import { formatNumber } from "@/lib/format";
import { button } from "./ui";

interface FollowUpItem {
  id: string;
  company: string;
  email: string | null;
  sentAt: string | null;
  from: string | null;
  approved: boolean;
  threaded: boolean;
  subject: string;
  body: string;
}

interface Account {
  id: string;
  user: string;
  label: string;
}

/**
 * Follow-up sor: akinek 7+ napja ment levél és nem válaszolt. Jóváhagyás után
 * a meglévő kiküldő viszi, ugyanabban a szálban, csatolmány nélkül — munkaidő
 * a címzett idejében, napi keret, szünet, leállítás ugyanúgy.
 */
export default function FollowUpPanel({
  onStarted,
}: {
  onStarted?: () => void;
}) {
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [due, setDue] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [followups, campaign] = await Promise.all([
        fetch("/api/contacts/followups?limit=150", { cache: "no-store" }).then(
          (r) => r.json(),
        ),
        fetch("/api/contacts/send-campaign", { cache: "no-store" }).then((r) =>
          r.json(),
        ),
      ]);
      setItems((followups.items ?? []) as FollowUpItem[]);
      setDue(Number(followups.due ?? 0));
      setApprovedCount(Number(followups.approved ?? 0));
      setAccounts((campaign.accounts ?? []) as Account[]);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  // A fiók alapból az, amelyikből a legtöbb esedékes levél ment.
  const byAccount = items.reduce<Record<string, number>>((counts, item) => {
    if (item.from) counts[item.from] = (counts[item.from] ?? 0) + 1;
    return counts;
  }, {});
  const defaultAccount =
    accounts.find(
      (account) =>
        account.user.toLowerCase() ===
        Object.entries(byAccount).sort((a, b) => b[1] - a[1])[0]?.[0],
    )?.id ??
    accounts[0]?.id ??
    "";
  const account = accountId || defaultAccount;

  const approve = async (action: "approve" | "unapprove", ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/contacts/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      setNote(
        `${formatNumber(data.updated)} follow-up ${action === "approve" ? "jóváhagyva" : "visszavonva"}.`,
      );
      setPicked(new Set());
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    const mine = items.filter(
      (item) =>
        item.approved &&
        (!item.from ||
          item.from ===
            accounts.find((a) => a.id === account)?.user.toLowerCase()),
    ).length;
    if (
      !window.confirm(
        `Follow-up küldés indítása ebből a fiókból: ${accounts.find((a) => a.id === account)?.user ?? account}.\n\nA jóváhagyottak közül ${mine} tartozik ehhez a fiókhoz. Munkaidőben, a címzett helyi idejében, szünetekkel megy ki. Mehet?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/contacts/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          mode: "followup",
          accountId: account,
          dailyLimit: 20,
          minMinutes: 10,
          maxMinutes: 20,
          ignoreWindow: false,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      setNote(
        `Elindult: ${formatNumber(data.remaining ?? 0)} follow-up a sorban. A haladás a „✉️ Kiküldés” panelen látszik.`,
      );
      onStarted?.();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Follow-up</span>
        <span className="text-[var(--muted)]">
          {formatNumber(due)} esedékes (7+ napja ment, nincs válasz) ·{" "}
          {formatNumber(approvedCount)} jóváhagyva
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setPicked(
                new Set(
                  items.filter((item) => !item.approved).map((item) => item.id),
                ),
              )
            }
            className={button("ghost", "sm")}
          >
            Mind kijelölése (
            {formatNumber(items.filter((item) => !item.approved).length)})
          </button>
          <button
            type="button"
            disabled={busy || !picked.size}
            onClick={() => void approve("approve", [...picked])}
            className={button("secondary", "sm")}
          >
            Kijelöltek jóváhagyása ({formatNumber(picked.size)})
          </button>
          <select
            value={account}
            onChange={(event) => setAccountId(event.target.value)}
            className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs"
            title="Ugyanabból a fiókból megy, ahonnan az első levél — a más fiókhoz tartozókat onnan indítsd"
          >
            {accounts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {byAccount[option.user.toLowerCase()]
                  ? ` (${byAccount[option.user.toLowerCase()]})`
                  : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !approvedCount || !account}
            onClick={() => void start()}
            className={button("primary", "sm")}
          >
            Jóváhagyottak küldése
          </button>
        </div>
      </div>

      {note ? <p className="text-xs text-emerald-300">{note}</p> : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}

      {items.length ? (
        <ul className="max-h-[50vh] divide-y divide-[var(--border)] overflow-auto rounded-lg border border-[var(--border)]">
          {items.map((item) => (
            <li key={item.id} className="px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  disabled={item.approved}
                  checked={item.approved || picked.has(item.id)}
                  onChange={() => toggle(item.id)}
                  aria-label={`${item.company} kijelölése`}
                  className="size-4 accent-blue-500"
                />
                <span className="font-medium">{item.company}</span>
                <span className="font-mono text-xs text-[var(--muted)]">
                  {item.email}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  · küldve{" "}
                  {item.sentAt
                    ? new Date(item.sentAt).toLocaleDateString("hu-HU")
                    : "?"}
                </span>
                <span
                  className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                  title={
                    item.threaded
                      ? "Az eredeti levélre válaszként megy — egy szálban marad"
                      : "Nincs meg az eredeti levél azonosítója — új levélként megy, Re: tárggyal"
                  }
                >
                  {item.threaded ? "szálban" : "új levélként"}
                </span>
                {item.approved ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void approve("unapprove", [item.id])}
                    className="ml-auto text-xs text-emerald-300 hover:underline"
                    title="Jóváhagyás visszavonása"
                  >
                    jóváhagyva ✓
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setOpenId((current) =>
                      current === item.id ? null : item.id,
                    )
                  }
                  className={`${item.approved ? "" : "ml-auto"} text-xs text-[var(--muted)] hover:text-foreground`}
                >
                  {openId === item.id ? "piszkozat ▴" : "piszkozat ▾"}
                </button>
              </div>
              {openId === item.id ? (
                <div className="mt-2 space-y-1 rounded-lg bg-[var(--surface-2)] p-2 text-xs">
                  <div className="font-medium">{item.subject}</div>
                  <pre className="whitespace-pre-wrap font-sans text-[var(--muted)]">
                    {item.body}
                  </pre>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--muted)]">Nincs esedékes follow-up.</p>
      )}
      {due > items.length ? (
        <p className="text-[11px] text-[var(--muted)]">
          A lista az első {formatNumber(items.length)} esedékest mutatja (a
          legrégebben kiküldöttel kezdve).
        </p>
      ) : null}
    </div>
  );
}
