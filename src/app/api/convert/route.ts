import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { requireAuth } from "@/lib/auth"
import { getBook, getSettings, getLibraryDir } from "@/lib/db"
import { createJob } from "@/lib/conversion-jobs"
import { DEFAULT_SETTINGS } from "@/lib/settings-schema"
import fs from "fs"
import path from "path"

export async function POST(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const { book_id } = await request.json()
    if (!book_id) {
      return Response.json({ error: "book_id is required" }, { status: 400 })
    }

    const book = getBook(book_id)
    if (!book) {
      return Response.json({ error: "Book not found" }, { status: 404 })
    }

    if (!book.epub_filename) {
      return Response.json({ error: "Book has no EPUB file" }, { status: 400 })
    }
    const epubPath = path.join(getLibraryDir(), book.epub_filename)
    if (!fs.existsSync(epubPath)) {
      return Response.json({ error: "EPUB file not found on disk" }, { status: 404 })
    }

    const settings = getSettings() || DEFAULT_SETTINGS
    const jobId = randomUUID()

    createJob(jobId, book_id, settings, settings.deviceType)

    return Response.json({ job_id: jobId })
  } catch (err) {
    console.error("Convert submit error:", err)
    return Response.json({ error: "Failed to submit conversion job" }, { status: 500 })
  }
}
