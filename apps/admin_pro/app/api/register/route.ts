import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Admin account registration is disabled. Ask your organization owner to invite you.",
    },
    { status: 403 }
  );
}
