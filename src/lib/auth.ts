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

export { SESSION_COOKIE, SESSION_MAX_AGE }
