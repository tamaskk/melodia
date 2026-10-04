"use client";

import { useCallback, useSyncExternalStore } from "react";

export type SearchProviderChoice = "openai" | "claude" | "codex";

const KEY = "melodia:search-provider";
const listeners = new Set<() => void>();

function read(): SearchProviderChoice {
  if (typeof window === "undefined") return "openai";
  const stored = window.localStorage.getItem(KEY);
  return stored === "claude" || stored === "codex" ? stored : "openai";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * Melyik motor keressen e-mailt: OpenAI API vagy a helyi Claude CLI.
 * A választás a böngészőben marad, és minden keresési kéréssel elmegy.
 */
export function useSearchProvider(
  fallback: SearchProviderChoice = "openai",
): [SearchProviderChoice, (next: SearchProviderChoice) => void] {
  const provider = useSyncExternalStore(
    subscribe,
    read,
    () => fallback,
  );

  const choose = useCallback((next: SearchProviderChoice) => {
    window.localStorage.setItem(KEY, next);
    listeners.forEach((listener) => listener());
  }, []);

  return [provider, choose];
}
