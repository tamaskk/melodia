/**
 * A remote board források regisztere.
 *
 * Mind kulcs nélküli, és mind saját modulban van — ez a fájl már csak
 * összefűzi őket. A modulok közti különbségeket a CLAUDE.md táblázata
 * írja le.
 */
import { jobicy } from "./jobicy";
import { remoteok } from "./remoteok";
import { arbeitnow } from "./arbeitnow";
import { fourdayweek } from "./fourdayweek";
import { himalayas } from "./himalayas";
import { remotive } from "./remotive";
import { workingnomads } from "./workingnomads";
import { wwr } from "./wwr";
import type { JobSource } from "../types";

export const remoteSources: JobSource[] = [
  remoteok,
  jobicy,
  himalayas,
  fourdayweek,
  remotive,
  workingnomads,
  arbeitnow,
  wwr,
];
