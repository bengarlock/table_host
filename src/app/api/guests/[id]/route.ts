import { NextRequest, NextResponse } from "next/server";
import { getTableHostApiUrl } from "@/lib/backend";

async function backendResponse(response: Response) {
  const body = await response.text();
  return new NextResponse(body || null, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}

type GuestRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: GuestRouteContext) {
  const { id } = await context.params;
  try {
    return backendResponse(await fetch(getTableHostApiUrl(`grid/guests/${id}/`), { cache: "no-store" }));
  } catch {
    return NextResponse.json({ detail: "The guest database is not available." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest, context: GuestRouteContext) {
  const { id } = await context.params;
  try {
    return backendResponse(
      await fetch(getTableHostApiUrl(`grid/guests/${id}/`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: await request.text(),
        cache: "no-store",
      }),
    );
  } catch {
    return NextResponse.json({ detail: "The guest database is not available." }, { status: 503 });
  }
}
