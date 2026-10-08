"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BulkTemplate from "./BulkTemplate";
import ContactTable from "./ContactTable";
import ExportBar from "./ExportBar";
import FilterBar, { type Facets } from "./FilterBar";
import MessagePanel from "./MessagePanel";
import StatsBar from "./StatsBar";
import SendPanel from "./SendPanel";
import SweepPanel from "./SweepPanel";
import PeopleSweepPanel from "./PeopleSweepPanel";
import { SOURCE_LABELS } from "@/data";
import { KINDS, KIND_LABELS } from "@/lib/importSchema";
import { useMailMode } from "@/lib/useMailMode";
import {
  useSearchProvider,
  type SearchProviderChoice,
} from "@/lib/useSearchProvider";
import type { ContactDoc, ContactFilters, Stats } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { TODOS } from "@/lib/todos";
import FollowUpPanel from "./FollowUpPanel";
import RepliesPanel from "./RepliesPanel";

const EMPTY_FILTERS: ContactFilters = {
  q: "",
  source: "",
  kind: "",
  channel: "",
  country: "",
  language: "",
  category: "",
  city: "",
  size: "",
  tag: "",
  hasEmail: "",
  emailSearched: "",
  emailStatus: "",
  contactStatus: "",
  stage: "",
  followUp: "",
  reply: "",
  sent: "",
  done: "",
  starred: "",
  sort: "score",
};

/** Új forrásnév → kulcsalak (kisbetű, kötőjel), hogy a szűrő is kezelni tudja. */
function toSourceKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** A motorok emberi neve — a gombokon és az üzenetekben ezt látod. */
export const PROVIDER_LABELS: Record<SearchProviderChoice, string> = {
  openai: "OpenAI API",
  claude: "helyi Claude CLI",
  codex: "helyi Codex CLI",
};

function toQuery(
  filters: ContactFilters,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, String(value));
  }
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("facets", "1");
  return params.toString();
}

const SHORTCUTS: [string, string][] = [
  ["j / k", "következő / előző sor (nyitott panelnél az is lép)"],
  ["Enter · o", "a sor megnyitása"],
  ["x", "kijelölés be/ki"],
  ["d", "kész be/ki"],
  ["/", "ugrás a keresőbe"],
  ["Esc", "panel / súgó bezárása"],
  ["?", "ez a súgó"],
];

type RunKey = "replies" | "send" | "followup" | "emails" | "people";

const RUNS: { key: RunKey; label: string; open: string }[] = [
  {
    key: "replies",
    label: "💬 Válaszok",
    open: "border-sky-500/70 bg-sky-500/10 text-sky-200",
  },
  {
    key: "send",
    label: "✉️ Kiküldés",
    open: "border-emerald-500/70 bg-emerald-500/10 text-emerald-200",
  },
  {
    key: "followup",
    label: "↩ Follow-up",
    open: "border-amber-500/70 bg-amber-500/10 text-amber-200",
  },
  {
    key: "emails",
    label: "🔎 E-mail begyűjtés",
    open: "border-cyan-500/70 bg-cyan-500/10 text-cyan-200",
  },
  {
    key: "people",
    label: "👤 Kapcsolattartók",
    open: "border-violet-500/70 bg-violet-500/10 text-violet-200",
  },
];

export default function Dashboard({
  initialContacts,
  initialTotal,
  initialStats,
  initialFacets,
  aiEnabled = false,
  emailSearchEnabled = false,
  defaultProvider = "openai",
}: {
  initialContacts: ContactDoc[];
  /** Hány sor van összesen szűrés nélkül — a lapozó kezdőértéke. */
  initialTotal?: number;
  initialStats: Stats;
  initialFacets: Facets;
  aiEnabled?: boolean;
  emailSearchEnabled?: boolean;
  /** Az env-ben beállított motor — ez a kezdőérték a választóban. */
  defaultProvider?: SearchProviderChoice;
}) {
  const [contacts, setContacts] = useState(initialContacts);
  const [stats, setStats] = useState(initialStats);
  const [facets, setFacets] = useState(initialFacets);
  // A szűrőre illő sorok valós száma — a lista 2000-nél elvágja, ez nem.
  const [matchCount, setMatchCount] = useState<number | null>(
    initialTotal ?? null,
  );
  const [filters, setFilters] = useState<ContactFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(50);
  // A törlés visszafordíthatatlan, ezért két kattintás kell hozzá.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newSource, setNewSource] = useState("");
  // Tömeges szövegcsere sablonból a kijelölt sorokra.
  const [templateOpen, setTemplateOpen] = useState(false);
  // Melyik futtató panel van nyitva (egyszerre egy), és melyik fut épp.
  const [panel, setPanel] = useState<RunKey | null>(null);
  const [running, setRunning] = useState<Record<RunKey, boolean>>({
    replies: false,
    send: false,
    followup: false,
    emails: false,
    people: false,
  });
  const reportRunning = useCallback((key: RunKey, active: boolean) => {
    setRunning((current) =>
      current[key] === active ? current : { ...current, [key]: active },
    );
  }, []);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(
    initialTotal ? Math.max(1, Math.ceil(initialTotal / 50)) : 1,
  );
  const [mailMode] = useMailMode();
  const [provider, chooseProvider] = useSearchProvider(defaultProvider);

  // A szűrt halmaz cím nélküli sorai — a statisztika szerint (nem a 2000-es lista).
  const missingEmailCount = Math.max(0, stats.total - stats.withEmail);

  // "sort" nem szűkít, ezért nem számít szűrőnek.
  const isFiltered = Object.entries(filters).some(
    ([key, value]) => Boolean(value) && key !== "sort",
  );

  const requestId = useRef(0);
  const lastQuery = useRef("");
  // A legutóbb kattintott sor — a Shift-es tartománykijelölés innen indul.
  const lastClicked = useRef<number | null>(null);

  const refreshStats = useCallback(
    async (next: ContactFilters = EMPTY_FILTERS) => {
      // A fejléc csempéi azt mutatják, ami a szűrő után maradt.
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) {
        if (value && key !== "sort") params.set(key, String(value));
      }
      const response = await fetch(`/api/stats?${params.toString()}`, {
        cache: "no-store",
      });
      if (response.ok) setStats(await response.json());
    },
    [],
  );

  const load = useCallback(
    async (next: ContactFilters, nextPage = 0, size = 50) => {
      const id = ++requestId.current;
      const query = toQuery(next, nextPage, size);
      lastQuery.current = query;
      setLoading(true);
      try {
        const response = await fetch(`/api/contacts?${query}`, {
          cache: "no-store",
        });
        const data = await response.json();
        // Lassan visszaérő, elavult válasz nem írhatja felül a friss listát.
        if (id !== requestId.current || query !== lastQuery.current) return;
        if (!response.ok) throw new Error(data.error ?? "Betöltési hiba");
        setContacts(data.contacts);
        lastClicked.current = null;
        setMatchCount(typeof data.total === "number" ? data.total : null);
        setPageCount(typeof data.pageCount === "number" ? data.pageCount : 1);
        if (data.facets) setFacets(data.facets);
      } catch (error) {
        setMessage((error as Error).message);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  // Debounced reload whenever a filter changes.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void load(filters, page, pageSize);
      void refreshStats(filters);
    }, 220);
    return () => clearTimeout(timer);
  }, [filters, load, page, pageSize, refreshStats]);

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      // Optimistic update so the row colour flips instantly.
      setContacts((current) =>
        current.map((contact) =>
          contact._id === id ? { ...contact, ...body } : contact,
        ),
      );
      try {
        const response = await fetch(`/api/contacts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Mentési hiba");
        setContacts((current) =>
          current.map((contact) =>
            contact._id === id ? (data.contact as ContactDoc) : contact,
          ),
        );
        void refreshStats(filters);
      } catch (error) {
        setMessage((error as Error).message);
        void load(filters, page, pageSize);
        throw error; // let the editor panel show a failed-save state
      }
    },
    [filters, load, page, pageSize, refreshStats],
  );

  const bulkPatch = useCallback(
    async (body: Record<string, unknown>) => {
      const ids = [...selected];
      if (!ids.length) return;
      setLoading(true);
      try {
        // Egy kérés, egy updateMany. Soronkénti PATCH-csel 900 kijelölt sor
        // percekig tartana, és az Atlas M0-t is megfektetné.
        const response = await fetch("/api/contacts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, patch: body, source: "tömeges művelet" }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Mentési hiba");
        setMessage(`${data.modified} sor módosítva.`);
        setSelected(new Set());
        await Promise.all([
          load(filters, page, pageSize),
          refreshStats(filters),
        ]);
      } catch (error) {
        setMessage((error as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [filters, load, page, pageSize, refreshStats, selected],
  );

  /** A teljes szűrt halmaz kijelölése — nem csak a látható oldal. */
  const selectAllFiltered = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(toQuery(filters, 0, 1));
      params.set("idsOnly", "1");
      const response = await fetch(`/api/contacts?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Betöltési hiba");
      setSelected(new Set(data.ids as string[]));
      lastClicked.current = null;
      setMessage(
        `${formatNumber(data.ids.length)} sor kijelölve a szűrés szerint.`,
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const bulkDelete = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setLoading(true);
    try {
      const response = await fetch("/api/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Törlési hiba");
      setSelected(new Set());
      setConfirmDelete(false);
      setOpenContactId((current) =>
        current && ids.includes(current) ? null : current,
      );
      setMessage(`${data.deleted} sor törölve az adatbázisból.`);
      await Promise.all([load(filters, page, pageSize), refreshStats(filters)]);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters, load, page, pageSize, refreshStats, selected]);

  /** A kijelölt cégeket egyesével viszi végig — a haladás a fenti dobozban. */
  const bulkFindEmails = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setLoading(true);
    try {
      const response = await fetch("/api/contacts/find-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, provider }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Keresési hiba");
      setSelected(new Set());
      setMessage(
        `Elindult: ${ids.length} cég, egyesével (${PROVIDER_LABELS[provider]}). ` +
          "A haladás a lista fölötti dobozban látszik, ott le is állítható.",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [provider, selected]);

  const openContact = useMemo(
    () => contacts.find((contact) => contact._id === openContactId) ?? null,
    [contacts, openContactId],
  );

  // A paneleknek adott szűrő és visszahívás azonosítója ne változzon minden
  // rendereléskor — különben az ő hatásaik újraindulnak, és pörögni kezd a lista.
  const panelFilters = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(filters).filter(
          ([key, value]) => value && key !== "sort",
        ),
      ) as Record<string, string>,
    [filters],
  );

  // A „Teendők” sor: a teljes adatbázisra, a szűrőtől függetlenül.
  const [todos, setTodos] = useState<Record<string, number> | null>(null);
  const loadTodos = useCallback(async () => {
    try {
      const response = await fetch("/api/stats?todos=1", { cache: "no-store" });
      if (response.ok)
        setTodos((await response.json()) as Record<string, number>);
    } catch {
      // a teendősor nem létfontosságú — a következő frissítés újrapróbálja
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void loadTodos(), 0);
    return () => clearTimeout(timer);
  }, [loadTodos]);

  const reload = useCallback(() => {
    void load(filters, page, pageSize);
    void refreshStats(filters);
    void loadTodos();
  }, [filters, load, page, pageSize, refreshStats, loadTodos]);

  // A szerver már a megfelelő oldalt küldi — itt nincs mit szeletelni.
  const currentPage = Math.min(page, pageCount - 1);
  const visible = contacts;

  // Billentyűzetes átnézés: j/k lép, Enter nyit, x jelöl, d kész, / keres.
  // A kurzor indexe az oldalon belül; lapváltás után a lista végére szorítjuk.
  const [cursor, setCursor] = useState<number | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const cursorIndex =
    cursor === null || !visible.length
      ? null
      : Math.min(cursor, visible.length - 1);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      // Gépelés közben semmi: a mezők, és az Enter a fókuszban lévő gombon.
      if (target.closest("input, textarea, select, [contenteditable='true']"))
        return;
      if (event.key === "Enter" && target.closest("button, a")) return;

      const focusRow = (index: number) => {
        const row = visible[index];
        if (!row) return;
        setCursor(index);
        document
          .querySelector(`[data-row-id="${row._id}"]`)
          ?.scrollIntoView({ block: "nearest" });
        // Nyitott panelnél a panel is lép: sorban át lehet nézni a cégeket.
        if (openContactId) setOpenContactId(row._id);
      };
      const current = cursorIndex === null ? null : visible[cursorIndex];

      switch (event.key) {
        case "j":
          focusRow(
            cursorIndex === null
              ? 0
              : Math.min(cursorIndex + 1, visible.length - 1),
          );
          break;
        case "k":
          focusRow(cursorIndex === null ? 0 : Math.max(cursorIndex - 1, 0));
          break;
        case "Enter":
        case "o":
          if (!current) return;
          setOpenContactId(current._id);
          break;
        case "x":
          if (!current) return;
          setConfirmDelete(false);
          setSelected((previous) => {
            const next = new Set(previous);
            if (next.has(current._id)) next.delete(current._id);
            else next.add(current._id);
            return next;
          });
          break;
        case "d":
          if (!current) return;
          void patch(current._id, { done: !current.done });
          break;
        case "/":
          document
            .querySelector<HTMLInputElement>('input[type="search"]')
            ?.focus();
          break;
        case "?":
          setShortcutsOpen((open) => !open);
          break;
        case "Escape":
          if (!shortcutsOpen) return;
          setShortcutsOpen(false);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, cursorIndex, openContactId, patch, shortcutsOpen]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 p-4 sm:p-6">
      {/* 1. szint: hol vagy, mit indíthatsz, mi vár rád. */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kontaktok</h1>
          <p className="text-sm text-[var(--muted)]">
            Cégvezetők, toborzók, ügynökségek és IT-cégek — szűrés, levél,
            kiküldés.
          </p>
        </div>
        {/* A három futtató panel egy sávban: nyugalomban csak a gombok látszanak,
            kattintásra nyílik egy. Rejtve is mountolva maradnak, hogy a futás
            állapota (a "fut" pötty) összecsukva is látsszon. */}
        <div className="flex flex-wrap items-center gap-2">
          {RUNS.filter((run) => run.key === "send" || emailSearchEnabled).map(
            (run) => {
              const isOpen = panel === run.key;
              return (
                <button
                  key={run.key}
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setPanel((current) =>
                      current === run.key ? null : run.key,
                    )
                  }
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition ${
                    isOpen
                      ? run.open
                      : "border-[var(--border)] text-[var(--muted)] hover:text-foreground"
                  }`}
                >
                  {running[run.key] ? (
                    <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
                  ) : null}
                  {run.label}
                  {running[run.key] ? (
                    <span className="text-emerald-300">· fut</span>
                  ) : null}
                  <span aria-hidden>{isOpen ? "▴" : "▾"}</span>
                </button>
              );
            },
          )}
        </div>
      </header>

      <div hidden={panel !== "replies"}>
        <RepliesPanel onChanged={reload} />
      </div>

      <div hidden={panel !== "followup"}>
        <FollowUpPanel onStarted={() => setPanel("send")} />
      </div>

      <div hidden={panel !== "send"}>
        <SendPanel
          filters={panelFilters}
          selectedIds={[...selected]}
          aiEnabled={aiEnabled}
          onSent={reload}
          onActiveChange={(active) => reportRunning("send", active)}
        />
      </div>

      {emailSearchEnabled ? (
        <div hidden={panel !== "emails"}>
          <SweepPanel
            provider={provider}
            onProviderChange={chooseProvider}
            filters={panelFilters}
            filteredCount={missingEmailCount}
            onFinished={reload}
            onActiveChange={(active) => reportRunning("emails", active)}
          />
        </div>
      ) : null}

      {emailSearchEnabled ? (
        <div hidden={panel !== "people"}>
          <PeopleSweepPanel
            provider={provider}
            onProviderChange={chooseProvider}
            filters={panelFilters}
            selectedIds={[...selected]}
            onFinished={reload}
            onActiveChange={(active) => reportRunning("people", active)}
          />
        </div>
      ) : null}

      {todos ? (
        <nav
          aria-label="Teendők"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
        >
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Teendők
          </span>
          {TODOS.filter((todo) => todos[todo.key]).map((todo) => (
            <button
              key={todo.key}
              type="button"
              title={todo.hint}
              onClick={() => {
                setPage(0);
                setFilters({ ...EMPTY_FILTERS, ...todo.filters });
                if (todo.panel) setPanel(todo.panel as RunKey);
              }}
              className="group flex items-baseline gap-1.5 max-sm:py-1.5"
            >
              <span className={`font-semibold tabular-nums ${todo.tone}`}>
                {formatNumber(todos[todo.key])}
              </span>
              <span className="text-[var(--muted)] underline-offset-4 group-hover:text-foreground group-hover:underline">
                {todo.label}
              </span>
            </button>
          ))}
        </nav>
      ) : null}

      <StatsBar
        stats={stats}
        filtered={isFiltered}
        totalAll={initialStats.total}
      />

      {/* 2. szint: a munkafelület — ez az egyetlen keret az oldalon. */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <FilterBar
          filters={filters}
          facets={facets}
          count={matchCount ?? contacts.length}
          shown={contacts.length}
          onChange={(patchFilters) => {
            setPage(0);
            setFilters((current) => ({ ...current, ...patchFilters }));
          }}
          onReset={() => {
            setPage(0);
            setFilters(EMPTY_FILTERS);
          }}
        />

        {selected.size > 0 ? (
          <div className="mx-3 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm">
            <span className="font-medium">{selected.size} kijelölve</span>

            {/* A fejléc jelölőnégyzete csak a látható oldalt jelöli ki; ez az
              egész szűrt halmazt, oldalakon át. */}
            {matchCount !== null && selected.size < matchCount ? (
              <button
                type="button"
                onClick={() => void selectAllFiltered()}
                className="h-8 rounded-lg border border-blue-400 px-3 text-xs text-blue-200 transition hover:bg-blue-500/20"
              >
                Mind a(z) {formatNumber(matchCount)} kijelölése
              </button>
            ) : null}
            {matchCount !== null &&
            selected.size >= matchCount &&
            matchCount > pageSize ? (
              <span className="text-xs text-blue-200">
                a teljes szűrt lista ki van jelölve
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => bulkPatch({ done: true })}
              className="h-8 rounded-lg border border-emerald-500 px-3 text-xs text-emerald-300"
            >
              Kész
            </button>
            <button
              type="button"
              onClick={() => bulkPatch({ done: false, sent: false })}
              className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs"
            >
              Visszaállítás
            </button>
            <button
              type="button"
              onClick={() => bulkPatch({ sent: true })}
              className="h-8 rounded-lg border border-amber-500 px-3 text-xs text-amber-300"
            >
              Elküldve
            </button>
            <button
              type="button"
              onClick={() => bulkPatch({ starred: true })}
              className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs"
            >
              Csillagozás
            </button>
            <button
              type="button"
              onClick={() => setTemplateOpen(true)}
              title="Egy sablon, {{cegnev}} típusú helyettesítőkkel — minden kijelölt cégnél a saját adataival."
              className="h-8 rounded-lg border border-blue-500/60 px-3 text-xs text-blue-300 transition hover:bg-blue-500/10"
            >
              ✎ Szöveg sablonból
            </button>

            {emailSearchEnabled ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => void bulkFindEmails()}
                title={`Egy prompt, ${selected.size} cég — ${PROVIDER_LABELS[provider]}`}
                className="h-8 rounded-lg border border-cyan-500/60 px-3 text-xs text-cyan-300 transition hover:bg-cyan-500/10 disabled:opacity-40"
              >
                🔎 E-mail keresése ({formatNumber(selected.size)}) — egyesével
              </button>
            ) : null}

            <span className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                Típus
              </span>
              <select
                value=""
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) return;
                  void bulkPatch({ kind: value });
                }}
                className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs outline-none focus:border-blue-500"
              >
                <option value="">Átsorolás…</option>
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </span>

            <span className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                Forrás
              </span>
              <select
                value=""
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) return;
                  void bulkPatch({ source: value });
                }}
                className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs outline-none focus:border-blue-500"
              >
                <option value="">Áthelyezés…</option>
                {[
                  ...new Set([
                    ...facets.sources,
                    ...Object.keys(SOURCE_LABELS),
                  ]),
                ]
                  .sort()
                  .map((value) => (
                    <option key={value} value={value}>
                      {SOURCE_LABELS[value] ?? value}
                    </option>
                  ))}
              </select>
              <input
                value={newSource}
                onChange={(event) => setNewSource(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  const key = toSourceKey(newSource);
                  if (!key) return;
                  setNewSource("");
                  void bulkPatch({ source: key });
                }}
                placeholder="vagy új forrás + Enter"
                className="h-8 w-40 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs outline-none focus:border-blue-500"
              />
            </span>

            {confirmDelete ? (
              <span className="flex items-center gap-2 rounded-lg border border-red-500/60 bg-red-500/10 px-2 py-1">
                <span className="text-xs text-red-200">
                  Végleg törlöd ezt a {formatNumber(selected.size)} sort az
                  adatbázisból?
                </span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void bulkDelete()}
                  className="h-8 rounded-lg bg-red-600 px-3 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  Igen, törlés
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="h-8 rounded-lg px-2 text-xs text-[var(--muted)] hover:text-foreground"
                >
                  Mégse
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="h-8 rounded-lg border border-red-500/60 px-3 text-xs text-red-300 transition hover:bg-red-500/10"
              >
                Törlés
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSelected(new Set());
                setConfirmDelete(false);
              }}
              className="ml-auto h-8 rounded-lg px-3 text-xs text-[var(--muted)] hover:text-foreground"
            >
              Kijelölés törlése
            </button>
          </div>
        ) : null}

        <ContactTable
          contacts={visible}
          loading={loading}
          onResetFilters={() => {
            setPage(0);
            setFilters(EMPTY_FILTERS);
          }}
          // A sorszám a teljes listára szól, nem az oldalon belüli helyre.
          startIndex={currentPage * pageSize}
          selected={selected}
          onToggleSelect={(id, index, range) => {
            setConfirmDelete(false);

            // A tartományt a frissítőn KÍVÜL számoljuk: az updater fejlesztői
            // módban kétszer fut, ott refet állítani hibás eredményt adna.
            const from = lastClicked.current;
            const turnOn = !selected.has(id);
            const targets =
              range && from !== null && from !== index
                ? visible
                    .slice(Math.min(from, index), Math.max(from, index) + 1)
                    .map((row) => row._id)
                : [id];

            setSelected((current) => {
              const next = new Set(current);
              for (const rowId of targets) {
                if (turnOn) next.add(rowId);
                else next.delete(rowId);
              }
              return next;
            });

            lastClicked.current = index;
          }}
          onToggleSelectAll={() => {
            setConfirmDelete(false);
            setSelected((current) =>
              current.size === visible.length
                ? new Set()
                : new Set(visible.map((contact) => contact._id)),
            );
          }}
          onPatch={patch}
          onOpen={(contact) => setOpenContactId(contact._id)}
          cursorId={
            cursorIndex === null ? undefined : visible[cursorIndex]?._id
          }
          mailMode={mailMode}
        />

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-3 py-2 text-sm">
          <label className="flex items-center gap-2 text-[var(--muted)]">
            Oldalméret
            <select
              value={pageSize}
              onChange={(event) => {
                setPage(0);
                setPageSize(Number(event.target.value));
              }}
              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-foreground"
            >
              {[25, 30, 40, 50, 100, 200, 1000].map((size) => (
                <option key={size} value={size}>
                  {size >= 1000 ? "Mind" : size}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className="h-9 rounded-lg border border-[var(--border)] px-3 text-xs text-[var(--muted)] transition hover:text-foreground"
            title="Billentyűparancsok (?)"
          >
            ⌨ Billentyűk
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              className="h-9 rounded-lg border border-[var(--border)] px-3 disabled:opacity-30"
            >
              ← Előző
            </button>
            <span className="tabular-nums text-[var(--muted)]">
              {formatNumber(currentPage + 1)} / {formatNumber(pageCount)} oldal
              · {formatNumber(matchCount ?? contacts.length)} sor
            </span>
            <button
              type="button"
              disabled={currentPage >= pageCount - 1}
              onClick={() =>
                setPage((value) => Math.min(pageCount - 1, value + 1))
              }
              className="h-9 rounded-lg border border-[var(--border)] px-3 disabled:opacity-30"
            >
              Következő →
            </button>
          </div>
        </div>
      </section>

      {templateOpen ? (
        <BulkTemplate
          ids={[...selected]}
          onClose={() => setTemplateOpen(false)}
          onApplied={(message) => {
            setMessage(message);
            void load(filters, page, pageSize);
          }}
        />
      ) : null}

      <ExportBar
        pageContacts={visible}
        selectedIds={selected}
        filteredTotal={matchCount ?? contacts.length}
        fetchFiltered={async () => {
          // A lista lapozott, ezért az export külön kéri le a teljes halmazt.
          const response = await fetch(
            `/api/contacts?${toQuery(filters, 0, 2000)}`,
            { cache: "no-store" },
          );
          const data = await response.json();
          return (data.contacts ?? []) as ContactDoc[];
        }}
      />

      <MessagePanel
        contact={openContact}
        onClose={() => setOpenContactId(null)}
        onPatch={patch}
        aiEnabled={aiEnabled}
        emailSearchEnabled={emailSearchEnabled}
        provider={provider}
        mailMode={mailMode}
        onRestored={(restored) => {
          setContacts((current) =>
            current.map((item) =>
              item._id === restored._id ? restored : item,
            ),
          );
          setMessage("Eredeti szöveg visszaállítva.");
        }}
      />

      {shortcutsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Billentyűparancsok"
            className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="mb-3 font-semibold">Billentyűparancsok</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              {SHORTCUTS.map(([keys, label]) => (
                <div key={keys} className="contents">
                  <dt>
                    <kbd className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-xs">
                      {keys}
                    </kbd>
                  </dt>
                  <dd className="text-[var(--muted)]">{label}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] text-[var(--muted)]">
              Gépelés közben (keresőben, a panel mezőiben) nem élnek.
            </p>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="animate-fade-in fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm shadow-lg">
          {message}
        </div>
      ) : null}
    </div>
  );
}
