import RecentPanel from "@/components/RecentPanel";

export const metadata = { title: "Legutóbbi keresések — Melodia" };

export default function RecentPage() {
  return (
    <main className="flex-1">
      <RecentPanel />
    </main>
  );
}
