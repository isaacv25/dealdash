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

// Blocking inline script that runs BEFORE first paint -- reads the theme preference from
// localStorage and stamps data-theme on <html> immediately, so the correct palette is applied on
// initial paint instead of a light-to-dark flash after hydration. Safe to inline (small, no user
// data, deterministic) and safe against missing localStorage on old browsers.
const themeInitScript = `(() => {
  try {
    var t = localStorage.getItem("dealdash.theme");
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
