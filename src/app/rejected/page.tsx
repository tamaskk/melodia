import MailApp from "@/components/MailApp";

export const metadata = { title: "Elutasítások — Melodia" };

export default function RejectedPage() {
  return (
    <main className="flex-1">
      <MailApp rejectedOnly />
    </main>
  );
}
