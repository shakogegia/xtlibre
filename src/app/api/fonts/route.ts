import { NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth"
import { insertFont, getFontsDir } from "@/lib/db"
import { randomUUID } from "crypto"
import path from "path"
import fs from "fs"

/** Parse the TTF/OTF 'name' table to extract the font family name (nameID 1). */
function parseFontFamilyName(buf: Buffer): string | null {
  if (buf.length < 12) return null
  const numTables = buf.readUInt16BE(4)
  let nameTableOffset = 0
  let nameTableLength = 0
  for (let i = 0; i < numTables; i++) {
    const offset = 12 + i * 16
    const tag = buf.toString("ascii", offset, offset + 4)
    if (tag === "name") {
      nameTableOffset = buf.readUInt32BE(offset + 8)
      nameTableLength = buf.readUInt32BE(offset + 12)
      break
    }
  }
  if (!nameTableOffset || nameTableOffset + 6 > buf.length) return null

  const count = buf.readUInt16BE(nameTableOffset + 2)
  const stringOffset = buf.readUInt16BE(nameTableOffset + 4)

  // Prefer platformID 3 (Windows) / encodingID 1 (Unicode BMP), nameID 1 (Family)
  // Fall back to platformID 1 (Mac) / nameID 1
  let macName: string | null = null
  for (let i = 0; i < count; i++) {
    const recOffset = nameTableOffset + 6 + i * 12
    if (recOffset + 12 > buf.length) break
    const platformID = buf.readUInt16BE(recOffset)
    const nameID = buf.readUInt16BE(recOffset + 6)
    const length = buf.readUInt16BE(recOffset + 8)
    const strOff = buf.readUInt16BE(recOffset + 10)
    if (nameID !== 1) continue

    const strStart = nameTableOffset + stringOffset + strOff
    if (strStart + length > buf.length) continue

    if (platformID === 3) {
      // Windows: UTF-16BE
      const chars: string[] = []
      for (let j = 0; j < length; j += 2) {
        chars.push(String.fromCharCode(buf.readUInt16BE(strStart + j)))
      }
      return chars.join("")
    }
    if (platformID === 1 && !macName) {
      macName = buf.toString("latin1", strStart, strStart + length)
    }
  }
  return macName
}

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

  // Extract the real font family name from TTF/OTF name table
  const name = parseFontFamilyName(data) || path.basename(file.name, ext)
  insertFont({ id, name, filename })

  revalidatePath("/")
  return Response.json({ id, name, filename })
}
