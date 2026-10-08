"use client";

import { useEffect, useState } from "react";
import { COUNTRY_LABELS, SOURCE_LABELS } from "@/data";
import { copyToClipboard } from "@/lib/clipboard";
import { companyLink, composeLink, type MailMode } from "@/lib/mailto";
import { STAGE_BY_VALUE, stageOf, type Stage } from "@/lib/stage";
import { explainScore } from "@/lib/score";
import type { ContactDoc } from "@/lib/types";
import { button } from "./ui";

type CopyKind = "subject" | "body" | "linkedin" | "short" | "all";

/** What each copy button puts on the clipboard. */
function copyText(contact: ContactDoc, kind: CopyKind): string {
  const subject = contact.emailSubject ?? "";
  const body = contact.emailBody ?? "";
  if (kind === "subject") return subject;
  if (kind === "body") return body;
  if (kind === "linkedin") return contact.linkedinMessage ?? body;
  if (kind === "short") return contact.connectionRequest ?? "";
  return `Tárgy: ${subject}\n\n${body}`;
}

interface CopyButton {
  kind: CopyKind;
  /** A ⋯ menüben megjelenő felirat. */
  menuLabel: string;
  hint: string;
  /** LinkedIn cuts connection requests at 300 characters. */
  overLimit?: boolean;
}

/**
 * Which copy buttons a row shows.
 * "LinkedIn" only appears when that message actually differs from the e-mail
 * one — for recruiters the PDF gives a single text for both channels.
 */
function copyButtons(contact: ContactDoc): CopyButton[] {
  const buttons: CopyButton[] = [
    {
      kind: "subject",
      menuLabel: "Tárgy másolása",
      hint: "A levél tárgyának másolása",
    },
    {
      kind: "body",
      menuLabel: "Levélszöveg másolása",
      hint:
        contact.linkedinMessage === contact.emailBody
          ? "A teljes üzenet másolása (e-mail és LinkedIn ugyanaz)"
          : "Az e-mailes levél szövegének másolása",
    },
  ];

  if (
    contact.linkedinMessage &&
    contact.linkedinMessage !== contact.emailBody
  ) {
    buttons.push({
      kind: "linkedin",
      menuLabel: "LinkedIn-üzenet másolása",
      hint: "A rövidebb LinkedIn-üzenet másolása",
    });
  }

  if (contact.connectionRequest) {
    const length = contact.connectionRequest.length;
    buttons.push({
      kind: "short",
      menuLabel: `Kapcsolatkérés másolása (${length}/300)`,
      hint:
        length > 300
          ? `Kapcsolatkérés: ${length} / 300 karakter — hosszabb a LinkedIn limitnél, rövidítsd a panelben`
          : `Kapcsolatkérés: ${length} / 300 karakter`,
      overLimit: length > 300,
    });
  }

  buttons.push({
    kind: "all",
    menuLabel: "Tárgy + szöveg másolása",
    hint: "Tárgy + e-mail szöveg egyben",
  });
  return buttons;
}

/** Lezárt állapotok: halványítva, hogy a nyitott munka kiemelkedjen. */
const CLOSED = new Set<Stage>([
  "kesz",
  "elkuldve",
  "elutasitva",
  "nem-aktualis",
  "ne-keresd",
]);

export default function ContactTable({
  contacts,
  loading = false,
  onResetFilters,
  cursorId,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onPatch,
  onOpen,
  mailMode,
  startIndex = 0,
}: {
  contacts: ContactDoc[];
  /** Épp új listát töltünk — a régi sorok halványak, hogy látszódjon. */
  loading?: boolean;
  /** Üres eredménynél a „Szűrők törlése” gomb ezt hívja. */
  onResetFilters?: () => void;
  /** A billentyűzetes kurzor sora (j/k) — kiemelve. */
  cursorId?: string;
  selected: Set<string>;
  /** `range: true` — Shift-tel kattintva a legutóbbi kijelöléstől eddig. */
  onToggleSelect: (id: string, index: number, range: boolean) => void;
  onToggleSelectAll: () => void;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onOpen: (contact: ContactDoc) => void;
  mailMode: MailMode;
  /** Hányadik sornál kezdődik ez az oldal — a sorszám a teljes listára szól. */
  startIndex?: number;
}) {
  const allSelected = contacts.length > 0 && selected.size === contacts.length;
  const [copied, setCopied] = useState<`${string}:${CopyKind}` | null>(null);
  // A ⋯ menü: melyik soré, és hová nyíljon. Fix pozíció, hogy a táblázat
  // vízszintes görgetése ne vágja le az utolsó sorokon.
  const [menu, setMenu] = useState<{
    id: string;
    top: number;
    right: number;
  } | null>(null);

  // Kattintás máshová, Escape vagy görgetés bezárja.
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (
        event.type === "mousedown" &&
        (event.target as HTMLElement).closest("[data-row-menu]")
      ) {
        return;
      }
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      setMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const menuContact = menu
    ? contacts.find((item) => item._id === menu.id)
    : null;

  const copy = async (contact: ContactDoc, kind: CopyKind) => {
    const ok = await copyToClipboard(copyText(contact, kind));
    if (!ok) return;
    setCopied(`${contact._id}:${kind}`);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div
      className="relative overflow-x-auto border-t border-[var(--border)]"
      aria-busy={loading}
    >
      {/* Betöltés: vékony sáv a fejléc fölött + halványított sorok — a régi
          sorok látszanak, de egyértelmű, hogy frissülnek. */}
      {loading ? (
        <div
          role="progressbar"
          aria-label="A lista frissül"
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-blue-500/15"
        >
          <div className="animate-progress h-full w-2/5 rounded-full bg-blue-400" />
        </div>
      ) : null}
      {/* Mobilon kártyák: cég, státusz, cím, kapcsolattartó és a két fő
          művelet — a 960 px-es táblázatot ott oldalra kellene görgetni. */}
      <ul
        className={`divide-y divide-[var(--border)] md:hidden ${loading ? "opacity-60" : ""}`}
      >
        {contacts.length === 0 ? (
          <li className="space-y-2 px-3 py-10 text-center text-sm">
            {loading ? (
              <span className="text-[var(--muted)]">Betöltés…</span>
            ) : (
              <>
                <p>Nincs ilyen sor.</p>
                {onResetFilters ? (
                  <button
                    type="button"
                    onClick={onResetFilters}
                    className={button("secondary", "sm")}
                  >
                    Szűrők törlése
                  </button>
                ) : null}
              </>
            )}
          </li>
        ) : null}
        {/* Asztalon ezt a táblázat fejlécének jelölőnégyzete adja. */}
        {contacts.length ? (
          <li className="px-3 py-1">
            <label className="flex items-center gap-2 py-1.5 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="size-4 accent-blue-500"
              />
              Az oldal mind a(z) {contacts.length} sorának kijelölése
            </label>
          </li>
        ) : null}
        {contacts.map((contact) => {
          const stage = stageOf(contact);
          return (
            <li key={contact._id} className="space-y-1.5 px-3 py-3">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(contact._id)}
                  onChange={() => onToggleSelect(contact._id, 0, false)}
                  aria-label={`${contact.company} kijelölése`}
                  className="mt-1 size-4 accent-blue-500"
                />
                <button
                  type="button"
                  onClick={() => onOpen(contact)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={`block truncate font-medium ${
                      CLOSED.has(stage) ? "text-blue-400/70" : "text-blue-400"
                    }`}
                  >
                    {contact.company}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted)]">
                    {[
                      COUNTRY_LABELS[contact.country] ?? contact.country,
                      contact.person ??
                        (contact.people?.length
                          ? `${contact.people.length} kapcsolattartó`
                          : null),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${STAGE_BY_VALUE[stage].tone}`}
                >
                  {STAGE_BY_VALUE[stage].label}
                </span>
              </div>
              <div className="flex items-center gap-2 pl-6">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--muted)]">
                  {contact.primaryEmail ?? "nincs cím"}
                </span>
                <button
                  type="button"
                  onClick={() => onPatch(contact._id, { done: !contact.done })}
                  className={button("secondary", "sm")}
                >
                  {contact.done ? "Kész ✓" : "Kész"}
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(contact)}
                  className={button("primary", "sm")}
                >
                  Megnyitás
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <table
        className={`hidden w-full min-w-[960px] border-collapse text-sm transition-opacity md:table ${
          loading ? "opacity-60" : ""
        }`}
      >
        <thead className="sticky top-0 z-10 bg-[var(--surface-2)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
          <tr>
            <th className="w-10 px-3 py-2.5">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                aria-label="Összes kijelölése"
                className="size-4 accent-blue-500"
              />
            </th>
            <th className="w-12 px-2 py-2.5 text-right">#</th>
            <th className="w-8 px-1 py-2.5" />
            <th className="px-3 py-2.5">Cég</th>
            <th className="px-3 py-2.5">Kapcsolattartó</th>
            <th className="px-3 py-2.5">E-mail</th>
            <th className="px-3 py-2.5">Státusz</th>
            <th className="px-3 py-2.5">Forrás</th>
            <th className="w-52 px-3 py-2.5 text-right">Műveletek</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact, index) => {
            // A soron egyetlen szín van: a státusz-badge. A lezártak halványak.
            const stage = stageOf(contact);

            return (
              <tr
                key={contact._id}
                data-row-id={contact._id}
                aria-current={cursorId === contact._id ? "true" : undefined}
                onClick={(event) => {
                  // Let the checkbox, star, links and action buttons win.
                  if (
                    (event.target as HTMLElement).closest(
                      "a, button, input, label, textarea, select",
                    )
                  ) {
                    return;
                  }
                  if (window.getSelection()?.toString()) return;
                  onOpen(contact);
                }}
                title="Kattints a sorra a részletekhez és a levél szerkesztéséhez"
                className={`cursor-pointer border-t border-[var(--border)] transition hover:bg-[var(--surface-2)]/60 ${
                  CLOSED.has(stage) ? "text-[var(--muted)]" : ""
                } ${cursorId === contact._id ? "outline outline-2 -outline-offset-2 outline-blue-400/80" : ""}`}
              >
                <td className="px-3 py-2.5 align-top">
                  <input
                    type="checkbox"
                    checked={selected.has(contact._id)}
                    // A Shift állapotát csak az egéresemény hordozza, ezért
                    // onClick-ben kezeljük; az onChange csak a React kedvéért van.
                    onClick={(event) =>
                      onToggleSelect(contact._id, index, event.shiftKey)
                    }
                    onChange={() => undefined}
                    aria-label={`${contact.company} kijelölése`}
                    title="Shift + kattintás: a legutóbb kijelölt sortól eddig mindet"
                    className="size-4 accent-blue-500"
                  />
                </td>

                <td className="px-2 py-2.5 align-top text-right font-mono text-xs tabular-nums text-[var(--muted)]">
                  {startIndex + index + 1}
                </td>

                <td className="px-1 py-2.5 align-top">
                  <button
                    type="button"
                    onClick={() =>
                      onPatch(contact._id, { starred: !contact.starred })
                    }
                    title="Csillagozás"
                    className={`text-base leading-none transition ${
                      contact.starred
                        ? "text-amber-400"
                        : "text-[var(--border)] hover:text-amber-400"
                    }`}
                  >
                    ★
                  </button>
                </td>

                <td className="px-3 py-2.5 align-top">
                  <a
                    href={companyLink(contact)}
                    target="_blank"
                    rel="noreferrer"
                    className={`font-medium hover:underline ${
                      CLOSED.has(stage) ? "text-blue-400/70" : "text-blue-400"
                    }`}
                  >
                    {contact.company}
                  </a>
                  <div className="text-xs text-[var(--muted)]">
                    {[
                      COUNTRY_LABELS[contact.country] ?? contact.country,
                      contact.city,
                      contact.size ? `${contact.size} fő` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {typeof contact.score === "number" ? (
                      <span
                        className="ml-1.5 tabular-nums"
                        title={`Illeszkedés: ${contact.score} pont\n${explainScore(contact).reasons.join("\n")}`}
                      >
                        · {contact.score} pont
                      </span>
                    ) : null}
                  </div>
                </td>

                <td className="px-3 py-2.5 align-top">
                  {/* Egy oszlop a kapcsolattartónak: a sor saját neve, vagy ha
                      nincs, a keresés talált emberei („3 fő · HR”). */}
                  {contact.person ? (
                    contact.linkedinUrl ? (
                      <a
                        href={contact.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {contact.person}
                      </a>
                    ) : (
                      <span>{contact.person}</span>
                    )
                  ) : contact.people?.length ? (
                    <button
                      type="button"
                      onClick={() => onOpen(contact)}
                      title={contact.people
                        .map((person) => `${person.name} — ${person.role}`)
                        .join("\n")}
                      className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] transition hover:border-blue-500"
                    >
                      {contact.people.length === 1
                        ? contact.people[0].name
                        : `${contact.people.length} fő`}
                      {contact.people.some((person) => person.category === "hr")
                        ? " · HR"
                        : ""}
                    </button>
                  ) : (
                    <span className="text-[var(--muted)]">—</span>
                  )}
                  {contact.person && contact.role ? (
                    <div className="text-xs text-[var(--muted)]">
                      {contact.role}
                    </div>
                  ) : null}
                  {contact.person && contact.people?.length ? (
                    <button
                      type="button"
                      onClick={() => onOpen(contact)}
                      className="text-xs text-[var(--muted)] hover:text-foreground hover:underline"
                    >
                      +{contact.people.length} talált ember
                    </button>
                  ) : null}
                </td>

                <td className="px-3 py-2.5 align-top font-mono text-xs">
                  {contact.primaryEmail ? (
                    <a
                      href={composeLink(contact, mailMode)}
                      target={mailMode === "gmail" ? "_blank" : undefined}
                      rel={mailMode === "gmail" ? "noreferrer" : undefined}
                      onClick={() => onPatch(contact._id, { sent: true })}
                      className="text-blue-400 hover:underline"
                    >
                      {contact.primaryEmail}
                    </a>
                  ) : contact.emailSearchResult === "none" ? (
                    <span
                      className="text-[var(--muted)]"
                      title={`Kerestem a weben, nem volt találat${
                        contact.emailSearchNote
                          ? ` — ${contact.emailSearchNote}`
                          : ""
                      }`}
                    >
                      🔎 kerestem, nincs cím
                    </span>
                  ) : (
                    <span className="text-[var(--muted)]">—</span>
                  )}
                  {(contact.emails?.length ?? 0) > 1 ? (
                    <div className="text-[var(--muted)]">
                      +{(contact.emails?.length ?? 0) - 1} további
                    </div>
                  ) : null}
                  {!contact.primaryEmail && contact.emailSearch?.applyUrl ? (
                    <a
                      href={contact.emailSearch.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="block text-amber-300 hover:underline"
                      title="A keresés csak jelentkezési űrlapot talált"
                    >
                      űrlap ↗
                    </a>
                  ) : null}
                  {!contact.primaryEmail &&
                  contact.emailSearch?.alternatives?.length ? (
                    <div
                      className="text-[var(--muted)]"
                      title={contact.emailSearch.alternatives
                        .map(
                          (item) =>
                            `${item.email}${item.label ? ` (${item.label})` : ""}`,
                        )
                        .join("\n")}
                    >
                      +{contact.emailSearch.alternatives.length} javasolt cím
                    </div>
                  ) : null}
                </td>

                <td className="px-3 py-2.5 align-top">
                  <span
                    title={
                      STAGE_BY_VALUE[stage].hint +
                      (contact.repliedAt
                        ? ` · ${new Date(contact.repliedAt).toLocaleDateString("hu-HU")}`
                        : "")
                    }
                    className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${STAGE_BY_VALUE[stage].tone}`}
                  >
                    {STAGE_BY_VALUE[stage].label}
                  </span>
                </td>

                <td className="px-3 py-2.5 align-top">
                  <span className="inline-block rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                    {SOURCE_LABELS[contact.source] ?? contact.source}
                  </span>
                </td>

                <td className="px-3 py-2.5 align-top">
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpen(contact)}
                      className={button("primary", "sm")}
                      title="A részletek, a levél szerkesztése, másolás és küldés"
                    >
                      Megnyitás
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onPatch(contact._id, { done: !contact.done })
                      }
                      className={`h-8 min-w-[4.75rem] whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition ${
                        contact.done
                          ? "border-[var(--border)] bg-[var(--surface-2)] text-foreground"
                          : "border-[var(--border)] text-[var(--muted)] hover:border-blue-500 hover:text-foreground"
                      }`}
                    >
                      {contact.done ? "Kész ✓" : "Kész"}
                    </button>

                    <button
                      type="button"
                      data-row-menu
                      aria-haspopup="menu"
                      aria-expanded={menu?.id === contact._id}
                      aria-label={`További műveletek: ${contact.company}`}
                      title="Küldés levelezőben, másolás"
                      onClick={(event) => {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        setMenu((current) =>
                          current?.id === contact._id
                            ? null
                            : {
                                id: contact._id,
                                top: rect.bottom + 4,
                                right: window.innerWidth - rect.right,
                              },
                        );
                      }}
                      className={`h-8 w-8 rounded-lg border text-base leading-none transition ${
                        menu?.id === contact._id
                          ? "border-blue-500 text-foreground"
                          : "border-[var(--border)] text-[var(--muted)] hover:border-blue-500 hover:text-foreground"
                      }`}
                    >
                      ⋯
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}

          {contacts.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-12 text-center">
                {loading ? (
                  <span className="text-[var(--muted)]">Betöltés…</span>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm">Nincs ilyen sor.</p>
                    <p className="text-xs text-[var(--muted)]">
                      A mostani szűrőkre egyetlen kontakt sem illik.
                    </p>
                    {onResetFilters ? (
                      <button
                        type="button"
                        onClick={onResetFilters}
                        className={`mt-1 ${button("secondary", "sm")}`}
                      >
                        Szűrők törlése
                      </button>
                    ) : null}
                  </div>
                )}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {menu && menuContact ? (
        <div
          role="menu"
          data-row-menu
          style={{ top: menu.top, right: menu.right }}
          className="fixed z-50 w-64 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] py-1 text-sm shadow-xl"
        >
          {/* Mindig kattintható: cím nélkül üres címzettel nyílik a levelező. */}
          <a
            role="menuitem"
            href={composeLink(menuContact, mailMode)}
            target={mailMode === "gmail" ? "_blank" : undefined}
            rel={mailMode === "gmail" ? "noreferrer" : undefined}
            onClick={() => {
              onPatch(menuContact._id, { sent: true });
              setMenu(null);
            }}
            className="block px-3 py-2 transition hover:bg-blue-500/15"
          >
            ✉️ Küldés {mailMode === "gmail" ? "Gmailben" : "levelezőben"}
            <span className="block text-[11px] text-[var(--muted)]">
              {menuContact.primaryEmail
                ? `${menuContact.primaryEmail} · elküldöttnek jelöli`
                : "nincs cím — a címzettet te írod be"}
            </span>
          </a>
          <div className="my-1 border-t border-[var(--border)]" />
          {copyButtons(menuContact).map(
            ({ kind, menuLabel, hint, overLimit }) => {
              const isCopied = copied === `${menuContact._id}:${kind}`;
              return (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  title={hint}
                  onClick={() => void copy(menuContact, kind)}
                  className={`block w-full px-3 py-1.5 text-left transition hover:bg-blue-500/15 ${
                    isCopied
                      ? "text-emerald-300"
                      : overLimit
                        ? "text-amber-300"
                        : ""
                  }`}
                >
                  {isCopied ? "✓ Vágólapon" : menuLabel}
                  {overLimit && !isCopied ? " — túl hosszú!" : ""}
                </button>
              );
            },
          )}
        </div>
      ) : null}
    </div>
  );
}
