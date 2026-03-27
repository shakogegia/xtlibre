import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import path from "path"
import fs from "fs"
import { insertEpubBook, findByOriginalEpub, getLibraryDir } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export async function POST(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const title = formData.get("title") as string | null
    const author = formData.get("author") as string | null
    const originalEpubName = formData.get("original_epub_name") as string | null
    const coverFile = formData.get("cover") as File | null

    if (!file || !title) {
      return Response.json({ error: "file and title are required" }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()

    // Dedup check: same original name + file size = same EPUB
    if (originalEpubName) {
      const existing = findByOriginalEpub(originalEpubName, arrayBuffer.byteLength)
      if (existing) {
        return Response.json({ id: existing.id, title: existing.title, author: existing.author, isExisting: true })
      }
    }

    const id = randomUUID()
    const epubFilename = `${id}.epub`
    const filePath = path.join(getLibraryDir(), epubFilename)

    fs.writeFileSync(filePath, Buffer.from(arrayBuffer))

    let coverBuffer: Buffer | null = null
    if (coverFile) {
      const coverData = await coverFile.arrayBuffer()
      coverBuffer = Buffer.from(coverData)
    }

    insertEpubBook({
      id,
      title,
      author,
      epub_filename: epubFilename,
      original_epub_name: originalEpubName,
      file_size: arrayBuffer.byteLength,
      cover_thumbnail: coverBuffer,
    })

    return Response.json({ id, title, author, isExisting: false })
  } catch (err) {
    console.error("EPUB upload error:", err)
    return Response.json({ error: "Upload failed" }, { status: 500 })
  }
}
