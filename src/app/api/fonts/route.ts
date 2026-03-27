import { NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth"
import { insertFont, getFontsDir } from "@/lib/db"
import { randomUUID } from "crypto"
import path from "path"
import fs from "fs"

export async function POST(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 })
  }

  const ext = path.extname(file.name).toLowerCase()
  if (ext !== ".ttf" && ext !== ".otf") {
    return Response.json({ error: "Only .ttf and .otf files allowed" }, { status: 400 })
  }

  const id = randomUUID()
  const filename = `${id}${ext}`
  const fontsDir = getFontsDir()
  const data = Buffer.from(await file.arrayBuffer())
  fs.writeFileSync(path.join(fontsDir, filename), data)

  const name = path.basename(file.name, ext)
  insertFont({ id, name, filename })

  revalidatePath("/")
  return Response.json({ id, name, filename })
}
