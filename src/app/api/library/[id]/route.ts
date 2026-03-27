import path from "path"
import fs from "fs"
import { getBook, deleteBook, getLibraryDir } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const { id } = await params
  const book = getBook(id)
  if (!book || !book.filename) {
    return Response.json({ error: "XTC not found" }, { status: 404 })
  }

  const filePath = path.join(getLibraryDir(), book.filename)
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: "File not found on disk" }, { status: 404 })
  }

  const data = fs.readFileSync(filePath)
  const safeName = book.title.replace(/[^a-zA-Z0-9\u0080-\uFFFF._-]/g, "_").substring(0, 50)
  const ext = book.filename.endsWith(".xtch") ? ".xtch" : ".xtc"

  return new Response(data, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}${ext}"`,
      "Content-Length": String(data.byteLength),
    },
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const { id } = await params
  const book = getBook(id)
  if (!book) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  // Delete XTC file if present
  if (book.filename) {
    const xtcPath = path.join(getLibraryDir(), book.filename)
    if (fs.existsSync(xtcPath)) fs.unlinkSync(xtcPath)
  }

  // Delete EPUB file if present
  if (book.epub_filename) {
    const epubPath = path.join(getLibraryDir(), book.epub_filename)
    if (fs.existsSync(epubPath)) fs.unlinkSync(epubPath)
  }

  deleteBook(id)
  return Response.json({ ok: true })
}
