import { credential } from "../env";

/**
 * A források beállításai (kulcsok és finomhangolók) ugyanonnan jönnek, mint
 * minden más titok: helyben az `atlas-credentials.env`-ből, a telepített
 * példányon környezeti változóból. Ami nincs beállítva, az `undefined`.
 */
export function jobsEnv(name: string): string | undefined {
  return credential(name) || undefined;
}
