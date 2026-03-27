import { getCover } from "@/lib/db"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
