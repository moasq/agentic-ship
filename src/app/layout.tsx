import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font: no runtime request to Google,
// no layout shift, nothing extra to disclose in a privacy policy.
// Inter, Geist, Space Grotesk and Poppins are banned as primary faces —
// they are the loudest "AI generated this site" signal there is.
const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ShipKit — the frontend bundle that replaces your app builders",
    template: "%s · ShipKit",
  },
  description:
    "An agent-ready Next.js foundation: design tokens, component rules, security headers and seven skills. Built for the coding subscription you already pay for.",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "ShipKit",
    title: "ShipKit — the frontend bundle that replaces your app builders",
    description:
      "An agent-ready Next.js foundation: design tokens, component rules, security headers and seven skills.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ShipKit",
    description: "The frontend bundle that replaces your app builders.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
