import VillageMap from "@/components/VillageMap";
import { listAccounts } from "@/lib/accounts";
import { loadStoredAccounts } from "@/lib/accountStore";

export const metadata = { title: "Falu — Melodia" };
export const dynamic = "force-dynamic";

/** A falu: középen a főház, küldő fiókonként egy ház. Egyelőre statikus. */
export default async function VillagePage() {
  await loadStoredAccounts();
  const houses = listAccounts().map((account) => ({
    id: account.id,
    label: account.label || account.user,
  }));

  return (
    <main className="flex-1 bg-[#3e8948]">
      <VillageMap houses={houses} />
    </main>
  );
}
