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
  const rawName = (book.original_epub_name || book.title || "book").substring(0, 80)
  const asciiName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_")
  const filename = asciiName.endsWith(".epub") ? asciiName : `${asciiName}.epub`
  const utf8Name = encodeURIComponent(rawName.endsWith(".epub") ? rawName : `${rawName}.epub`)

  return new Response(data, {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${utf8Name}`,
      "Content-Length": String(data.byteLength),
    },
  })
}
