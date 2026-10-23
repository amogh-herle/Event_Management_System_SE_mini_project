import { NextResponse } from "next/server";
import { clearSessionCookieHeader } from "@/lib/session";

export async function POST() {
  const response = NextResponse.json({ status: "ok" });
  response.headers.set("Set-Cookie", clearSessionCookieHeader());
  return response;
}
