import { NextRequest } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getFont, getFontsDir } from "@/lib/db"
import path from "path"
import fs from "fs"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const { id } = await params
  const font = getFont(id)
  if (!font) {
    return Response.json({ error: "Font not found" }, { status: 404 })
  }

  const filePath = path.join(getFontsDir(), font.filename)
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: "Font file missing" }, { status: 404 })
  }

  const data = fs.readFileSync(filePath)
  const contentType = font.filename.endsWith(".otf") ? "font/otf" : "font/ttf"
  return new Response(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
