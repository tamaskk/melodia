"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountOverview } from "@/lib/accounts";
import { button, field } from "./ui";

type Provider = "gmail" | "resend";

interface Feed {
  accounts: AccountOverview[];
  secretReady: boolean;
  resendReady: boolean;
}

const PROVIDERS: [Provider, string][] = [
  ["gmail", "Gmail"],
  ["resend", "Resend"],
];

const EMPTY = { user: "", password: "", name: "", label: "" };

export default function AccountsPanel() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [provider, setProvider] = useState<Provider>("gmail");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/mail-accounts", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Betöltési hiba");
      setFeed(data as Feed);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const set = (name: keyof typeof EMPTY) => (value: string) =>
    setForm((current) => ({ ...current, [name]: value }));

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/mail-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, ...form }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Mentési hiba");
      setMessage(`Felvéve: ${data.account.user}`);
      setForm(EMPTY);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (account: AccountOverview) => {
    if (
      !window.confirm(
        `Törlöd a(z) ${account.user} fiókot? Ha épp küld, a küldés leáll.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/mail-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Törlési hiba");
      setMessage(`Törölve: ${account.user}`);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const accounts = feed?.accounts ?? [];
  // Amíg nem tudjuk, mi van beállítva, nem riasztunk.
  const blocked =
    feed && (provider === "gmail" ? !feed.secretReady : !feed.resendReady);

  const input = (
    name: keyof typeof EMPTY,
    label: string,
    options: { type?: string; placeholder?: string; required?: boolean } = {},
  ) => (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
      <input
        type={options.type ?? "text"}
        value={form[name]}
        required={options.required ?? true}
        placeholder={options.placeholder}
        autoComplete="off"
        onChange={(event) => set(name)(event.target.value)}
        className={`${field()} w-full`}
      />
    </label>
  );

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Küldő fiókok</h1>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Ezekből a fiókokból megy a kiküldés. Mindegyiknek saját napi kerete és
          ütemezése van, egyszerre több is futhat.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300"
        >
          {message}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            <tr className="border-b border-[var(--border)]">
              <th className="px-3 py-2 font-medium">Címke</th>
              <th className="px-3 py-2 font-medium">Cím</th>
              <th className="px-3 py-2 font-medium">Feladónév</th>
              <th className="px-3 py-2 font-medium">Típus</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr
                key={account.id}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="px-3 py-2">{account.label}</td>
                <td className="px-3 py-2">
                  {account.user}
                  {account.usable ? null : (
                    <span className="block text-xs text-red-300">
                      A jelszó nem fejthető vissza — hiányzik vagy megváltozott
                      a MAIL_SECRET_KEY. Töröld, és vedd fel újra.
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{account.fromName || "—"}</td>
                <td className="px-3 py-2 text-xs text-[var(--muted)]">
                  {account.provider === "resend" ? "Resend" : "Gmail"}
                  {account.stored ? "" : " · env-fájlból"}
                </td>
                <td className="px-3 py-2 text-right">
                  {account.stored ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(account)}
                      className={button("ghost")}
                    >
                      Törlés
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {feed && !accounts.length ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-[var(--muted)]"
                >
                  Még nincs küldő fiók.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={(event) => void add(event)}
        className="space-y-4 rounded-lg border border-[var(--border)] p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Új fiók</h2>
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
            {PROVIDERS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={provider === value}
                onClick={() => setProvider(value)}
                className={`h-8 px-4 text-xs transition ${
                  provider === value
                    ? "bg-blue-600 text-white"
                    : "text-[var(--muted)] hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {provider === "gmail" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {input("user", "Gmail-cím", {
                type: "email",
                placeholder: "nev@gmail.com",
              })}
              {input("password", "App-jelszó", {
                type: "password",
                placeholder: "xxxx xxxx xxxx xxxx",
              })}
              {input("label", "Címke", {
                placeholder: "pl. Fő fiók",
                required: false,
              })}
            </div>
            <p className="text-xs text-[var(--muted)]">
              App-jelszó kell, nem a fiókjelszó: kétlépcsős azonosítás után a{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="text-blue-300 hover:underline"
              >
                myaccount.google.com/apppasswords
              </a>{" "}
              oldalon hozható létre. Mentés előtt kipróbáljuk a belépést; a
              jelszót titkosítva tároljuk, és többé nem jelenik meg.
            </p>
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {input("name", "Név", { placeholder: "Kálmán Tamás" })}
              {input("user", "E-mail cím", {
                type: "email",
                placeholder: "tamas@sajatdomain.hu",
              })}
              {input("label", "Címke", {
                placeholder: "pl. Céges domain",
                required: false,
              })}
            </div>
            <p className="text-xs text-[var(--muted)]">
              A név látszik feladóként. A cím domainjének hitelesítve kell
              lennie a Resendben, különben a küldés elutasításra kerül.
            </p>
          </>
        )}

        {blocked ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
            {provider === "gmail"
              ? "Hiányzik a MAIL_SECRET_KEY az atlas-credentials.env fájlból — ezzel titkosítjuk a jelszót. Generálj egyet (openssl rand -base64 32), írd be, és indítsd újra a szervert."
              : "Hiányzik a RESEND_API_KEY az atlas-credentials.env fájlból. Írd be, és indítsd újra a szervert."}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || Boolean(blocked)}
          className={button("primary", "md")}
        >
          {busy ? "Mentés…" : "Fiók felvétele"}
        </button>
      </form>
    </div>
  );
}
