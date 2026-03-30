import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "slushie.machine",
  description: "Turn client meetings into deployed software",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0f1729] text-[#f1f5f9] antialiased">
        {children}
      </body>
    </html>
  );
}
