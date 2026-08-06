import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import { site } from "@/lib/site";
import "./globals.css";

// The files live in src/fonts/ofl/ and are COMMITTED, so the build needs no network at
// all — not at runtime, and not at build time either. `next/font/google` would have
// fetched these from fonts.googleapis.com during `next build`, which fails on any host
// without egress: an air-gapped server, a locked-down CI runner. That was a real
// outage here (.agents/heal-ledger.md), and this is the fix.
// IBM Plex is OFL 1.1 — redistributable; each family's own OFL.txt ships beside it.
// Replace a face with `pnpm font --ofl "<Family>" <weights>`.
// Inter, Geist, Space Grotesk and Poppins are banned as primary faces —
// they are the loudest "AI generated this site" signal there is.
// Sans is ONE variable file covering 400-700 — Google serves the same bytes for every
// weight of a variable family, so per-weight files would be four identical copies.
// Mono is two static instances: genuinely different files, listed per weight.
const sans = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "../fonts/ofl/ibm-plex-sans-variable.woff2", weight: "400 700", style: "normal" },
  ],
});

const mono = localFont({
  variable: "--font-mono",
  display: "swap",
  src: [
    { path: "../fonts/ofl/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ofl/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
  ],
});

// All identity comes from src/lib/site.ts — edit it there, once.
export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.title,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  openGraph: {
    type: "website",
    url: site.url,
    siteName: site.name,
    title: site.title,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description: site.description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
