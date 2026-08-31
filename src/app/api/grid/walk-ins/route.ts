import { NextRequest, NextResponse } from "next/server";
import { getTableHostApiUrl } from "@/lib/backend";

export async function POST(request: NextRequest) {
  try {
    const response = await fetch(getTableHostApiUrl("grid/walk-ins/"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await request.text(),
      cache: "no-store",
    });
    return new NextResponse((await response.text()) || null, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json(
      { detail: "The walk-in service is not available." },
      { status: 503 },
    );
  }
}
