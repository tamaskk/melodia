"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { button, field } from "./ui";

interface Account {
  id: string;
  user: string;
  label: string;
  provider: "gmail" | "resend";
}

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; to: string; account: string }
  | { kind: "error"; message: string };

/**
 * Egyéni levél egy kiválasztott küldő fiókból: címzett, tárgy, szöveg.
 * Nem kötődik kontakthoz, sima szövegként, csatolmány nélkül megy ki.
 */
export default function ComposePanel() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mail/compose", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Betöltési hiba");
        const list = data.accounts as Account[];
        setAccounts(list);
        setAccountId((current) => current || list[0]?.id || "");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setLoadError(error.message);
      });
    return () => controller.abort();
  }, []);

  const sender = accounts?.find((account) => account.id === accountId);
  const ready = Boolean(sender && to.trim() && subject.trim() && text.trim());

  const send = async () => {
    if (!sender || !ready || status.kind === "sending") return;
    if (
      !window.confirm(
        `Elküldöd a levelet?\n\nKitől: ${sender.user}\nKinek: ${to.trim()}\nTárgy: ${subject.trim()}`,
      )
    ) {
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const response = await fetch("/api/mail/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, to, subject, text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Nem ment ki a levél.");
      setStatus({ kind: "sent", to: to.trim(), account: data.account });
      // A fiók marad, a levél kiürül — a következő már új levél.
      setTo("");
      setSubject("");
      setText("");
    } catch (error) {
      setStatus({ kind: "error", message: (error as Error).message });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold">Új levél</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Egyéni levél a kiválasztott küldő fiókból. Sima szövegként, csatolmány
          nélkül megy ki, és nem kötődik kontakthoz vagy queue-hoz.
        </p>
      </header>

      {loadError ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {loadError}
        </p>
      ) : null}

      {accounts && !accounts.length ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Nincs használható küldő fiók — vegyél fel egyet a{" "}
          <Link href="/accounts" className="underline">
            Küldő fiókok
          </Link>{" "}
          oldalon.
        </p>
      ) : null}

      <form
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Kitől
          </span>
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            disabled={!accounts?.length}
            className={`${field()} w-full`}
          >
            {accounts === null ? <option>Betöltés…</option> : null}
            {accounts?.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label && account.label !== account.user
                  ? `${account.label} · ${account.user}`
                  : account.user}
                {account.provider === "resend" ? " (Resend)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Kinek
          </span>
          <input
            type="email"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="valaki@ceg.hu"
            autoComplete="off"
            className={`${field()} w-full`}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Tárgy
          </span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className={`${field()} w-full`}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Szöveg
          </span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={14}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm leading-relaxed outline-none focus:border-blue-500"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!ready || status.kind === "sending"}
            className={button("primary", "md")}
          >
            {status.kind === "sending" ? "Küldés…" : "Küldés"}
          </button>
          {status.kind === "sent" ? (
            <span className="text-sm text-emerald-300">
              Elküldve: {status.to} ({status.account})
            </span>
          ) : null}
          {status.kind === "error" ? (
            <span className="text-sm text-red-300">{status.message}</span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
