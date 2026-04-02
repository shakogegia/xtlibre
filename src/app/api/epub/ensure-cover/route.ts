import { requireAuth } from "@/lib/auth"
import { ensureCoverPage } from "@/lib/epub-cover-page"

export async function POST(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const modified = ensureCoverPage(buffer)

  if (!modified) {
    // Already has a cover page or no cover image found — no change needed
    return new Response(null, { status: 204 })
  }

  return new Response(new Uint8Array(modified), {
    headers: { "Content-Type": "application/epub+zip" },
  })
}
