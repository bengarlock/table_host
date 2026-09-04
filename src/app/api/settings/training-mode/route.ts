import { NextRequest, NextResponse } from "next/server";
import { getTableHostApiUrl } from "@/lib/backend";

async function forward(method: "GET" | "PATCH", body?: string) {
  try {
    const response = await fetch(getTableHostApiUrl("settings/training-mode/"), {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body,
      cache: "no-store",
    });
    return new NextResponse((await response.text()) || null, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "The settings service is not available." },
      { status: 503 },
    );
  }
}

export async function GET() {
  return forward("GET");
}

export async function PATCH(request: NextRequest) {
  return forward("PATCH", await request.text());
}
