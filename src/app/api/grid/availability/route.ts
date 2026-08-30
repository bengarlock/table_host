import { NextRequest, NextResponse } from "next/server";
import { getTableHostApiUrl } from "@/lib/backend";

export async function GET(request: NextRequest) {
  const url = new URL(getTableHostApiUrl("grid/availability/"));
  url.search = request.nextUrl.search;

  try {
    const response = await fetch(url, { cache: "no-store" });
    return new NextResponse((await response.text()) || null, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json(
      { detail: "The reservation service is not available." },
      { status: 503 },
    );
  }
}
