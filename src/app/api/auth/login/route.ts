import { checkCredentials, createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth"

export async function POST(request: Request) {
  const body = await request.json()
  const { username, password } = body

  if (!username || !password) {
    return Response.json({ error: "Username and password are required" }, { status: 400 })
  }

  if (!checkCredentials(username, password)) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const token = await createSession(username)

  const response = Response.json({ success: true })
  response.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
  )
  return response
}
