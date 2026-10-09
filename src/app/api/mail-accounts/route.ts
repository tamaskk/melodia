import { NextRequest, NextResponse } from "next/server";
import { accountOverview, getAccount, listAccounts } from "@/lib/accounts";
import {
  addStoredAccount,
  isSecretReady,
  removeStoredAccount,
  saveAccountSettings,
  type NewAccount,
} from "@/lib/accountStore";
import { credential } from "@/lib/env";
import { forgetTransporter } from "@/lib/mailer";
import { stopCampaign } from "@/lib/sendCampaign";
import { cleanSteps, type WarmupStep } from "@/lib/warmup";

export const dynamic = "force-dynamic";

/** A felfuttatás kézzel állított kezdete: `now`, vagy egy nem jövőbeli nap. */
function startFrom(input: unknown): string {
  if (input === "now") return new Date().toISOString();
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error("A kezdés ÉÉÉÉ-HH-NN alakú dátum legyen.");
  }
  // A nap dele: a naptári nap minden időzónában ugyanaz marad.
  const start = new Date(`${input}T12:00:00Z`);
  if (
    Number.isNaN(start.getTime()) ||
    start.getTime() > Date.now() + 86_400_000
  ) {
    throw new Error("A kezdés nem lehet a jövőben.");
  }
  return start.toISOString();
}

/** Minden küldő fiók, jelszó nélkül — és hogy mi van beállítva a felvételhez. */
export async function GET() {
  try {
    return NextResponse.json({
      accounts: await accountOverview(),
      // A Gmail-jelszó titkosításához, illetve a Resend-küldéshez kell.
      secretReady: isSecretReady(),
      resendReady: Boolean(credential("RESEND_API_KEY")),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

/**
 * Új fiók: `{ provider: "gmail", user, password, label }` vagy
 * `{ provider: "resend", user, name, label }`.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as NewAccount | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "A body JSON objektum legyen a fiók adataival." },
        { status: 400 },
      );
    }
    // Friss lista kell az ütközés-ellenőrzéshez.
    await accountOverview();
    const account = await addStoredAccount(
      body,
      listAccounts().map((item) => item.id),
    );
    return NextResponse.json({ account });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

/**
 * Beállítás: `{ id, warmup?: boolean, dailyMax?: number | null,
 * warmupSteps?: [{ untilDay, cap }] | null, warmupStart?: "ÉÉÉÉ-HH-NN" | "now" | null }`.
 * A `dailyMax` a fiók saját napi maximuma — kikapcsolt felfuttatásnál él.
 * `warmupSteps: null` = vissza a szolgáltató alapértelmezett lépcsőire;
 * `warmupStart: null` = a felfuttatás újra az első küldéstől számít.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      id?: unknown;
      warmup?: unknown;
      dailyMax?: unknown;
      warmupSteps?: unknown;
      warmupStart?: unknown;
    };
    const change: {
      warmup?: boolean;
      dailyMax?: number | null;
      warmupSteps?: WarmupStep[] | null;
      warmupStart?: string | null;
    } = {};
    try {
      if (body.warmupSteps === null) change.warmupSteps = null;
      else if (body.warmupSteps !== undefined) {
        change.warmupSteps = cleanSteps(body.warmupSteps);
      }
      if (body.warmupStart === null) change.warmupStart = null;
      else if (body.warmupStart !== undefined) {
        change.warmupStart = startFrom(body.warmupStart);
      }
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }
    if (typeof body.warmup === "boolean") change.warmup = body.warmup;
    if (body.dailyMax === null) change.dailyMax = null;
    else if (body.dailyMax !== undefined) {
      const max = Number(body.dailyMax);
      if (!Number.isInteger(max) || max < 1 || max > 100) {
        return NextResponse.json(
          { error: "A napi maximum 1 és 100 közötti egész szám legyen." },
          { status: 400 },
        );
      }
      change.dailyMax = max;
    }
    if (typeof body.id !== "string" || !Object.keys(change).length) {
      return NextResponse.json(
        {
          error:
            "A body legyen { id } és legalább egy beállítás: warmup, dailyMax, warmupSteps vagy warmupStart.",
        },
        { status: 400 },
      );
    }
    await accountOverview();
    const account = getAccount(body.id);
    if (!account) {
      return NextResponse.json({ error: "Nincs ilyen fiók." }, { status: 404 });
    }
    await saveAccountSettings(account.id, change);
    return NextResponse.json({ ok: true, id: account.id, ...change });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

/** Törlés: `{ id }`. Csak a felületen felvett fiók törölhető. */
export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: unknown };
    if (typeof body.id !== "string" || !body.id.trim()) {
      return NextResponse.json(
        { error: "Hiányzik a fiók azonosítója." },
        { status: 400 },
      );
    }
    await accountOverview();
    const account = getAccount(body.id);
    if (account && !account.stored) {
      return NextResponse.json(
        {
          error:
            "Ez a fiók az atlas-credentials.env fájlból jön — ott kell törölni, nem itt.",
        },
        { status: 400 },
      );
    }
    // Futó küldés ne maradjon fiók nélkül.
    if (account) {
      stopCampaign(account.id);
      forgetTransporter(account.id);
    }
    const removed = await removeStoredAccount(body.id);
    if (!removed) {
      return NextResponse.json({ error: "Nincs ilyen fiók." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
