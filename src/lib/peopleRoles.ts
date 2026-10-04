/**
 * Titulus → kategória. Külön fájlban, mert a felület is használja: a
 * `peopleFinder` szerveroldali (adatbázis, CLI), azt a kliensbe behúzni a teljes
 * MongoDB-drivert jelentené.
 */
import type { CompanyPerson } from "./types";

const HR_ROLE =
  /(hr|human resources|people|talent|recruit|toborz|személyzet|szemelyzet|munkaerő|munkaero|employer brand)/i;

const LEAD_ROLE =
  /(ceo|cto|coo|cfo|founder|co-?founder|owner|managing director|director|president|vezérigazgató|vezerigazgato|ügyvezető|ugyvezeto|tulajdonos|alapító|alapito|igazgató|igazgato|head of|vp of|vice president)/i;

export function categorise(role: string): CompanyPerson["category"] {
  if (HR_ROLE.test(role)) return "hr";
  if (LEAD_ROLE.test(role)) return "vezetes";
  return "egyeb";
}
