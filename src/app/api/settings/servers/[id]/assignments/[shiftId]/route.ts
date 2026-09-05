import { NextRequest, NextResponse } from "next/server";
import { getTableHostApiUrl } from "@/lib/backend";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; shiftId: string }> },
) {
  const { id, shiftId } = await params;
  try {
    const response = await fetch(getTableHostApiUrl(`settings/servers/${id}/assignments/${shiftId}/`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: await request.text(),
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
