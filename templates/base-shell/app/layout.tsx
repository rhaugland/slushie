import "./globals.css";
import type { Metadata } from "next";
import { Shell } from "@/components/shell";

export const metadata: Metadata = { title: "Client Project" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
