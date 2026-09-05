import { NextRequest, NextResponse } from "next/server";
import { getTableHostApiUrl } from "@/lib/backend";

async function forward(method: "GET" | "POST", body?: string) {
  try {
    const response = await fetch(getTableHostApiUrl("settings/servers/"), {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body,
      cache: "no-store",
    });
    return new NextResponse((await response.text()) || null, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json({ detail: "The settings service is not available." }, { status: 503 });
  }
}

export async function GET() { return forward("GET"); }
export async function POST(request: NextRequest) { return forward("POST", await request.text()); }
