"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MAIL_MODE_STORAGE_KEY, type MailMode } from "./mailto";

/**
 * localStorage-backed preference for where the send buttons open the letter.
 * useSyncExternalStore keeps SSR and the client in sync without a state-setting
 * effect: the server snapshot is always "mailto", the client reads storage.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): MailMode {
  return window.localStorage.getItem(MAIL_MODE_STORAGE_KEY) === "gmail"
    ? "gmail"
    : "mailto";
}

function getServerSnapshot(): MailMode {
  return "mailto";
}

export function useMailMode(): [MailMode, (mode: MailMode) => void] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setMode = useCallback((next: MailMode) => {
    window.localStorage.setItem(MAIL_MODE_STORAGE_KEY, next);
    for (const listener of listeners) listener();
  }, []);

  return [mode, setMode];
}
