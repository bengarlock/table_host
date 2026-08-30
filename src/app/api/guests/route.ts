import { NextRequest, NextResponse } from "next/server";
import { getTableHostApiUrl } from "@/lib/backend";

async function backendResponse(response: Response) {
  const body = await response.text();
  return new NextResponse(body || null, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(getTableHostApiUrl("grid/guests/"));
  url.search = request.nextUrl.search;

  try {
    return backendResponse(await fetch(url, { cache: "no-store" }));
  } catch {
    return NextResponse.json(
      { detail: "The guest database is not available." },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    return backendResponse(
      await fetch(getTableHostApiUrl("grid/guests/"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: await request.text(),
        cache: "no-store",
      }),
    );
  } catch {
    return NextResponse.json(
      { detail: "The guest database is not available." },
      { status: 503 },
    );
  }
}
