import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppNav from "@/components/AppNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Melodia — megkeresés dashboard",
  description:
    "Céges és toborzói megkeresések nyilvántartása: e-mail, LinkedIn, státusz.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // A böngészőbővítmények (pl. a Google fordító) hozzányúlnak a <html>
    // attribútumaihoz még hidratálás előtt — ettől React-figyelmeztetés jön.
    // Ez nem a mi hibánk és nem is javítható kódból, csak elnémítható.
    <html
      lang="hu"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppNav />
        {children}
      </body>
    </html>
  );
}
