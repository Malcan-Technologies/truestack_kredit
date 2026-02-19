import { ImageResponse } from "next/og";

export const alt = "TrueKredit - Loan Management Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 64,
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#f97316",
            marginBottom: 16,
          }}
        >
          TrueKredit
        </div>
        <div style={{ fontSize: 28, opacity: 0.9 }}>
          Multi-tenant loan management platform for lenders
        </div>
      </div>
    ),
    { ...size }
  );
}
