import { SESSION_COOKIE } from "@/lib/auth"

export async function POST() {
  const response = Response.json({ success: true })
  response.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  )
  return response
}
