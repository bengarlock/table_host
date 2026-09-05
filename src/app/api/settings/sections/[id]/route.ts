import { NextRequest, NextResponse } from "next/server";
import { getTableHostApiUrl } from "@/lib/backend";

async function forward(request: NextRequest, method: "PATCH" | "DELETE", id: string) {
  try {
    const response = await fetch(getTableHostApiUrl(`settings/sections/${id}/`), { method, headers: method === "PATCH" ? { "content-type": "application/json" } : undefined, body: method === "PATCH" ? await request.text() : undefined, cache: "no-store" });
    return new NextResponse((await response.text()) || null, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json" } });
  } catch { return NextResponse.json({ detail: "The settings service is not available." }, { status: 503 }); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { return forward(request, "PATCH", (await params).id); }
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { return forward(request, "DELETE", (await params).id); }
