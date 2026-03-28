import { requireAuth } from "@/lib/auth"
import { getBook, getLibraryDir } from "@/lib/db"
import path from "path"
import fs from "fs"
import WebSocket from "ws"

export async function POST(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  if (!body?.bookId || !body?.host || !body?.port) {
    return Response.json({ error: "bookId, host, and port are required" }, { status: 400 })
  }

  const { bookId, host, port, uploadPath = "/" } = body
  const book = getBook(bookId)
  if (!book?.filename) {
    return Response.json({ error: "Book not found or no XTC file" }, { status: 404 })
  }

  const filePath = path.join(getLibraryDir(), book.filename)
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: "File not found on disk" }, { status: 404 })
  }

  const fileData = fs.readFileSync(filePath)
  const ext = book.filename.endsWith(".xtch") ? ".xtch" : ".xtc"
  const nameBase = book.author ? `${book.title} - ${book.author}` : book.title
  const filename = nameBase.replace(/[^a-zA-Z0-9 ._-]/g, "_").substring(0, 80).trim() + ext

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const ws = new WebSocket(`ws://${host}:${port}/`)
      let done = false

      const timeout = setTimeout(() => {
        if (!done) {
          done = true
          send({ type: "error", message: "Connection timed out" })
          controller.close()
          try { ws.close() } catch {}
        }
      }, 10000)

      ws.on("open", () => {
        clearTimeout(timeout)
        ws.send(`START:${filename}:${fileData.byteLength}:${uploadPath}`)
      })

      ws.on("message", (data) => {
        const msg = data.toString()

        if (msg === "READY") {
          const chunkSize = 2048
          let queued = 0

          const sendChunk = () => {
            if (done) return
            if (queued >= fileData.byteLength) return

            const end = Math.min(queued + chunkSize, fileData.byteLength)
            ws.send(fileData.slice(queued, end))
            queued = end

            if (queued < fileData.byteLength) {
              setImmediate(sendChunk)
            }
          }
          sendChunk()
          return
        }

        // Device reports actual bytes received — forward to client
        if (msg.startsWith("PROGRESS:")) {
          const parts = msg.slice(9).split(":")
          const received = parseInt(parts[0], 10)
          const total = parseInt(parts[1], 10)
          if (!isNaN(received) && !isNaN(total)) {
            send({ type: "progress", sent: received, total })
          }
          return
        }

        if (msg === "DONE") {
          done = true
          send({ type: "done" })
          controller.close()
          ws.close()
          return
        }

        if (msg.startsWith("ERROR")) {
          done = true
          send({ type: "error", message: msg.slice(6) || "Device error" })
          controller.close()
          ws.close()
          return
        }
      })

      ws.on("error", (err) => {
        if (!done) {
          done = true
          clearTimeout(timeout)
          send({ type: "error", message: `Connection failed: ${err.message}` })
          controller.close()
        }
      })

      ws.on("close", () => {
        if (!done) {
          done = true
          send({ type: "error", message: "Connection closed unexpectedly" })
          controller.close()
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
