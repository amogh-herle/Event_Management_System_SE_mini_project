import { NextResponse, type NextRequest } from "next/server";
import { isCrossSiteRequest } from "@/lib/csrf";
import { renewSessionValue, SESSION_IDLE_TIMEOUT_MS } from "@/lib/sessionEdge";

// SRSec 5.3 (CSRF) and 2.2 (30-minute idle session timeout).
export async function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    isCrossSiteRequest(request.method, request.headers.get("origin"), request.headers.get("host"))
  ) {
    return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
  }

  const response = NextResponse.next();
  const session = request.cookies.get("session")?.value;
  const secret = process.env.SESSION_SECRET;
  if (session && secret) {
    const renewed = await renewSessionValue(session, secret);
    if (renewed) {
      response.cookies.set("session", renewed, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: SESSION_IDLE_TIMEOUT_MS / 1000,
      });
    }
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
