import { requireAuth } from "@/lib/auth"
import { getJob } from "@/lib/conversion-jobs"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const { jobId } = await params
  const job = getJob(jobId)
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 })
  }

  return Response.json({
    status: job.status,
    progress: job.progress,
    totalPages: job.total_pages,
    error: job.error,
  })
}
