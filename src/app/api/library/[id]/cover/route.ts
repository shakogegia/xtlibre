import { getCover } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const { id } = await params
  const cover = getCover(id)

  if (!cover) {
    return new Response(null, { status: 404 })
  }

  return new Response(new Uint8Array(cover), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  })
}
