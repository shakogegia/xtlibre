import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import path from "path"
import fs from "fs"
import { insertBook, listBooks, getLibraryDir, findByOriginalEpub, linkXtcToBook } from "@/lib/db"
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
    const epubBookId = formData.get("epub_book_id") as string | null

    if (!file || !title) {
      return Response.json({ error: "file and title are required" }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()

    // Check if we should link to an existing EPUB row
    let id = epubBookId ?? undefined
    if (!id && originalEpubName) {
      const existing = findByOriginalEpub(originalEpubName, arrayBuffer.byteLength)
      if (existing) id = existing.id
    }

    if (id) {
      // Link XTC to existing book row
      const ext = file.name.endsWith(".xtch") ? ".xtch" : ".xtc"
      const filename = `${id}${ext}`
      const filePath = path.join(getLibraryDir(), filename)
      fs.writeFileSync(filePath, Buffer.from(arrayBuffer))
      linkXtcToBook(id, filename, deviceType)
      return Response.json({ id, title, author })
    }

    // No existing row — create new (legacy path)
    id = randomUUID()
    const ext = file.name.endsWith(".xtch") ? ".xtch" : ".xtc"
    const filename = `${id}${ext}`
    const filePath = path.join(getLibraryDir(), filename)
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer))

    insertBook({
      id,
      title,
      author,
      filename,
      original_epub_name: originalEpubName,
      file_size: arrayBuffer.byteLength,
      cover_thumbnail: null,
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
