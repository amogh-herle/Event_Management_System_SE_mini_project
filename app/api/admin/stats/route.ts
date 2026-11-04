import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPlatformStats } from "@/lib/stats";

// GET /api/admin/stats — FR-010b / UC-17: admin views platform-wide statistics.
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const category = searchParams.get("category");

  try {
    const stats = await getPlatformStats({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      category: category || undefined,
    });

    return NextResponse.json(stats, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    if (
      err.message?.includes("Invalid startDate") ||
      err.message?.includes("Invalid endDate") ||
      err.message?.includes("startDate must be before")
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to retrieve platform statistics" },
      { status: 500 }
    );
  }
}
