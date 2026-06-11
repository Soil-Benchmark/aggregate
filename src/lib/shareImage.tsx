import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

// Shared branded share-card renderer for the opengraph + twitter image routes.
// (The route-segment config — runtime/size/alt/contentType — must be literal
// exports in each route file, so those live there, not here.)
export const renderShareImage = () => {
  const svg = fs.readFileSync(
    path.join(process.cwd(), "public", "bubbles-orange.svg"),
    "utf8",
  );
  const bubbles = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 72,
          background: "#23263a",
          padding: 110,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bubbles} width={300} height={300} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 128,
              fontWeight: 700,
              color: "#f1f5f9",
              letterSpacing: -3,
              lineHeight: 1,
            }}
          >
            Aggregate
          </div>
          <div style={{ fontSize: 42, color: "rgba(255,255,255,0.7)", marginTop: 20 }}>
            Discover your local farm group
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
};
