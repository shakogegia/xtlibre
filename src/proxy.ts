import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

function getSecret(): Uint8Array {
  const password = process.env.AUTH_PASSWORD
  if (!password) throw new Error("AUTH_PASSWORD env var is required")
  return new TextEncoder().encode(password)
}

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  // Session cookie
  const session = request.cookies.get("session")
  if (session?.value) {
    try {
      await jwtVerify(session.value, getSecret())
      return true
    } catch {}
  }

  // HTTP Basic Auth (e-readers, OPDS clients)
  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Basic ")) {
    return true // let the route handler verify credentials
  }

  // URL download token (OPDS acquisition links)
  const token = request.nextUrl.searchParams.get("token")
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecret())
      if (payload.purpose === "opds-download") return true
    } catch {}
  }

  return false
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let OPDS handle its own auth (Basic Auth + session cookie)
  // so the route can return 401 + WWW-Authenticate to trigger the browser prompt
  if (pathname === "/opds") {
    return NextResponse.next()
  }

  // Check session cookie
  if (await isAuthenticated(request)) {
    // If authenticated user visits /login, redirect to home
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url))
    }
    return NextResponse.next()
  }

  // Not authenticated — redirect to login
  return NextResponse.redirect(new URL("/login", request.url))
}

export const config = {
  matcher: [
    // Match all paths except: /login, /api/auth/*, static files, images, favicon
    "/((?!login|api/auth|_next/static|_next/image|favicon\\.ico|lib/).*)",
  ],
}
