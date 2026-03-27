import { NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth"
import { getFont, deleteFont, getFontsDir } from "@/lib/db"
import path from "path"
import fs from "fs"

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const { id } = await params
  const font = getFont(id)
  if (!font) {
    return Response.json({ error: "Font not found" }, { status: 404 })
  }

  const filePath = path.join(getFontsDir(), font.filename)
  try { fs.unlinkSync(filePath) } catch {}
  deleteFont(id)

  revalidatePath("/")
  return new Response(null, { status: 204 })
}
