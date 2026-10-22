import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_CATEGORIES = [
  "Technology",
  "Workshops",
  "Hackathons",
  "Cultural",
  "Music",
  "Sports",
  "Academic",
  "Seminars",
];

export async function GET() {
  try {
    const fromDb = await prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    if (fromDb.length > 0) {
      return NextResponse.json({ categories: fromDb.map((c) => c.name) });
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ categories: DEFAULT_CATEGORIES });
}
