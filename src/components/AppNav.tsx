"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useMailMode } from "@/lib/useMailMode";
import {
  useSearchProvider,
  type SearchProviderChoice,
} from "@/lib/useSearchProvider";
import type { MailMode } from "@/lib/mailto";

type MenuKey = "sourcing" | "system" | "settings";

interface NavLink {
  href: string;
  label: string;
  hint: string;
}

const SOURCING: NavLink[] = [
  {
    href: "/check",
    label: "Ellenőrzés",
    hint: "Cégnévlista: mi van már bent, mi hiányzik — felvétel és kutatás",
  },
  { href: "/import", label: "Import", hint: "JSON / CSV import előnézettel" },
  {
    href: "/convert",
    label: "Hunter CSV",
    hint: "Hunter-export átalakítása lead-sorokká",
  },
];

const SYSTEM: NavLink[] = [
  {
    href: "/queues",
    label: "Queue-k és naptár",
    hint: "Előre összeállított kiküldési sorok, fiókonkénti napi terv",
  },
  {
    href: "/accounts",
    label: "Küldő fiókok",
    hint: "Gmail- és Resend-fiókok felvétele a kiküldéshez",
  },
  {
    href: "/recent",
    label: "Legutóbbi keresések",
    hint: "Melyik céghez mit mentett a keresés vagy a bot",
  },
  {
    href: "/usage",
    label: "Tokenek",
    hint: "Mennyi tokent fogyott a keresés — export",
  },
  {
    href: "/history",
    label: "Változásnapló",
    hint: "Ki mit módosított — visszaállítható",
  },
  {
    href: "/debug",
    label: "Élő napló",
    hint: "A szerver naplója valós időben",
  },
];

const PROVIDERS: [SearchProviderChoice, string][] = [
  ["openai", "OpenAI"],
  ["claude", "Claude"],
  ["codex", "Codex"],
];

const MAIL_MODES: [MailMode, string][] = [
  ["mailto", "Levelező app"],
  ["gmail", "Gmail"],
];

/**
 * A közös felső sáv minden oldalon. Navigáció és beállítás külön: a linkek
 * balra, csoportosítva; a motor és a levelező választása a ⚙ menüben.
 */
export default function AppNav() {
  const pathname = usePathname();
  const [menu, setMenu] = useState<MenuKey | null>(null);
  const [mailMode, chooseMailMode] = useMailMode();
  const [provider, chooseProvider] = useSearchProvider();
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Kattintás máshová vagy Escape bezárja a nyitott menüt.
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (
        event.type === "mousedown" &&
        (event.target as HTMLElement).closest("[data-nav-menu]")
      ) {
        return;
      }
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      setMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const groupActive = (links: NavLink[]) =>
    links.some((link) => isActive(link.href));

  const syncPdfs = async () => {
    if (
      !window.confirm(
        "Újratölti a PDF-ekből kinyert sorokat. A saját állapot (kész, elküldve, kézi szerkesztések) megmarad. Mehet?",
      )
    ) {
      return;
    }
    setSyncing(true);
    setSyncNote(null);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Szinkronizálási hiba");
      setSyncNote(
        `Kész: ${data.inserted} új, ${data.updated} frissítve (összesen ${data.total}).`,
      );
      // A lista a saját állapotát tartja — a főoldalon újratöltjük, hogy látszódjon.
      if (pathname === "/") window.location.reload();
    } catch (error) {
      setSyncNote((error as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const linkClass = (active: boolean) =>
    `flex h-9 items-center whitespace-nowrap rounded-lg px-3 text-sm transition ${
      active
        ? "bg-[var(--surface-2)] text-foreground"
        : "text-[var(--muted)] hover:text-foreground"
    }`;

  const trigger = (key: MenuKey, label: string, active: boolean) => (
    <button
      type="button"
      data-nav-menu
      aria-haspopup="menu"
      aria-expanded={menu === key}
      onClick={() => setMenu((current) => (current === key ? null : key))}
      className={linkClass(active || menu === key)}
    >
      {label} <span className="ml-1 text-[11px]">▾</span>
    </button>
  );

  const dropdown = (key: MenuKey, links: NavLink[], extra?: React.ReactNode) =>
    menu === key ? (
      <div
        role="menu"
        data-nav-menu
        className="absolute inset-x-4 top-full z-50 mt-1 overflow-hidden rounded-lg sm:inset-x-auto sm:left-0 sm:w-72 border border-[var(--border)] bg-[var(--surface-2)] py-1 shadow-xl"
      >
        {links.map((link) => (
          <Link
            key={link.href}
            role="menuitem"
            href={link.href}
            onClick={() => setMenu(null)}
            className={`block px-3 py-2 text-sm transition hover:bg-blue-500/15 ${
              isActive(link.href) ? "text-blue-300" : ""
            }`}
          >
            {link.label}
            <span className="block text-[11px] text-[var(--muted)]">
              {link.hint}
            </span>
          </Link>
        ))}
        {extra}
      </div>
    ) : null;

  return (
    <nav className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-1 px-4 py-2 sm:px-6">
        <Link href="/" className="mr-3 whitespace-nowrap text-sm font-semibold">
          Melodia
        </Link>

        <Link href="/" className={linkClass(isActive("/"))}>
          Kontaktok
        </Link>
        <Link href="/mail" className={linkClass(isActive("/mail"))}>
          Levelezés
        </Link>

        <div className="sm:relative">
          {trigger("sourcing", "Beszerzés", groupActive(SOURCING))}
          {dropdown(
            "sourcing",
            SOURCING,
            <>
              <div className="my-1 border-t border-[var(--border)]" />
              <button
                type="button"
                role="menuitem"
                disabled={syncing}
                onClick={() => void syncPdfs()}
                className="block w-full px-3 py-2 text-left text-sm transition hover:bg-blue-500/15 disabled:opacity-50"
              >
                {syncing
                  ? "PDF-források újratöltése…"
                  : "PDF-források újratöltése"}
                <span className="block text-[11px] text-[var(--muted)]">
                  {syncNote ??
                    "Az állapot (kész, elküldve, szerkesztés) megmarad"}
                </span>
              </button>
            </>,
          )}
        </div>

        <div className="sm:relative">
          {trigger("system", "Rendszer", groupActive(SYSTEM))}
          {dropdown("system", SYSTEM)}
        </div>

        <div className="ml-auto sm:relative">
          {trigger("settings", "⚙ Beállítások", false)}
          {menu === "settings" ? (
            <div
              data-nav-menu
              className="absolute inset-x-4 top-full z-50 mt-1 space-y-3 rounded-lg sm:inset-x-auto sm:right-0 sm:w-72 border border-[var(--border)] bg-[var(--surface-2)] p-3 shadow-xl"
            >
              <fieldset className="space-y-1.5">
                <legend className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  E-mail keresés motorja
                </legend>
                <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
                  {PROVIDERS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={provider === value}
                      onClick={() => chooseProvider(value)}
                      className={`h-8 flex-1 text-xs transition ${
                        provider === value
                          ? "bg-cyan-600 text-white"
                          : "text-[var(--muted)] hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--muted)]">
                  A begyűjtő sávokban is átállítható.
                </p>
              </fieldset>

              <fieldset className="space-y-1.5">
                <legend className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  Hol nyíljon a kitöltött levél
                </legend>
                <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
                  {MAIL_MODES.map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={mailMode === mode}
                      onClick={() => chooseMailMode(mode)}
                      className={`h-8 flex-1 text-xs transition ${
                        mailMode === mode
                          ? "bg-blue-600 text-white"
                          : "text-[var(--muted)] hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--muted)]">
                  A sor ⋯ menüjének „Küldés” pontja és a panel küldés gombja ide
                  visz.
                </p>
              </fieldset>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
