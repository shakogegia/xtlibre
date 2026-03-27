import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import path from "path"
import fs from "fs"
import { insertBook, listBooks, getLibraryDir } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export async function POST(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const title = formData.get("title") as string | null
    const author = formData.get("author") as string | null
    const deviceType = formData.get("device_type") as string | null
    const originalEpubName = formData.get("original_epub_name") as string | null
    const coverFile = formData.get("cover") as File | null

    if (!file || !title) {
      return Response.json({ error: "file and title are required" }, { status: 400 })
    }

    const id = randomUUID()
    const filename = `${id}.xtc`
    const filePath = path.join(getLibraryDir(), filename)

    const arrayBuffer = await file.arrayBuffer()
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer))

    let coverBuffer: Buffer | null = null
    if (coverFile) {
      const coverData = await coverFile.arrayBuffer()
      coverBuffer = Buffer.from(coverData)
    }

    insertBook({
      id,
      title,
      author,
      filename,
      original_epub_name: originalEpubName,
      file_size: arrayBuffer.byteLength,
      cover_thumbnail: coverBuffer,
      device_type: deviceType,
    })

    return Response.json({ id, title, author })
  } catch (err) {
    console.error("Library upload error:", err)
    return Response.json({ error: "Upload failed" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const books = listBooks()
    return Response.json(books)
  } catch (err) {
    console.error("Library list error:", err)
    return Response.json({ error: "Failed to list books" }, { status: 500 })
  }
}
