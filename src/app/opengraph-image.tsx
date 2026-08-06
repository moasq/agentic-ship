import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

/**
 * The share card, rendered from code — first-party next/og, no design-tool export,
 * never stale: it derives from site.ts like every other identity surface.
 *
 * Colors are the Agentic Ship palette hardcoded, because this renders outside the CSS
 * pipeline — if you change the theme in globals.css, mirror the two values here.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = site.title;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 72,
          background: "#0c1211",
          color: "#e6edeb",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 18, height: 18, background: "#2dd4bf", borderRadius: 4 }} />
          <div style={{ fontSize: 32, color: "#93a5a0" }}>{site.name}</div>
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.15, marginTop: 24, maxWidth: 980 }}>
          {site.title}
        </div>
      </div>
    ),
    size,
  );
}
