/**
 * Forrás-egészség: egymást követő hibák számlálása, riasztási küszöbbel.
 *
 * Miért kell: a BA Jobsuche NEM hivatalos API (közösségi reverse-engineering),
 * és bármikor megszűnhet — ahogy a v4 endpoint már meg is szűnt. Egy néma
 * "0 találat" hetekig elrejtheti, hogy egy forrás valójában halott. Ez a
 * modul teszi láthatóvá.
 *
 * MEMÓRIÁBAN ÉL, folyamatonként. Szerver-újraindításkor nullázódik, és több
 * példány esetén példányonként külön számol — MVP-döntés, adatbázis nincs.
 * Ha a riasztás e-mailt vagy Slacket kell hogy küldjön, ide kell egy tartós
 * tároló, nem ide egy nagyobb Map.
 */

import { createLogger } from "../logger";

const log = createLogger("jobs");

/** Ennyi EGYMÁST KÖVETŐ hiba után riasztunk. */
export const ALERT_AFTER = 3;

interface Entry {
  consecutiveFailures: number;
  lastError?: string;
  lastFailureAt?: string;
  lastSuccessAt?: string;
}

const state = new Map<string, Entry>();

function entry(sourceId: string): Entry {
  let e = state.get(sourceId);
  if (!e) {
    e = { consecutiveFailures: 0 };
    state.set(sourceId, e);
  }
  return e;
}

export function recordSuccess(sourceId: string): void {
  const e = entry(sourceId);
  e.consecutiveFailures = 0;
  e.lastError = undefined;
  e.lastSuccessAt = new Date().toISOString();
}

/** @returns igaz, ha ezzel a hibával átléptük a riasztási küszöböt. */
export function recordFailure(sourceId: string, error: string): boolean {
  const e = entry(sourceId);
  e.consecutiveFailures++;
  e.lastError = error;
  e.lastFailureAt = new Date().toISOString();

  if (e.consecutiveFailures === ALERT_AFTER) {
    // Pontosan a küszöbnél logolunk, nem minden további hibánál — különben
    // egy tartósan halott forrás elárasztaná a logot.
    log.error(
      `a(z) "${sourceId}" forrás ${e.consecutiveFailures} egymást követő futáson hibázott. ` +
        `Utolsó hiba: ${error}`,
    );
  }
  return e.consecutiveFailures >= ALERT_AFTER;
}

export function isAlerting(sourceId: string): boolean {
  return (state.get(sourceId)?.consecutiveFailures ?? 0) >= ALERT_AFTER;
}

export function healthOf(sourceId: string): Entry {
  return { ...entry(sourceId) };
}

/** Tesztekhez és kézi visszaállításhoz. */
export function resetHealth(sourceId?: string): void {
  if (sourceId) state.delete(sourceId);
  else state.clear();
}
