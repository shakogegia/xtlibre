import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

function getSecret(): Uint8Array {
  const password = process.env.AUTH_PASSWORD
  if (!password) throw new Error("AUTH_PASSWORD env var is required")
  return new TextEncoder().encode(password)
}

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const session = request.cookies.get("session")
  if (!session?.value) return false
  try {
    await jwtVerify(session.value, getSecret())
    return true
  } catch {
    return false
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow OPDS with Basic Auth (for e-reader devices)
  if (pathname === "/opds") {
    const auth = request.headers.get("authorization")
    if (auth?.startsWith("Basic ")) {
      return NextResponse.next()
    }
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
