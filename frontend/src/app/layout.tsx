import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DealDash - Book of Business Pipeline Dashboard",
  description:
    "Funded deal tracking, pipeline management, follow-up workflow, and live rate modeling for your book of business.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DealDash",
  },
};

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
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
