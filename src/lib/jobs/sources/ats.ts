/**
 * Az ATS-források regisztere.
 *
 * Közös jellemzőjük, hogy NEM tudnak keresni: cégenként adják a teljes
 * listát, a szűrés a mi dolgunk (`matchesQuery` a normalize.ts-ben).
 *
 * Mind saját modult kapott — ez a fájl már csak összefűzi őket.
 * A modulok közti különbségeket a CLAUDE.md táblázata írja le.
 */
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { ashby } from "./ashby";
import { recruitee } from "./recruitee";
import { personio } from "./personio";
import { workable } from "./workable";
import { smartrecruiters } from "./smartrecruiters";
import type { JobSource, SourceMeta } from "../types";

export const atsSources: JobSource[] = [
  greenhouse,
  lever,
  ashby,
  recruitee,
  workable,
  personio,
  smartrecruiters,
];

export const atsMeta: SourceMeta[] = atsSources.map((s) => s.meta);
