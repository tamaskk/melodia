"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_LABELS, SOURCE_LABELS } from "@/data";
import { copyToClipboard } from "@/lib/clipboard";
import { companyLink, composeLink, type MailMode } from "@/lib/mailto";
import { KINDS, KIND_LABELS } from "@/lib/importSchema";
import { OUTCOMES, STAGE_BY_VALUE, stageOf } from "@/lib/stage";
import { PROFILE, shortIntro } from "@/lib/profile";
import { explainScore } from "@/lib/score";
import { COMPANY_SIZES } from "@/lib/types";
import type { EmailFinding } from "@/lib/emailFinder";
import type { CompanyPerson, ContactDoc } from "@/lib/types";

type Tab = "email" | "linkedin" | "connection";
type SaveState = "idle" | "saving" | "saved" | "error";

/** Fields the panel can edit; everything else is read-only metadata. */
interface Draft {
  company: string;
  person: string;
  role: string;
  primaryEmail: string;
  kind: string;
  size: string;
  note: string;
  emailSubject: string;
  emailBody: string;
  linkedinMessage: string;
  connectionRequest: string;
}

function toDraft(contact: ContactDoc): Draft {
  return {
    company: contact.company ?? "",
    person: contact.person ?? "",
    role: contact.role ?? "",
    primaryEmail: contact.primaryEmail ?? "",
    kind: contact.kind,
    size: contact.size ?? "",
    note: contact.note ?? "",
    emailSubject: contact.emailSubject ?? "",
    emailBody: contact.emailBody ?? "",
    linkedinMessage: contact.linkedinMessage ?? "",
    connectionRequest: contact.connectionRequest ?? "",
  };
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await copyToClipboard(text))) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs transition hover:border-blue-500"
    >
      {copied ? "Másolva ✓" : label}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  mono = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-blue-500 ${
          mono ? "font-mono text-xs" : ""
        }`}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-blue-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface AiDraft {
  subject: string;
  body: string;
  model: string;
}

export default function MessagePanel({
  contact,
  onClose,
  onPatch,
  onRestored,
  aiEnabled = false,
  emailSearchEnabled = false,
  provider = "openai",
  mailMode,
}: {
  contact: ContactDoc | null;
  onClose: () => void;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void> | void;
  onRestored?: (contact: ContactDoc) => void;
  aiEnabled?: boolean;
  /** A webes e-mail keresés a helyi Claude CLI-vel is mehet, OpenAI kulcs nélkül. */
  emailSearchEnabled?: boolean;
  /** Melyik motor keressen: OpenAI API vagy a helyi Claude CLI. */
  provider?: "openai" | "claude" | "codex";
  mailMode: MailMode;
}) {
  const [tab, setTab] = useState<Tab>("email");
  // Kézi kapcsolattartó-kutatás: prompt kifelé, beillesztett JSON befelé.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPaste, setManualPaste] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualNote, setManualNote] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualPeople, setManualPeople] = useState<CompanyPerson[] | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // AI proposal lives only in memory until it is accepted.
  const [instruction, setInstruction] = useState("");
  const [generating, setGenerating] = useState(false);
  const [proposal, setProposal] = useState<AiDraft | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Webes e-mail keresés — a találat csak javaslat, mentés elfogadáskor.
  const [finding, setFinding] = useState<EmailFinding | null>(null);
  const [searching, setSearching] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  // Ha egyszer már kerestünk és nem lett cím, külön kattintás kell az újrához.
  const [forceSearch, setForceSearch] = useState(false);
  const [hideSearch, setHideSearch] = useState(false);

  const openedId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, unknown>>({});

  // Reload the draft only when a different contact is opened, so an in-flight
  // save round-trip never overwrites what is being typed.
  useEffect(() => {
    if (!contact) {
      openedId.current = null;
      return;
    }
    if (openedId.current === contact._id) return;
    openedId.current = contact._id;
    setDraft(toDraft(contact));
    setSaveState("idle");
    setProposal(null);
    setAiError(null);
    setInstruction("");
    setFinding(null);
    setFindError(null);
    setForceSearch(false);
    setHideSearch(false);
    setTab(
      contact.primaryEmail || !contact.linkedinMessage ? "email" : "linkedin",
    );
  }, [contact]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const flush = useCallback(async () => {
    const id = openedId.current;
    const patch = pending.current;
    pending.current = {};
    if (!id || Object.keys(patch).length === 0) return;

    setSaveState("saving");
    try {
      await onPatch(id, patch);
      setSaveState("saved");
      setTimeout(
        () => setSaveState((state) => (state === "saved" ? "idle" : state)),
        1800,
      );
    } catch {
      setSaveState("error");
    }
  }, [onPatch]);

  /** Debounced autosave — every keystroke schedules a write ~600 ms later. */
  const edit = useCallback(
    (field: keyof Draft, value: string) => {
      setDraft((current) =>
        current ? { ...current, [field]: value } : current,
      );

      const nullable = ["person", "role", "primaryEmail", "note", "size"];
      pending.current[field] =
        nullable.includes(field) && value.trim() === "" ? null : value;

      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 600);
    },
    [flush],
  );

  // Never lose the last keystrokes when the panel closes.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
  }, [flush]);

  const generate = useCallback(async () => {
    const id = openedId.current;
    if (!id) return;
    setGenerating(true);
    setAiError(null);
    try {
      const response = await fetch(`/api/contacts/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Generálási hiba");
      setProposal(data as AiDraft);
    } catch (error) {
      setAiError((error as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [instruction]);

  const searchEmail = useCallback(async () => {
    const id = openedId.current;
    if (!id) return;
    setSearching(true);
    setFindError(null);
    setFinding(null);
    setHideSearch(false);
    try {
      const response = await fetch(`/api/contacts/${id}/find-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = (await response.json()) as EmailFinding & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Keresési hiba");
      setFinding(data);
      setForceSearch(false);
      // Üres PATCH-csel visszahúzzuk a friss sort, hogy a lista és a panel is
      // lássa a keresés nyomát (emailSearchedAt / emailSearchResult).
      void onPatch(id, {});
    } catch (error) {
      setFindError((error as Error).message);
    } finally {
      setSearching(false);
    }
  }, [onPatch, provider]);

  /** A megtalált cím beírása — a forrás URL-je a megjegyzésbe kerül. */
  const acceptEmail = useCallback(
    (email: string, source: string | null) => {
      edit("primaryEmail", email);
      if (source) {
        const current = draft?.note ?? "";
        const line = `e-mail forrása: ${source}`;
        if (!current.includes(source)) {
          edit("note", current ? `${current} · ${line}` : line);
        }
      }
      setFinding(null);
    },
    [draft, edit],
  );

  /** Keep the proposal: overwrite the letter and persist it right away. */
  const acceptProposal = useCallback(async () => {
    const id = openedId.current;
    if (!id || !proposal) return;
    setDraft((current) =>
      current
        ? {
            ...current,
            emailSubject: proposal.subject,
            emailBody: proposal.body,
          }
        : current,
    );
    setProposal(null);
    setSaveState("saving");
    try {
      await onPatch(id, {
        emailSubject: proposal.subject,
        emailBody: proposal.body,
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [onPatch, proposal]);

  const body = useMemo(() => {
    if (!draft) return "";
    if (tab === "email") return draft.emailBody;
    if (tab === "linkedin") return draft.linkedinMessage;
    return draft.connectionRequest;
  }, [draft, tab]);

  // Egy sikertelen keresés után a gomb tiltva marad, amíg rá nem bökünk a
  // "keressünk újra"-ra: ugyanaz a hívás kétszer ugyanazt a semmit hozná.
  // Élő találat, vagy ha nincs, az utoljára elmentett keresés — hogy a
  // panel újranyitásakor is meglegyen minden (űrlap link, további címek).
  const lastSearch = finding ?? contact?.emailSearch ?? null;

  // Interjú-brief: a frissen készült felülírja a sorban tároltat.
  const [briefOverride, setBriefOverride] =
    useState<ContactDoc["interviewBrief"]>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const brief =
    briefOverride &&
    contact &&
    briefOverride.at >= (contact.interviewBrief?.at ?? "")
      ? briefOverride
      : (contact?.interviewBrief ?? null);

  // Űrlapos jelentkezés: a mezők és a „másolva” visszajelzés.
  const [formCopied, setFormCopied] = useState<string | null>(null);
  const copyFormField = async (key: string, value: string) => {
    if (!(await copyToClipboard(value))) return;
    setFormCopied(key);
    setTimeout(() => setFormCopied(null), 1200);
  };
  const formPack: [string, string][] = contact
    ? [
        ["Név", PROFILE.name],
        ["E-mail", PROFILE.email],
        ["Telefon", PROFILE.phone],
        ["Város", PROFILE.city],
        ["GitHub", `https://${PROFILE.github}`],
        ["Portfólió", `https://${PROFILE.portfolio}`],
        ["Bemutatkozás", shortIntro(contact.language)],
        ["Motivációs levél", draft?.emailBody ?? contact.emailBody ?? ""],
      ]
    : [];

  // A régebbi mentett keresésekben ugyanaz a cím többször is szerepelhet (a
  // kereső több forrással sorolta fel). Itt szűrjük ki: enélkül React
  // kulcsütközés lesz belőle, és a felületen is duplán látszana.
  const alternatives = useMemo(() => {
    const seen = new Set<string>();
    return (lastSearch?.alternatives ?? []).filter((item) => {
      const email = item.email.trim().toLowerCase();
      if (!email || seen.has(email)) return false;
      seen.add(email);
      return true;
    });
  }, [lastSearch]);
  const savedSearchAt = finding ? null : (contact?.emailSearch?.at ?? null);
  const searchedEmpty =
    !forceSearch &&
    !finding &&
    !searching &&
    contact?.emailSearchResult === "none" &&
    !draft?.primaryEmail;
  const searchedLabel = contact?.emailSearchedAt
    ? new Date(contact.emailSearchedAt).toLocaleString("hu-HU", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  if (!contact || !draft) return null;

  const bodyField: keyof Draft =
    tab === "email"
      ? "emailBody"
      : tab === "linkedin"
        ? "linkedinMessage"
        : "connectionRequest";

  const tabs: { id: Tab; label: string; available: boolean }[] = [
    { id: "email", label: "E-mail", available: true },
    {
      id: "linkedin",
      label: "LinkedIn üzenet",
      available: Boolean(contact.linkedinMessage),
    },
    {
      id: "connection",
      label: "Kapcsolatkérés (300)",
      available: Boolean(contact.connectionRequest),
    },
  ];

  const saveLabel = {
    idle: "",
    saving: "mentés…",
    saved: "elmentve ✓",
    error: "mentési hiba",
  }[saveState];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Bezárás"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <aside className="animate-fade-in relative flex h-full w-full max-w-3xl flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--background)]">
        {/* Egyetlen görgetősáv: a fejléc is elgörgethető, ha megnő (pl. sok
            megtalált e-mail cím). A küldés-sáv kívül marad, mindig látszik. */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <header className="space-y-3 border-b border-[var(--border)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <a
                  href={companyLink(contact)}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-lg font-semibold text-blue-400 hover:underline"
                >
                  {draft.company || contact.company}
                </a>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5">
                    {SOURCE_LABELS[contact.source] ?? contact.source}
                  </span>
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5">
                    {KIND_LABELS[draft.kind as keyof typeof KIND_LABELS] ??
                      draft.kind}
                  </span>
                  <span>
                    {[
                      COUNTRY_LABELS[contact.country] ?? contact.country,
                      contact.city,
                      draft.size ? `${draft.size} fő` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span>
                    · {contact.language === "hu" ? "magyar" : "angol"}
                  </span>
                  {contact.manualFields?.length ? (
                    <span className="text-blue-300">· kézzel szerkesztve</span>
                  ) : null}
                </div>

                {/* Hol tart: a státusz a levelezésből és a kiküldésből jön, a
                  kimenetelt (interjú, elutasítva …) te rögzíted. */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span
                    title={STAGE_BY_VALUE[stageOf(contact)].hint}
                    className={`rounded-full border px-2 py-0.5 ${STAGE_BY_VALUE[stageOf(contact)].tone}`}
                  >
                    {STAGE_BY_VALUE[stageOf(contact)].label}
                  </span>
                  {contact.repliedAt ? (
                    <span className="text-[var(--muted)]">
                      válasz:{" "}
                      {new Date(contact.repliedAt).toLocaleDateString("hu-HU")}
                    </span>
                  ) : null}
                  <details className="text-[var(--muted)]">
                    <summary className="cursor-pointer">
                      illeszkedés: {explainScore(contact).score} pont
                    </summary>
                    <ul className="mt-1 space-y-0.5">
                      {explainScore(contact).reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </details>
                  <label className="ml-auto flex items-center gap-1.5 text-[var(--muted)]">
                    Kimenetel
                    <select
                      value={contact.outcome ?? ""}
                      onChange={(event) =>
                        void onPatch(contact._id, {
                          outcome: event.target.value || null,
                        })
                      }
                      className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-1.5 text-xs text-foreground outline-none focus:border-blue-500"
                      title="Kézzel rögzített eredmény. A „Ne keresd” sor soha nem kap kiküldött levelet."
                    >
                      <option value="">— nincs —</option>
                      {OUTCOMES.map((outcome) => (
                        <option key={outcome} value={outcome}>
                          {STAGE_BY_VALUE[outcome].label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`text-xs ${
                    saveState === "error"
                      ? "text-red-400"
                      : saveState === "saved"
                        ? "text-emerald-400"
                        : "text-[var(--muted)]"
                  }`}
                >
                  {saveLabel}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--muted)] hover:text-foreground"
                >
                  Esc
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field
                label="Cég"
                value={draft.company}
                onChange={(value) => edit("company", value)}
              />
              <Field
                label="E-mail cím"
                value={draft.primaryEmail}
                onChange={(value) => edit("primaryEmail", value)}
                placeholder="nincs — kézzel is beírhatod"
                mono
              />
              <Field
                label="Kapcsolattartó"
                value={draft.person}
                onChange={(value) => edit("person", value)}
                placeholder="—"
              />
              <Field
                label="Pozíció"
                value={draft.role}
                onChange={(value) => edit("role", value)}
                placeholder="—"
              />
              <SelectField
                label="Típus"
                value={draft.kind}
                onChange={(value) => edit("kind", value)}
                options={KINDS.map((kind) => ({
                  value: kind,
                  label: KIND_LABELS[kind],
                }))}
              />
              <SelectField
                label="Létszám"
                value={draft.size}
                onChange={(value) => edit("size", value)}
                options={[
                  { value: "", label: "nincs megadva" },
                  ...COMPANY_SIZES.map((size) => ({
                    value: size,
                    label: `${size} fő`,
                  })),
                ]}
              />
            </div>

            {emailSearchEnabled ? (
              <div className="space-y-2 rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void searchEmail()}
                    disabled={searching || searchedEmpty}
                    className={`h-8 rounded-lg px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      draft.primaryEmail || searchedEmpty
                        ? "border border-[var(--border)] text-[var(--muted)] hover:border-cyan-500 hover:text-foreground"
                        : "bg-cyan-600 text-white hover:bg-cyan-500"
                    }`}
                  >
                    {searching
                      ? "Keresés a weben…"
                      : searchedEmpty
                        ? "🔎 Már kerestem — nem volt találat"
                        : draft.primaryEmail
                          ? "🔎 Másik e-mail keresése"
                          : "🔎 E-mail keresése a weben"}
                  </button>

                  {searchedEmpty ? (
                    <button
                      type="button"
                      onClick={() => {
                        setForceSearch(true);
                        void searchEmail();
                      }}
                      className="h-8 rounded-lg border border-cyan-500/50 px-3 text-xs text-cyan-300 transition hover:bg-cyan-500/10"
                    >
                      Mégis, keressünk újra
                    </button>
                  ) : null}

                  <span className="text-[11px] text-[var(--muted)]">
                    {searchedEmpty
                      ? `Keresve: ${searchedLabel} — nem talált publikus címet.`
                      : contact.emailSearchedAt
                        ? `Legutóbb keresve: ${searchedLabel}.`
                        : draft.primaryEmail
                          ? "Van cím — csak akkor keress, ha jobbat akarsz."
                          : `${
                              provider === "claude"
                                ? "Helyi Claude CLI"
                                : provider === "codex"
                                  ? "Helyi Codex CLI"
                                  : "OpenAI"
                            } + webkeresés. Csak olyan címet ad vissza, amit forrással igazolni tud.`}
                  </span>
                </div>

                {searchedEmpty && contact.emailSearchNote ? (
                  <p className="text-[11px] text-[var(--muted)]">
                    Amit akkor talált: {contact.emailSearchNote}
                  </p>
                ) : null}

                {findError ? (
                  <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {findError}
                  </div>
                ) : null}

                {lastSearch && !hideSearch ? (
                  <div className="space-y-2 rounded-lg border border-cyan-500/50 bg-[var(--surface)] p-3 text-xs">
                    {lastSearch.email ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-cyan-200">
                          {lastSearch.email}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            lastSearch.confidence === "high"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : lastSearch.confidence === "medium"
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-red-500/20 text-red-300"
                          }`}
                        >
                          {lastSearch.confidence === "high"
                            ? "biztos — saját oldal"
                            : lastSearch.confidence === "medium"
                              ? "közepes — más forrás"
                              : "bizonytalan"}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            acceptEmail(lastSearch.email!, lastSearch.source)
                          }
                          className="h-8 rounded-lg bg-cyan-600 px-3 text-xs font-medium text-white transition hover:bg-cyan-500"
                        >
                          Beírom
                        </button>
                        <button
                          type="button"
                          onClick={() => setHideSearch(true)}
                          className="h-8 rounded-lg px-2 text-xs text-[var(--muted)] hover:text-foreground"
                        >
                          Elrejtem
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 text-[var(--muted)]">
                        Nem talált e-mail címet.
                        <button
                          type="button"
                          onClick={() => setHideSearch(true)}
                          className="h-8 rounded-lg px-2 text-xs hover:text-foreground"
                        >
                          Elrejtem
                        </button>
                      </div>
                    )}

                    {lastSearch.notes ? (
                      <p className="text-[var(--muted)]">{lastSearch.notes}</p>
                    ) : null}

                    {savedSearchAt ? (
                      <p className="text-[11px] text-[var(--muted)]">
                        Elmentett keresés ·{" "}
                        {new Date(savedSearchAt).toLocaleString("hu-HU")}
                        {lastSearch.model ? ` · ${lastSearch.model}` : ""}
                      </p>
                    ) : null}

                    {lastSearch.source ? (
                      <a
                        href={lastSearch.source}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-cyan-400 hover:underline"
                      >
                        Forrás: {lastSearch.source}
                      </a>
                    ) : null}

                    {lastSearch.applyUrl ? (
                      <a
                        href={lastSearch.applyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-amber-300 hover:underline"
                      >
                        Csak űrlap van: {lastSearch.applyUrl} ↗
                      </a>
                    ) : null}

                    {alternatives.length ? (
                      <div className="space-y-1 border-t border-[var(--border)] pt-2">
                        <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                          További címek
                        </div>
                        {alternatives.map((item) => (
                          <div
                            key={item.email}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <span className="font-mono text-cyan-200">
                              {item.email}
                            </span>
                            {item.label ? (
                              <span className="text-[var(--muted)]">
                                {item.label}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() =>
                                acceptEmail(item.email, item.source)
                              }
                              className="h-6 rounded-lg border border-[var(--border)] px-2 text-[11px] transition hover:border-cyan-500"
                            >
                              Beírom
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Interjú-brief: interjú státusznál (vagy ha már készült), egy oldal
                felkészülés a cég adataiból és a levélváltásból. */}
            {contact && (stageOf(contact) === "interju" || brief) ? (
              <div className="space-y-2 rounded-lg border border-sky-500/40 bg-sky-500/5 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-sky-300">
                    Interjú-brief
                  </span>
                  {brief ? (
                    <span className="text-[var(--muted)]">
                      {new Date(brief.at).toLocaleString("hu-HU", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {brief.model}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={briefBusy}
                    onClick={async () => {
                      setBriefBusy(true);
                      setBriefError(null);
                      try {
                        const response = await fetch(
                          `/api/contacts/${contact._id}/brief`,
                          { method: "POST" },
                        );
                        const data = await response.json();
                        if (!response.ok) throw new Error(data.error ?? "Hiba");
                        setBriefOverride(data.brief);
                      } catch (caught) {
                        setBriefError((caught as Error).message);
                      } finally {
                        setBriefBusy(false);
                      }
                    }}
                    className="ml-auto h-8 rounded-lg border border-sky-500/60 px-3 text-xs text-sky-200 transition hover:bg-sky-500/10 disabled:opacity-40"
                  >
                    {briefBusy
                      ? "Készül…"
                      : brief
                        ? "Újrakészítés"
                        : "Brief készítése"}
                  </button>
                </div>
                {briefError ? (
                  <p className="text-red-300">{briefError}</p>
                ) : null}
                {brief ? (
                  <div className="space-y-2">
                    {[
                      ["A cég", brief.company],
                      ["Kivel beszélsz", brief.people],
                      ["Hol tart", brief.situation],
                    ].map(([label, text]) => (
                      <p key={label}>
                        <span className="text-[var(--muted)]">{label}: </span>
                        {text}
                      </p>
                    ))}
                    {[
                      ["Várható kérdések", brief.expectedQuestions],
                      ["Kérdések tőled", brief.myQuestions],
                      ["Felkészülés", brief.prep],
                    ].map(([label, items]) => (
                      <div key={label as string}>
                        <div className="text-[var(--muted)]">
                          {label as string}
                        </div>
                        <ul className="ml-4 list-disc space-y-0.5">
                          {(items as string[]).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[var(--muted)]">
                    A cég adataiból, az első leveledből és a levélváltásból: mit
                    csinál a cég, kivel beszélsz, öt várható kérdés, három
                    kérdés tőled.
                  </p>
                )}
              </div>
            ) : null}

            {/* Űrlapos jelentkezés: ha a cég csak űrlapot ad, ne kelljen az
                adatokat öt helyről összeszedni. Minden mező egy kattintással
                másolható; a beküldés után egy gombbal lezárható. */}
            {lastSearch?.applyUrl ? (
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-amber-300">
                    Űrlapos jelentkezés
                  </span>
                  <a
                    href={lastSearch.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="h-8 rounded-lg bg-amber-600 px-2.5 text-xs font-medium leading-7 text-white transition hover:bg-amber-500"
                  >
                    Űrlap megnyitása ↗
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      void copyFormField(
                        "all",
                        formPack
                          .map(([label, value]) => `${label}: ${value}`)
                          .join("\n\n"),
                      )
                    }
                    className="h-8 rounded-lg border border-[var(--border)] px-2.5 text-xs transition hover:border-amber-500"
                  >
                    {formCopied === "all" ? "✓ Vágólapon" : "Mind másolása"}
                  </button>
                  {contact.tags.includes("urlapon-jelentkezve") ? (
                    <span className="ml-auto text-xs text-emerald-300">
                      Beküldve ✓
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void onPatch(contact._id, {
                          sent: true,
                          done: true,
                          tags: [
                            ...new Set([
                              ...contact.tags,
                              "urlapon-jelentkezve",
                            ]),
                          ],
                          __source: "űrlapos jelentkezés",
                        })
                      }
                      className="ml-auto h-8 rounded-lg border border-emerald-500/60 px-2.5 text-xs text-emerald-200 transition hover:bg-emerald-500/10"
                      title="Elküldöttnek jelöli a sort, urlapon-jelentkezve címkével"
                    >
                      Beküldtem ✓
                    </button>
                  )}
                </div>
                <dl className="divide-y divide-[var(--border)]/60 text-xs">
                  {formPack.map(([label, value]) => (
                    <div key={label} className="flex items-start gap-2 py-1">
                      <dt className="w-28 shrink-0 text-[var(--muted)]">
                        {label}
                      </dt>
                      <dd className="min-w-0 flex-1 truncate" title={value}>
                        {value || (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </dd>
                      <button
                        type="button"
                        disabled={!value}
                        onClick={() => void copyFormField(label, value)}
                        className="shrink-0 inline-flex h-8 items-center rounded-lg border border-[var(--border)] px-2 text-[11px] transition hover:border-amber-500 disabled:opacity-30"
                      >
                        {formCopied === label ? "✓" : "Másol"}
                      </button>
                    </div>
                  ))}
                </dl>
                <p className="text-[11px] text-[var(--muted)]">
                  A CV-t fájlként töltsd fel az űrlapon (attachments/ mappa).
                </p>
              </div>
            ) : null}

            {(manualPeople ?? contact.people)?.length ? (
              <div className="space-y-1 rounded-lg border border-violet-500/40 bg-violet-500/5 p-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-violet-300">
                    Kapcsolattartók —{" "}
                    {(manualPeople ?? contact.people ?? []).length} fő
                  </span>
                  <span className="text-[11px] text-[var(--muted)]">
                    {
                      (manualPeople ?? contact.people ?? []).filter(
                        (person) => person.category === "hr",
                      ).length
                    }{" "}
                    HR ·{" "}
                    {
                      (manualPeople ?? contact.people ?? []).filter(
                        (person) => person.category === "vezetes",
                      ).length
                    }{" "}
                    vezetés
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
                      <tr>
                        <th className="py-1 pr-2">Név</th>
                        <th className="py-1 pr-2">Pozíció</th>
                        <th className="py-1 pr-2">Kapcsolat</th>
                        <th className="py-1 text-right">Beírom</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(manualPeople ?? contact.people ?? []).map((person) => (
                        <tr
                          key={`${person.name}-${person.role}`}
                          className="border-t border-[var(--border)]/60 align-top"
                        >
                          <td className="py-1 pr-2">
                            <span className="font-medium">{person.name}</span>
                            <span
                              className={`ml-1 rounded-full px-1.5 text-[11px] ${
                                person.category === "hr"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : person.category === "vezetes"
                                    ? "bg-amber-500/15 text-amber-300"
                                    : "bg-[var(--surface-2)] text-[var(--muted)]"
                              }`}
                            >
                              {person.category === "hr"
                                ? "HR"
                                : person.category === "vezetes"
                                  ? "vezetés"
                                  : "egyéb"}
                            </span>
                          </td>
                          <td className="py-1 pr-2 text-[var(--muted)]">
                            {person.role}
                          </td>
                          <td className="py-1 pr-2">
                            <div className="flex flex-col gap-0.5">
                              {person.linkedinUrl ? (
                                <a
                                  href={person.linkedinUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-300 hover:underline"
                                >
                                  LinkedIn ↗
                                </a>
                              ) : null}
                              {person.email ? (
                                <span className="font-mono text-cyan-200">
                                  {person.email}
                                </span>
                              ) : null}
                              {person.source && !person.linkedinUrl ? (
                                <a
                                  href={person.source}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[var(--muted)] hover:underline"
                                >
                                  forrás ↗
                                </a>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-1 text-right">
                            {/* Egy kattintással ő lesz a sor kapcsolattartója. */}
                            <button
                              type="button"
                              onClick={() => {
                                edit("person", person.name);
                                edit("role", person.role);
                                if (person.email && !draft.primaryEmail) {
                                  edit("primaryEmail", person.email);
                                }
                                // A LinkedIn-cím nem szerkeszthető mező a
                                // piszkozatban, ezért közvetlenül mentjük.
                                if (person.linkedinUrl) {
                                  onPatch(contact._id, {
                                    linkedinUrl: person.linkedinUrl,
                                  });
                                }
                              }}
                              className="inline-flex h-8 items-center rounded-lg border border-[var(--border)] px-2 text-[11px] transition hover:border-violet-500"
                            >
                              Beírom
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {contact.peopleSearchNote ? (
                  <p className="text-[11px] text-[var(--muted)]">
                    {contact.peopleSearchNote}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  Kézi kapcsolattartó-kutatás
                </span>
                <span className="text-[11px] text-[var(--muted)]">
                  ha az automata nem talált — vidd át a promptot egy másik
                  eszközbe
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    setManualError(null);
                    const { buildManualPeoplePrompt } =
                      await import("@/lib/peoplePrompt");
                    const ok = await copyToClipboard(
                      buildManualPeoplePrompt(contact.company),
                    );
                    setManualNote(
                      ok
                        ? `Prompt a vágólapon (${contact.company}). Illeszd be egy kereső AI-ba, a válasz JSON-t ide hozd vissza.`
                        : "A vágólap nem elérhető — nyisd meg a mezőt, és onnan másold.",
                    );
                    if (!ok) setManualOpen(true);
                  }}
                  className="h-8 rounded-lg border border-violet-500/60 px-3 text-xs text-violet-200 transition hover:bg-violet-500/10"
                >
                  📋 Prompt másolása
                </button>
                <button
                  type="button"
                  onClick={() => setManualOpen((value) => !value)}
                  className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs transition hover:border-violet-500"
                >
                  {manualOpen ? "Beillesztés elrejtése" : "Válasz beillesztése"}
                </button>
              </div>

              {manualOpen ? (
                <div className="space-y-1.5">
                  <textarea
                    value={manualPaste}
                    onChange={(event) => setManualPaste(event.target.value)}
                    spellCheck={false}
                    rows={6}
                    placeholder={
                      '{"company": "' +
                      contact.company +
                      '", "profiles": [{"name": "…", "position": "…", "linkedin_url": "https://www.linkedin.com/in/…"}]}'
                    }
                    className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 font-mono text-[11px] outline-none focus:border-violet-500"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={manualBusy || !manualPaste.trim()}
                      onClick={async () => {
                        setManualBusy(true);
                        setManualError(null);
                        setManualNote(null);
                        try {
                          const response = await fetch(
                            `/api/contacts/${contact._id}/people`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ paste: manualPaste }),
                            },
                          );
                          const data = await response.json();
                          if (!response.ok)
                            throw new Error(data.error ?? "Mentési hiba");

                          setManualPeople(data.people as CompanyPerson[]);
                          setManualPaste("");
                          setManualOpen(false);
                          setManualNote(
                            `${data.added} fő mentve — a soron most ${data.people.length} kapcsolattartó van.` +
                              (data.companyMismatch
                                ? ` Figyelem: a JSON "${data.companyMismatch}" céget írt.`
                                : "") +
                              (data.skipped?.length
                                ? ` Megjegyzés: ${data.skipped.join(" · ")}`
                                : ""),
                          );
                        } catch (caught) {
                          setManualError((caught as Error).message);
                        } finally {
                          setManualBusy(false);
                        }
                      }}
                      className="h-8 rounded-lg bg-violet-600 px-3 text-xs font-medium text-white transition hover:bg-violet-500 disabled:opacity-40"
                    >
                      {manualBusy ? "Mentés…" : "Mentés a céghez"}
                    </button>
                    <span className="text-[11px] text-[var(--muted)]">
                      A meglévő embereket nem írja felül — névre egyesít.
                    </span>
                  </div>
                </div>
              ) : null}

              {manualNote ? (
                <p className="text-[11px] text-emerald-300">{manualNote}</p>
              ) : null}
              {manualError ? (
                <p className="text-[11px] text-red-300">{manualError}</p>
              ) : null}
            </div>

            <Field
              label="Megjegyzés"
              value={draft.note}
              onChange={(value) => edit("note", value)}
              placeholder="saját jegyzet…"
            />

            <div className="flex flex-wrap items-center gap-2">
              {contact.linkedinUrl ? (
                <a
                  href={contact.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs leading-8 transition hover:border-blue-500"
                >
                  LinkedIn profil ↗
                </a>
              ) : null}
              {contact.emails.length > 1 ? (
                <span className="text-xs text-[var(--muted)]">
                  További címek: {contact.emails.slice(1).join(", ")}
                </span>
              ) : null}
              {contact.manualFields?.length ? (
                <button
                  type="button"
                  onClick={async () => {
                    setSaveState("saving");
                    try {
                      const response = await fetch(
                        `/api/contacts/${contact._id}`,
                        { method: "POST" },
                      );
                      const data = await response.json();
                      if (!response.ok) throw new Error(data.error);
                      openedId.current = null; // force the draft to reload
                      setSaveState("saved");
                      onRestored?.(data.contact as ContactDoc);
                    } catch {
                      setSaveState("error");
                    }
                  }}
                  className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs text-[var(--muted)] transition hover:border-blue-500 hover:text-foreground"
                  title="A PDF-ből származó eredeti szöveg visszaállítása"
                >
                  Eredeti visszaállítása
                </button>
              ) : null}
              {contact.tags.length ? (
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </header>

          <div className="sticky top-0 z-10 flex gap-1 border-b border-[var(--border)] bg-[var(--background)] px-4 pt-3">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!item.available}
                onClick={() => setTab(item.id)}
                className={`rounded-t-lg px-3 py-2 text-sm transition disabled:opacity-30 ${
                  tab === item.id
                    ? "bg-[var(--surface)] text-foreground"
                    : "text-[var(--muted)] hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 p-4">
            {tab === "email" && aiEnabled ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/5 p-2">
                <input
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !generating) void generate();
                  }}
                  placeholder="Opcionális instrukció: pl. „emeld ki a fintech tapasztalatot”"
                  className="h-9 min-w-[220px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-violet-500"
                />
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={generating}
                  className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                  {generating ? "Generálás…" : "✨ Személyre szabott levél"}
                </button>
              </div>
            ) : null}

            {aiError ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {aiError}
              </div>
            ) : null}

            {proposal ? (
              <div className="flex flex-1 flex-col gap-2 rounded-lg border border-violet-500/50 bg-violet-500/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] text-violet-200">
                    AI-javaslat · {proposal.model}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    Még nincs elmentve. Elfogadásig az eredeti levél marad
                    érvényben.
                  </span>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                    Javasolt tárgy
                  </span>
                  <input
                    value={proposal.subject}
                    onChange={(event) =>
                      setProposal({ ...proposal, subject: event.target.value })
                    }
                    className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-violet-500"
                  />
                </label>

                <textarea
                  value={proposal.body}
                  onChange={(event) =>
                    setProposal({ ...proposal, body: event.target.value })
                  }
                  spellCheck={false}
                  className="min-h-[340px] resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-relaxed outline-none focus:border-violet-500"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void acceptProposal()}
                    className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500"
                  >
                    Elfogadom és mentem
                  </button>
                  <button
                    type="button"
                    onClick={() => setProposal(null)}
                    className="h-9 rounded-lg border border-[var(--border)] px-4 text-sm transition hover:border-red-500 hover:text-red-300"
                  >
                    Elvetem
                  </button>
                  <button
                    type="button"
                    onClick={() => void generate()}
                    disabled={generating}
                    className="h-9 rounded-lg border border-[var(--border)] px-4 text-sm transition hover:border-violet-500 disabled:opacity-50"
                  >
                    {generating ? "Generálás…" : "Újragenerálás"}
                  </button>
                  <span className="ml-auto text-xs text-[var(--muted)]">
                    {proposal.body.length} karakter
                  </span>
                </div>
              </div>
            ) : (
              <>
                {tab === "email" ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                      Tárgy
                    </span>
                    <input
                      value={draft.emailSubject}
                      onChange={(event) =>
                        edit("emailSubject", event.target.value)
                      }
                      className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-blue-500"
                    />
                  </label>
                ) : null}

                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                    {tab === "email"
                      ? "Levél szövege — szerkeszthető, automatikusan mentődik"
                      : "Üzenet szövege — szerkeszthető, automatikusan mentődik"}
                  </span>
                  <textarea
                    value={body}
                    onChange={(event) => edit(bodyField, event.target.value)}
                    spellCheck={false}
                    className="min-h-[320px] flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-relaxed outline-none focus:border-blue-500"
                  />
                </label>

                <div className="text-xs text-[var(--muted)]">
                  {body.length} karakter
                  {tab === "connection" ? (
                    <span className={body.length > 300 ? "text-red-400" : ""}>
                      {" "}
                      / 300 (LinkedIn limit)
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--background)] p-4">
          <a
            href={composeLink(
              {
                emails: contact.emails,
                primaryEmail: draft.primaryEmail || null,
                emailSubject: draft.emailSubject,
                emailBody: draft.emailBody,
              },
              mailMode,
            )}
            target={mailMode === "gmail" ? "_blank" : undefined}
            rel={mailMode === "gmail" ? "noreferrer" : undefined}
            onClick={() => onPatch(contact._id, { sent: true })}
            title={
              draft.primaryEmail
                ? `${mailMode === "gmail" ? "Gmail" : "Levél"}: ${draft.primaryEmail}`
                : "A levél tárggyal és szöveggel nyílik — a címzettet te írod be"
            }
            className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium leading-10 text-white transition hover:bg-blue-500"
          >
            {draft.primaryEmail
              ? mailMode === "gmail"
                ? "Küldés Gmailben ↗"
                : "Küldés e-mailben ↗"
              : mailMode === "gmail"
                ? "Megnyitás Gmailben ↗"
                : "Megnyitás levelezőben ↗"}
          </a>
          <CopyButton text={body} label="Szöveg másolása" />
          <CopyButton text={draft.emailSubject} label="Tárgy másolása" />
          {draft.primaryEmail ? (
            <CopyButton text={draft.primaryEmail} label="Cím másolása" />
          ) : null}

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => onPatch(contact._id, { sent: !contact.sent })}
              className={`h-9 rounded-lg border px-4 text-sm transition ${
                contact.sent
                  ? "border-amber-500 bg-amber-500/15 text-amber-300"
                  : "border-[var(--border)] hover:border-amber-500"
              }`}
            >
              {contact.sent ? "Elküldve ✓" : "Megjelölés küldöttként"}
            </button>
            <button
              type="button"
              onClick={() => onPatch(contact._id, { done: !contact.done })}
              className={`h-9 rounded-lg border px-4 text-sm transition ${
                contact.done
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                  : "border-[var(--border)] hover:border-emerald-500"
              }`}
            >
              {contact.done ? "Kész ✓" : "Kész"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
