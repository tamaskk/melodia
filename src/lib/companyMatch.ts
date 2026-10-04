/**
 * Cégnév-egyeztetés két forrás között.
 *
 * Ugyanaz a cég más listában más néven szerepel ("Régens" / "Régens Zrt.",
 * "Healzz" / "Healzz (Healzz2)", "Filter:max" / "filter:max Kft."), ezért az
 * összehasonlítás előtt levágjuk a jogi formát és a zárójeles kiegészítést.
 */

const LEGAL_FORM =
  /\s*\b(kft|bt|zrt|nyrt|kkt|ev|ltd|limited|gmbh|ag|inc|llc|bv|nv|sa|sas|srl|oy|ab|as|aps|spa|plc|co)\b\.?\s*$/gi;

function normalise(value: string): string {
  let name = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (let i = 0; i < 3; i += 1) name = name.replace(LEGAL_FORM, "");
  return name.replace(/[^a-z0-9]+/g, "");
}

/** A név összes értelmes olvasata: teljes, zárójel nélkül, zárójelen belül. */
export function companyAliases(company: string): string[] {
  const inside = [...company.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]);
  const outside = company.replace(/\([^)]*\)/g, " ");
  return [
    ...new Set([company, outside, ...inside].map(normalise).filter((value) => value.length >= 2)),
  ];
}

/** Ugyanaz a cég? Előtag-egyezés is elég, ha elég hosszú ("wozavezconsulting" ⊃ "wozavez"). */
export function sameCompany(a: string, b: string): boolean {
  const left = companyAliases(a);
  const right = companyAliases(b);
  return left.some((x) =>
    right.some(
      (y) =>
        x === y ||
        (x.length >= 5 && y.startsWith(x)) ||
        (y.length >= 5 && x.startsWith(y)),
    ),
  );
}

/** Kereséshez: az összes alias, amivel egy cég indexelhető. */
export function companyIndexKeys(country: string, company: string): string[] {
  return companyAliases(company).map((alias) => `${country.toUpperCase()}:${alias}`);
}
