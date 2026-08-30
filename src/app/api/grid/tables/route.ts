import { NextRequest, NextResponse } from "next/server";
import { getTableHostApiUrl } from "@/lib/backend";

async function backendResponse(response: Response) {
  const body = await response.text();
  return new NextResponse(body || null, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}

export async function GET() {
  try {
    return backendResponse(await fetch(getTableHostApiUrl("grid/tables/"), { cache: "no-store" }));
  } catch {
    return NextResponse.json(
      { detail: "The table service is not available." },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    return backendResponse(
      await fetch(getTableHostApiUrl("grid/tables/"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: await request.text(),
        cache: "no-store",
      }),
    );
  } catch {
    return NextResponse.json(
      { detail: "The table service is not available." },
      { status: 503 },
    );
  }
}
