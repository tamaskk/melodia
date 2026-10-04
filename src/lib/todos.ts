/**
 * A főoldal „Teendők” sora: mi vár rád most. Mindegyik egy szűrő — kattintásra
 * pontosan azok a sorok jönnek. A számokat a szerver ugyanebből számolja
 * (`/api/stats?todos=1`), a teljes adatbázisra, nem a szűrt listára.
 */
import type { ContactFilters } from "./types";

export interface Todo {
  key: string;
  label: string;
  hint: string;
  filters: Partial<ContactFilters>;
  tone: string;
  /** Ha a teendőhöz saját panel is tartozik (pl. follow-up), azt is kinyitja. */
  panel?: string;
}

export const TODOS: Todo[] = [
  {
    key: "replies",
    label: "új válasz",
    hint: "Válasz jött, és még nem kezelted — a Válaszok panelen osztályozva, piszkozattal",
    filters: { reply: "new" },
    tone: "text-emerald-300",
    panel: "replies",
  },
  {
    key: "bounced",
    label: "visszapattant cím",
    hint: "A levél nem kézbesíthető — keress másik címet",
    filters: { stage: "visszapattant" },
    tone: "text-red-300",
  },
  {
    key: "followups",
    label: "esedékes follow-up",
    hint: "7+ napja ment levél, nem jött válasz — a Follow-up panelen jóváhagyható",
    filters: { followUp: "due" },
    tone: "text-amber-300",
    panel: "followup",
  },
  {
    key: "ready",
    label: "küldhető levél",
    hint: "Van címe, még nem ment ki levél és nincs lezárva",
    filters: { emailStatus: "found", stage: "uj" },
    tone: "text-blue-300",
  },
  {
    key: "forms",
    label: "űrlapos cég",
    hint: "Csak jelentkezési űrlapot találtunk — a panelen másolható adatcsomag",
    filters: { emailStatus: "suggested-form", stage: "uj" },
    tone: "text-amber-300",
  },
  {
    key: "unsearched",
    label: "cím nélkül, még nem kerestem",
    hint: "Nincs címe, és még nem futott rá keresés",
    filters: { emailStatus: "unsearched" },
    tone: "text-[var(--muted)]",
  },
];
