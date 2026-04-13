import { describe, expect, it } from "vitest";
import { pickBestTruestackKycSession } from "./truestackKycSessionPick.js";

type Session = {
  status: string;
  result: string | null;
  createdAt: Date;
  updatedAt: Date;
};

describe("pickBestTruestackKycSession", () => {
  it("prefers the latest created session over an older approved session", () => {
    const approved: Session = {
      status: "completed",
      result: "approved",
      createdAt: new Date("2026-04-10T10:00:00.000Z"),
      updatedAt: new Date("2026-04-10T10:05:00.000Z"),
    };
    const redoPending: Session = {
      status: "pending",
      result: null,
      createdAt: new Date("2026-04-11T09:00:00.000Z"),
      updatedAt: new Date("2026-04-11T09:00:00.000Z"),
    };

    expect(pickBestTruestackKycSession([approved, redoPending])).toEqual(redoPending);
  });

  it("keeps the newest approved session when the latest attempt completed successfully", () => {
    const oldApproved: Session = {
      status: "completed",
      result: "approved",
      createdAt: new Date("2026-04-10T10:00:00.000Z"),
      updatedAt: new Date("2026-04-10T10:05:00.000Z"),
    };
    const newApproved: Session = {
      status: "completed",
      result: "approved",
      createdAt: new Date("2026-04-11T09:00:00.000Z"),
      updatedAt: new Date("2026-04-11T09:10:00.000Z"),
    };

    expect(pickBestTruestackKycSession([oldApproved, newApproved])).toEqual(newApproved);
  });
});
