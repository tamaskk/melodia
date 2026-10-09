"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { AccountOverview } from "@/lib/accounts";
import { MAX_STEPS, type WarmupStatus } from "@/lib/warmup";
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

type Change = Record<string, unknown>;

/** „3. hét · 17. nap · ma max 30" — hol tart a fiók a felfuttatásban. */
function warmupSummary(status: WarmupStatus): string {
  if (status.index === null) return "végzett — nincs plafon";
  const step = status.steps[status.index];
  return status.day === null
    ? `még nem indult · az első küldéstől max ${step.cap}/nap`
    : `${step.label} · ${status.day}. nap · ma max ${step.cap}`;
}

const NUMBER =
  "h-7 w-16 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs text-foreground outline-none focus:border-blue-500";

/**
 * A fiók felfuttatásának szerkesztője: a lépcsők (meddig, napi hány levél), a
 * kezdés napja, újraindítás. A most érvényes lépcső ki van emelve.
 */
function WarmupEditor({
  status,
  busy,
  onSave,
}: {
  status: WarmupStatus;
  busy: boolean;
  /** Mentés; a szülő újratölti a listát, és visszaírja az üzenetet. */
  onSave: (change: Change, done: string) => void;
}) {
  const [steps, setSteps] = useState(
    status.steps.map(({ untilDay, cap }) => ({ untilDay, cap })),
  );
  const [start, setStart] = useState(status.startAt?.slice(0, 10) ?? "");

  const edit = (index: number, key: "untilDay" | "cap", value: number) =>
    setSteps((current) =>
      current.map((step, at) =>
        at === index ? { ...step, [key]: value } : step,
      ),
    );
  const add = () =>
    setSteps((current) => {
      const last = current[current.length - 1];
      return [
        ...current,
        {
          untilDay: (last?.untilDay ?? 0) + 7,
          cap: Math.min(100, (last?.cap ?? 0) + 10),
        },
      ];
    });
  const changed =
    JSON.stringify(steps) !==
    JSON.stringify(
      status.steps.map(({ untilDay, cap }) => ({ untilDay, cap })),
    );

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Lépcsők {status.custom ? "· saját" : "· alapértelmezett"}
        </p>
        <div className="space-y-1">
          {steps.map((step, index) => {
            const from = (steps[index - 1]?.untilDay ?? 0) + 1;
            const current = !changed && status.index === index;
            return (
              <div
                key={index}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 ${
                  current
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : "border-[var(--border)]"
                }`}
              >
                <span className="w-6 text-[var(--muted)]">{index + 1}.</span>
                <span className="text-[var(--muted)]">{from}. naptól</span>
                <label className="flex items-center gap-1.5">
                  eddig a napig
                  <input
                    type="number"
                    min={from}
                    max={365}
                    value={step.untilDay}
                    disabled={busy}
                    onChange={(event) =>
                      edit(index, "untilDay", Number(event.target.value))
                    }
                    className={NUMBER}
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  napi max
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={step.cap}
                    disabled={busy}
                    onChange={(event) =>
                      edit(index, "cap", Number(event.target.value))
                    }
                    className={NUMBER}
                  />
                </label>
                {current ? (
                  <span className="text-emerald-300">
                    ← most itt tart
                    {status.day ? ` (${status.day}. nap)` : ""}
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={busy || steps.length === 1}
                  onClick={() =>
                    setSteps((list) => list.filter((_, at) => at !== index))
                  }
                  aria-label={`${index + 1}. lépcső törlése`}
                  className="ml-auto text-[var(--muted)] hover:text-red-300 disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-[var(--muted)]">
          Az utolsó lépcső után nincs felfuttatási plafon: a queue napi kerete
          és a szünetekből adódó napi darabszám él.
          {status.index === null ? " Ez a fiók már itt tart." : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || steps.length >= MAX_STEPS}
            onClick={add}
            className={button("secondary")}
          >
            + Lépcső
          </button>
          <button
            type="button"
            disabled={busy || !changed}
            onClick={() => onSave({ warmupSteps: steps }, "lépcsők mentve.")}
            className={button("primary")}
          >
            Lépcsők mentése
          </button>
          {status.custom ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onSave(
                  { warmupSteps: null },
                  "vissza az alapértelmezett lépcsőkre.",
                )
              }
              className={button("ghost")}
            >
              Alapértékek visszaállítása
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Kezdés
        </p>
        <p className="text-[var(--muted)]">
          {status.startAt
            ? `A felfuttatás ${new Date(status.startAt).toLocaleDateString("hu-HU")} óta számít` +
              (status.startSet
                ? " — kézzel állítva."
                : " — a fiók első küldésétől.")
            : "Még nem indult: a fiók első küldésével kezdődik."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Újraindítod a felfuttatást? A fiók mától az 1. lépcsőtől indul, a napi kerete lecsökken.",
                )
              ) {
                onSave(
                  { warmupStart: "now" },
                  "felfuttatás újraindítva mától.",
                );
              }
            }}
            className={button("secondary")}
          >
            Újraindítás mától
          </button>
          <label className="flex items-center gap-1.5 text-[var(--muted)]">
            vagy kezdés napja
            <input
              type="date"
              value={start}
              disabled={busy}
              onChange={(event) => setStart(event.target.value)}
              className={`${field("sm")} w-40`}
            />
          </label>
          <button
            type="button"
            disabled={busy || !start || start === status.startAt?.slice(0, 10)}
            onClick={() =>
              onSave({ warmupStart: start }, `kezdés átállítva: ${start}.`)
            }
            className={button("secondary")}
          >
            Beállítás
          </button>
          {status.startSet ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onSave(
                  { warmupStart: null },
                  "a felfuttatás újra az első küldéstől számít.",
                )
              }
              className={button("ghost")}
            >
              Vissza az első küldéshez
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function AccountsPanel() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [provider, setProvider] = useState<Provider>("gmail");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Melyik fiók felfuttatás-szerkesztője van nyitva (egyszerre egy).
  const [editing, setEditing] = useState<string | null>(null);

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

  const saveSetting = async (
    account: AccountOverview,
    change: Change,
    done: string,
  ) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/mail-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, ...change }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Mentési hiba");
      setMessage(`${account.user}: ${done}`);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleWarmup = (account: AccountOverview) =>
    saveSetting(
      account,
      { warmup: !account.warmup },
      `felfuttatás ${account.warmup ? "kikapcsolva" : "bekapcsolva"}.`,
    );

  /** Üres mező = nincs saját maximum. Csak akkor ment, ha tényleg változott. */
  const saveMax = (account: AccountOverview, raw: string) => {
    const dailyMax = raw.trim() ? Number(raw) : null;
    if (dailyMax === account.dailyMax) return;
    void saveSetting(
      account,
      { dailyMax },
      dailyMax ? `napi maximum: ${dailyMax}.` : "napi maximum törölve.",
    );
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
        <table className="w-full text-left text-sm max-sm:block sm:min-w-[640px]">
          <thead className="text-[11px] uppercase tracking-wider text-[var(--muted)] max-sm:hidden">
            <tr className="border-b border-[var(--border)]">
              <th className="px-3 py-2 font-medium">Címke</th>
              <th className="px-3 py-2 font-medium">Cím</th>
              <th className="px-3 py-2 font-medium">Feladónév</th>
              <th className="px-3 py-2 font-medium">Típus</th>
              <th className="px-3 py-2 font-medium">Felfuttatás</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          {/* Telefonon a sorok kártyák: a kapcsoló és a törlés görgetés nélkül elérhető. */}
          <tbody className="max-sm:block">
            {accounts.map((account) => (
              <Fragment key={account.id}>
                <tr className="border-b border-[var(--border)] last:border-0 max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-1.5 max-sm:p-3">
                  <td className="px-3 py-2 max-sm:block max-sm:p-0 max-sm:w-full max-sm:font-medium">
                    {account.label}
                  </td>
                  <td className="px-3 py-2 max-sm:block max-sm:p-0 max-sm:w-full max-sm:break-all max-sm:text-[var(--muted)]">
                    {account.user}
                    {account.usable ? null : (
                      <span className="block text-xs text-red-300">
                        A jelszó nem fejthető vissza — hiányzik vagy
                        megváltozott a MAIL_SECRET_KEY. Töröld, és vedd fel
                        újra.
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-sm:block max-sm:p-0 max-sm:text-xs max-sm:text-[var(--muted)]">
                    {account.fromName || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)] max-sm:block max-sm:p-0">
                    {account.provider === "resend" ? "Resend" : "Gmail"}
                    {account.stored ? "" : " · env-fájlból"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 max-sm:block max-sm:p-0 max-sm:w-full max-sm:pt-1">
                    {account.usable ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={account.warmup}
                        disabled={busy}
                        onClick={() => void toggleWarmup(account)}
                        title={
                          account.warmup
                            ? "Új fiókként kezeljük: a napi keret lépcsőzetesen nő"
                            : "Nincs felfuttatási plafon: a mellette megadott napi max él"
                        }
                        className={`h-7 rounded-full border px-3 text-xs transition disabled:opacity-40 ${
                          account.warmup
                            ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                            : "border-[var(--border)] text-[var(--muted)]"
                        }`}
                      >
                        {account.warmup ? "követi" : "kikapcsolva"}
                      </button>
                    ) : null}
                    {account.usable && account.warmup ? (
                      <button
                        type="button"
                        aria-expanded={editing === account.id}
                        onClick={() =>
                          setEditing((current) =>
                            current === account.id ? null : account.id,
                          )
                        }
                        title="A lépcsők és a kezdés szerkesztése"
                        className="ml-2 whitespace-normal text-left text-xs text-[var(--muted)] underline decoration-dotted underline-offset-2 hover:text-foreground"
                      >
                        {warmupSummary(account.warmupStatus)}{" "}
                        {editing === account.id ? "▲" : "▼"}
                      </button>
                    ) : null}
                    {account.usable && !account.warmup ? (
                      <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
                        napi max
                        <input
                          // A mentett érték változásakor a mező is frissüljön.
                          key={account.dailyMax ?? "nincs"}
                          type="number"
                          min={1}
                          max={100}
                          defaultValue={account.dailyMax ?? ""}
                          placeholder="—"
                          disabled={busy}
                          onBlur={(event) =>
                            saveMax(account, event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter")
                              event.currentTarget.blur();
                          }}
                          className="h-7 w-16 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-foreground outline-none focus:border-blue-500"
                        />
                      </label>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right max-sm:block max-sm:p-0 max-sm:empty:hidden">
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
                {editing === account.id && account.warmup ? (
                  <tr className="border-b border-[var(--border)] last:border-0 max-sm:block">
                    <td
                      colSpan={6}
                      className="bg-[var(--surface-2)]/40 px-3 py-3 max-sm:block"
                    >
                      <WarmupEditor
                        // Mentés után a friss állapotból induljon újra.
                        key={JSON.stringify(account.warmupStatus)}
                        status={account.warmupStatus}
                        busy={busy}
                        onSave={(change, done) =>
                          void saveSetting(account, change, done)
                        }
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {feed && !accounts.length ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-[var(--muted)] max-sm:block max-sm:w-full"
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
