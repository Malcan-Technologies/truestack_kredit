import { ImageResponse } from "next/og";

export const alt = "TrueKredit - Loan Management Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL || "https://kredit.truestack.my";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 64,
          background: "#0A0A0A",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#FAFAFA",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <img
          src={`${baseUrl}/logo-dark.svg`}
          alt="TrueStack"
          width={220}
          height={57}
          style={{ marginBottom: 24 }}
        />
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#FAFAFA",
            marginBottom: 16,
          }}
        >
          TrueKredit
        </div>
        <div style={{ fontSize: 28, color: "#8C8C8C" }}>
          Multi-tenant loan management platform for lenders
        </div>
      </div>
    ),
    { ...size }
  );
}
