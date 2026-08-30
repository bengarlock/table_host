import { NextRequest, NextResponse } from "next/server";
import { getTableHostApiUrl } from "@/lib/backend";

type RouteContext = { params: Promise<{ id: string }> };

async function forward(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const response = await fetch(getTableHostApiUrl(`grid/reservations/${id}/`), {
      method: request.method,
      headers: { "content-type": "application/json" },
      body: request.method === "PATCH" ? await request.text() : undefined,
      cache: "no-store",
    });
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}
