import { createGateway } from "@ai-sdk/gateway";
import { experimental_decide as decide } from "ai";
import { credential } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("jev");

/**
 * Jev (TypeSafe AI) döntési modell a Vercel AI Gatewayen át.
 *
 * Adapter: a felület csak a `JevRun`-t ismeri, az AI SDK-t és a gatewayt nem.
 * Az `experimental_evaluate` az SDK 7.0.142-ben az `experimental_decide`
 * elavult álneve — ugyanaz a függvény, ezért az új nevet hívjuk.
 */

export const JEV_MODEL = "typesafe-ai/jev";

export class JevError extends Error {}

export interface JevRun {
  state: string;
  question: string;
  /** 0–1, két tizedesre kerekítve (ahogy a modell adja). */
  probability: number;
  /** A szerver felől mért teljes idő, hálózattal együtt. */
  elapsedMs: number;
  /** USD, ha a gateway visszaküldi; különben null. */
  cost: number | null;
  inputTokens: number | null;
  modelId: string;
  responseId: string | null;
  timestamp: string;
  warnings: unknown[];
  providerMetadata: unknown;
}

export function isJevReady(): boolean {
  return Boolean(credential("AI_GATEWAY_API_KEY"));
}

/** A gateway a költséget szövegként vagy számként adja, néven is többféleképp. */
function readCost(metadata: unknown): number | null {
  const gateway = (
    metadata as { gateway?: Record<string, unknown> } | undefined
  )?.gateway;
  for (const key of ["cost", "totalCost", "marketCost"]) {
    const value = Number(gateway?.[key]);
    if (gateway?.[key] != null && Number.isFinite(value)) return value;
  }
  return null;
}

/** A gateway hibájából emberi mondat; a gateway eredeti üzenete a végén marad. */
function humanError(error: unknown): string {
  const status = (error as { statusCode?: number }).statusCode;
  const original = error instanceof Error ? error.message : String(error);
  const hint = /credit card/i.test(original)
    ? "A Vercel AI Gateway csak akkor szolgál ki kéréseket, ha a fiókon van érvényes bankkártya. Add hozzá a Vercel felületén (az ingyenes kreditek ezzel nyílnak meg) — automatikusan nem vásárolunk."
    : /free tier/i.test(original)
      ? "Az ingyenes AI Gateway-kredit nem érvényes erre a modellre — fizetős kreditet kell feltölteni a Vercel AI Gateway oldalán (Buy Paid AI Gateway Credit). Automatikusan nem vásárolunk."
      : status === 401
        ? "A gateway nem fogadta el a kulcsot — ellenőrizd az AI_GATEWAY_API_KEY-t (lejárt vagy elgépelt?)."
        : status === 402
          ? "A Vercel fizetési adatot vagy kreditet kér. Ezt a Vercel felületén kell rendezni (bankkártya / kredit) — automatikusan nem vásárolunk."
          : status === 403
            ? "A fióknak nincs hozzáférése ehhez a modellhez, vagy ellenőrzés hiányzik a Vercelnél."
            : status === 429
              ? "Elérted a kulcs keretét vagy a sebességkorlátot. Várj, vagy emeld a keretet a Vercelnél."
              : "A Jev hívása nem sikerült.";
  return `${hint} (gateway: ${original})`;
}

/** Egy igen/nem kérdés a megadott állapotra. */
export async function askBoolean(
  state: string,
  question: string,
): Promise<JevRun> {
  const apiKey = credential("AI_GATEWAY_API_KEY");
  if (!apiKey) {
    throw new JevError(
      "Nincs AI_GATEWAY_API_KEY az atlas-credentials.env fájlban. Tedd bele, majd indítsd újra a szervert.",
    );
  }
  const gateway = createGateway({ apiKey });

  const started = performance.now();
  let result;
  try {
    result = await decide({
      model: gateway.decisionModel(JEV_MODEL),
      state,
      questions: {
        answer: { type: "boolean", instructions: question },
      },
    });
  } catch (error) {
    log.error("a gateway hibát adott", {
      ms: Math.round(performance.now() - started),
      status: (error as { statusCode?: number }).statusCode,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new JevError(humanError(error), { cause: error });
  }
  const elapsedMs = Math.round(performance.now() - started);
  log.info("döntés kész", {
    ms: elapsedMs,
    probability: result.answers.answer.probability,
  });

  return {
    state,
    question,
    probability: result.answers.answer.probability,
    elapsedMs,
    cost: readCost(result.providerMetadata),
    inputTokens: result.usage.inputTokens ?? null,
    modelId: result.response.modelId,
    responseId: (result.response as { id?: string }).id ?? null,
    timestamp: result.response.timestamp.toISOString(),
    warnings: [...(result.warnings ?? [])],
    providerMetadata: result.providerMetadata ?? null,
  };
}
