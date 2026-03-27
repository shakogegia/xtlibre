import path from "path"
import fs from "fs"
import { getBook, getLibraryDir } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const { id } = await params
  const book = getBook(id)
  if (!book || !book.epub_filename) {
    return Response.json({ error: "EPUB not found" }, { status: 404 })
  }

  const filePath = path.join(getLibraryDir(), book.epub_filename)
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: "EPUB file not found on disk" }, { status: 404 })
  }

  const data = fs.readFileSync(filePath)
  const safeName = (book.original_epub_name || book.title || "book")
    .replace(/[^a-zA-Z0-9\u0080-\uFFFF._-]/g, "_")
    .substring(0, 80)
  const filename = safeName.endsWith(".epub") ? safeName : `${safeName}.epub`

  return new Response(data, {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(data.byteLength),
    },
  })
}
