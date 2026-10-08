import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { authMode, missingSettings, safeNext } from "@/lib/auth";

export const metadata = { title: "Belépés — Melodia" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const mode = authMode();
  // Jelszó nélküli helyi gépen nincs mibe belépni.
  if (mode === "open") redirect(next);

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <LoginForm
        next={next}
        missing={mode === "locked" ? missingSettings() : []}
      />
    </main>
  );
}
