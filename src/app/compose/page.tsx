import ComposePanel from "@/components/ComposePanel";

export const metadata = { title: "Új levél — Melodia" };

export default function ComposePage() {
  return (
    <main className="flex-1">
      <ComposePanel />
    </main>
  );
}
