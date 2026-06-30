import type { Metadata, Viewport } from "next";
import "./globals.css";

// ─── PWA + SEO metadata ───────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "DealDash — MCA Operating System",
  description:
    "Funded deal tracking, pipeline management, follow-up queue, and live rate modeling for MCA brokers.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DealDash",
  },
};

// Theme color and viewport (separate from metadata per Next.js 14+ convention)
export const viewport: Viewport = {
  themeColor: "#155eef",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* iOS PWA icon — place a 180×180 PNG at /public/apple-touch-icon.png */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
