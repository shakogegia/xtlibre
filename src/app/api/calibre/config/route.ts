import { NextRequest } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getCalibreConfig, setCalibreConfig, deleteCalibreConfig, getCalibrePassword } from "@/lib/db"

export async function GET(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const config = getCalibreConfig()
  if (!config) return Response.json(null)

  // Never return the password
  return Response.json({ url: config.url, username: config.username })
}

export async function PUT(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const body = await request.json()
  const { url, username, password } = body as {
    url?: string
    username?: string
    password?: string
  }

  if (!url || typeof url !== "string") {
    return Response.json({ error: "url is required" }, { status: 400 })
  }

  // Validate URL format
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return Response.json({ error: "Only HTTP(S) URLs allowed" }, { status: 400 })
    }
  } catch {
    return Response.json({ error: "Invalid URL" }, { status: 400 })
  }

  // If password is empty/missing, keep the existing one
  let finalPassword = password ?? ""
  if (!finalPassword) {
    finalPassword = getCalibrePassword() ?? ""
  }

  setCalibreConfig({
    url: url.replace(/\/+$/, ""),
    username: username ?? "",
    password: finalPassword,
  })

  return Response.json({ url: url.replace(/\/+$/, ""), username: username ?? "" })
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  deleteCalibreConfig()
  return new Response(null, { status: 204 })
}
