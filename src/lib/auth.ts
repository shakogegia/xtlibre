import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

const SESSION_COOKIE = "session"
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function getSecret(): Uint8Array {
  const password = process.env.AUTH_PASSWORD
  if (!password) throw new Error("AUTH_PASSWORD env var is required")
  return new TextEncoder().encode(password)
}

export function getCredentials(): { username: string; password: string } {
  const username = process.env.AUTH_USERNAME
  const password = process.env.AUTH_PASSWORD
  if (!username || !password) {
    throw new Error("AUTH_USERNAME and AUTH_PASSWORD env vars are required")
  }
  return { username, password }
}

export function checkCredentials(username: string, password: string): boolean {
  const creds = getCredentials()
  return username === creds.username && password === creds.password
}

export async function createSession(username: string): Promise<string> {
  const token = await new SignJWT({ sub: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret())
  return token
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret())
    return true
  } catch {
    return false
  }
}

/** Verify session from cookie — for use in API routes (server-side) */
export async function verifySessionCookie(): Promise<boolean> {
  const cookieStore = await cookies()
  const session = cookieStore.get(SESSION_COOKIE)
  if (!session?.value) return false
  return verifySession(session.value)
}

/** Verify HTTP Basic Auth header — for OPDS e-reader access */
export function verifyBasicAuth(authHeader: string | null): boolean {
  if (!authHeader?.startsWith("Basic ")) return false
  try {
    const decoded = atob(authHeader.slice(6))
    const [username, password] = decoded.split(":")
    return checkCredentials(username, password)
  } catch {
    return false
  }
}

/** Create a short-lived token for OPDS download links (e-readers often don't re-send Basic Auth) */
export async function createDownloadToken(): Promise<string> {
  return new SignJWT({ purpose: "opds-download" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getSecret())
}

/** Verify a download token from a URL query parameter */
async function verifyDownloadToken(token: string | null): Promise<boolean> {
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload.purpose === "opds-download"
  } catch {
    return false
  }
}

/** Check Basic Auth, session cookie, or URL download token; return 401 Response if none valid */
export async function requireAuth(request: Request): Promise<Response | null> {
  const hasBasicAuth = verifyBasicAuth(request.headers.get("authorization"))
  const hasSession = await verifySessionCookie()
  if (hasBasicAuth || hasSession) return null

  const url = new URL(request.url)
  const hasToken = await verifyDownloadToken(url.searchParams.get("token"))
  if (hasToken) return null

  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="XTLibre"' },
  })
}

export { SESSION_COOKIE, SESSION_MAX_AGE }
