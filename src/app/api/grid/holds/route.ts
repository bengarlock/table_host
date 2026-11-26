import { NextRequest, NextResponse } from "next/server";
import { getTableHostApiUrl } from "@/lib/backend";

async function forward(url: URL | string, init: RequestInit) {
  try {
    const response = await fetch(url, { ...init, cache: "no-store" });
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

export async function GET(request: NextRequest) {
  const url = new URL(getTableHostApiUrl("grid/holds/"));
  url.search = request.nextUrl.search;
  return forward(url, { method: "GET" });
}

export async function POST(request: NextRequest) {
  return forward(getTableHostApiUrl("grid/holds/"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await request.text(),
  });
}

export async function DELETE(request: NextRequest) {
  const url = new URL(getTableHostApiUrl("grid/holds/"));
  url.search = request.nextUrl.search;
  return forward(url, { method: "DELETE" });
}
