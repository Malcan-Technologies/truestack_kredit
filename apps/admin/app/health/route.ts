import { NextResponse } from "next/server";

/**
 * Health check endpoint for ALB/ELB target group health checks.
 * Returns 200 when the app is ready to serve traffic.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
