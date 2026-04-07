import { randomUUID } from "crypto"
import { requireAuth } from "@/lib/auth"
import { listBooks, getSettings, getLibraryDir } from "@/lib/db"
import { createJob, getActiveJobs } from "@/lib/conversion-jobs"
import { DEFAULT_SETTINGS } from "@/lib/settings-schema"
import fs from "fs"
import path from "path"

export async function POST(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const settings = getSettings() || DEFAULT_SETTINGS
    const books = listBooks()
    const activeBookIds = new Set(getActiveJobs().map(j => j.book_id))
    const libraryDir = getLibraryDir()

    const jobs: { job_id: string; book_id: string; title: string }[] = []

    for (const book of books) {
      if (!book.epub_filename) continue
      if (activeBookIds.has(book.id)) continue
      if (!fs.existsSync(path.join(libraryDir, book.epub_filename))) continue

      const jobId = randomUUID()
      createJob(jobId, book.id, settings, settings.deviceType)
      jobs.push({ job_id: jobId, book_id: book.id, title: book.title })
    }

    return Response.json({ queued: jobs.length, jobs })
  } catch (err) {
    console.error("Convert all error:", err)
    return Response.json({ error: "Failed to queue conversion jobs" }, { status: 500 })
  }
}
