"use client";

import { useState } from "react";
import { button, field } from "./ui";

export default function LoginForm({
  next,
  missing,
}: {
  /** Hova menjünk belépés után. */
  next: string;
  /** Hiányzó beállítások — ha van ilyen, belépni sem lehet. */
  missing: string[];
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Belépési hiba");
      // Teljes újratöltés: a süti már él, a szerver innentől beenged.
      window.location.assign(next);
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
    >
      <div>
        <h1 className="text-xl font-semibold">Melodia</h1>
        <p className="text-sm text-[var(--muted)]">Belépés.</p>
      </div>

      {missing.length ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
          Hiányos a belépés beállítása, ezért senki nem léphet be. Hiányzik:{" "}
          {missing.join(" és ")}.
        </p>
      ) : (
        <>
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              E-mail cím
            </span>
            <input
              type="email"
              value={email}
              required
              autoFocus
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              className={`${field()} w-full`}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              Jelszó
            </span>
            <input
              type="password"
              value={password}
              required
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              className={`${field()} w-full`}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className={`${button("primary", "md")} w-full`}
          >
            {busy ? "Belépés…" : "Belépés"}
          </button>
        </>
      )}
    </form>
  );
}
