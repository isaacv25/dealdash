import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dealdash",
  description: "Funding workflow dashboard for funded deals, pipeline management, follow-ups, and live rate modeling.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
