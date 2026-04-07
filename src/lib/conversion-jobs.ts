import { db } from "@/lib/db"
import type { Settings } from "@/lib/settings-schema"

export interface ConversionJob {
  id: string
  book_id: string
  status: "pending" | "processing" | "completed" | "failed"
  progress: number
  total_pages: number
  settings: string
  device_type: string
  error: string | null
  created_at: string
  updated_at: string
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO conversion_jobs (id, book_id, status, settings, device_type)
    VALUES (@id, @book_id, 'pending', @settings, @device_type)
  `),
  getById: db.prepare(`
    SELECT * FROM conversion_jobs WHERE id = ?
  `),
  getActive: db.prepare(`
    SELECT * FROM conversion_jobs WHERE status IN ('pending', 'processing') ORDER BY created_at ASC
  `),
  claimNext: db.prepare(`
    UPDATE conversion_jobs
    SET status = 'processing', updated_at = datetime('now')
    WHERE id = (SELECT id FROM conversion_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1)
    RETURNING *
  `),
  updateProgress: db.prepare(`
    UPDATE conversion_jobs SET progress = @progress, total_pages = @total_pages, updated_at = datetime('now')
    WHERE id = @id
  `),
  complete: db.prepare(`
    UPDATE conversion_jobs SET status = 'completed', updated_at = datetime('now') WHERE id = ?
  `),
  fail: db.prepare(`
    UPDATE conversion_jobs SET status = 'failed', error = @error, updated_at = datetime('now') WHERE id = @id
  `),
}

export function createJob(id: string, bookId: string, settings: Settings, deviceType: string): void {
  stmts.insert.run({ id, book_id: bookId, settings: JSON.stringify(settings), device_type: deviceType })
}

export function getJob(id: string): ConversionJob | undefined {
  return stmts.getById.get(id) as ConversionJob | undefined
}

export function getActiveJobs(): ConversionJob[] {
  return stmts.getActive.all() as ConversionJob[]
}

export function claimNextJob(): ConversionJob | undefined {
  return stmts.claimNext.get() as ConversionJob | undefined
}

export function updateJobProgress(id: string, progress: number, totalPages: number): void {
  stmts.updateProgress.run({ id, progress, total_pages: totalPages })
}

export function completeJob(id: string): void {
  stmts.complete.run(id)
}

export function failJob(id: string, error: string): void {
  stmts.fail.run({ id, error })
}
