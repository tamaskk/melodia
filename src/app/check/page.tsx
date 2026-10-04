import CompanyCheck from "@/components/CompanyCheck";

export const metadata = { title: "Cégellenőrzés — Melodia" };

export default function CheckPage() {
  return (
    <main className="flex-1">
      <CompanyCheck />
    </main>
  );
}
