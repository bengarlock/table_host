import { NextResponse } from "next/server";
import { getTableHostApiUrl } from "@/lib/backend";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const response = await fetch(getTableHostApiUrl(`grid/reservations/${id}/history/`), {
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
