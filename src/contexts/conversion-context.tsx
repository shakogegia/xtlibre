"use client"

import React, { createContext, useContext, useState, useCallback, useRef } from "react"
import { toast } from "sonner"

interface JobStatus {
  status: string
  progress: number
  totalPages: number
}

interface ConversionContextValue {
  activeJobs: Map<string, JobStatus>
  submitJob: (bookId: string, bookTitle: string) => Promise<void>
  getJobStatus: (bookId: string) => JobStatus | null
}

const ConversionContext = createContext<ConversionContextValue | null>(null)

export function ConversionProvider({
  children,
  fetchLibraryBooks,
  sendToDevice,
  deviceHost,
}: {
  children: React.ReactNode
  fetchLibraryBooks: () => Promise<Array<{ id: string; filename: string | null }> | null | undefined>
  sendToDevice: (bookId: string) => void
  deviceHost: string
}) {
  const [activeJobs, setActiveJobs] = useState<Map<string, JobStatus>>(new Map())
  const deviceHostRef = useRef(deviceHost)
  deviceHostRef.current = deviceHost

  const submitJob = useCallback(async (bookId: string, bookTitle: string) => {
    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: bookId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error || "Failed to submit job")
      }
      const { job_id } = await res.json()
      sessionStorage.setItem("xtc-active-job", JSON.stringify({ jobId: job_id, bookId, bookTitle }))

      setActiveJobs(prev => new Map(prev).set(bookId, { status: "pending", progress: 0, totalPages: 0 }))

      const pollStart = Date.now()
      const MAX_POLL_MS = 30 * 60 * 1000

      const poll = async (): Promise<void> => {
        if (Date.now() - pollStart > MAX_POLL_MS) {
          sessionStorage.removeItem("xtc-active-job")
          setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
          toast.error("Conversion timed out — worker may not be running")
          return
        }
        const statusRes = await fetch(`/api/convert/${job_id}`)
        if (!statusRes.ok) {
          setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
          toast.error("Failed to check job status")
          return
        }
        const status = await statusRes.json()

        if (status.status === "completed") {
          sessionStorage.removeItem("xtc-active-job")
          setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
          const updatedBooks = await fetchLibraryBooks()
          const justSaved = updatedBooks?.[0]
          if (justSaved?.filename && deviceHostRef.current) {
            toast.success(`"${bookTitle}" ready — ${status.totalPages} pages`, {
              duration: 8000,
              action: {
                label: "Send to device",
                onClick: () => sendToDevice(justSaved.id),
              },
              actionButtonStyle: { background: "transparent", border: "1px solid currentColor", color: "inherit" },
            })
          } else {
            toast.success(`"${bookTitle}" ready — ${status.totalPages} pages`)
          }
          return
        }

        if (status.status === "failed") {
          sessionStorage.removeItem("xtc-active-job")
          setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
          toast.error(status.error || "Conversion failed")
          return
        }

        setActiveJobs(prev => new Map(prev).set(bookId, {
          status: status.status,
          progress: status.progress,
          totalPages: status.totalPages,
        }))

        await new Promise(r => setTimeout(r, 500))
        return poll()
      }

      poll()
    } catch (err) {
      console.error("Generate XTC error:", err)
      toast.error(err instanceof Error ? err.message : "Generation failed")
    }
  }, [fetchLibraryBooks, sendToDevice])

  const getJobStatus = useCallback((bookId: string): JobStatus | null => {
    return activeJobs.get(bookId) ?? null
  }, [activeJobs])

  // Resume polling for active jobs on mount
  React.useEffect(() => {
    let cancelled = false
    async function checkActiveJobs() {
      try {
        const raw = sessionStorage.getItem("xtc-active-job")
        if (!raw) return
        let jobId: string, bookId: string, bookTitle: string
        try {
          const parsed = JSON.parse(raw)
          jobId = parsed.jobId; bookId = parsed.bookId; bookTitle = parsed.bookTitle || "Book"
        } catch {
          sessionStorage.removeItem("xtc-active-job")
          return
        }
        if (!jobId || !bookId) { sessionStorage.removeItem("xtc-active-job"); return }

        const res = await fetch(`/api/convert/${jobId}`)
        if (!res.ok) { sessionStorage.removeItem("xtc-active-job"); return }
        const status = await res.json()

        if (status.status === "pending" || status.status === "processing") {
          setActiveJobs(prev => new Map(prev).set(bookId, { status: status.status, progress: status.progress, totalPages: status.totalPages }))

          const pollStart = Date.now()
          const MAX_POLL_MS = 30 * 60 * 1000

          const poll = async (): Promise<void> => {
            if (cancelled) return
            if (Date.now() - pollStart > MAX_POLL_MS) {
              sessionStorage.removeItem("xtc-active-job")
              setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
              toast.error("Conversion timed out — worker may not be running")
              return
            }
            const statusRes = await fetch(`/api/convert/${jobId}`)
            if (!statusRes.ok) {
              setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
              return
            }
            const s = await statusRes.json()

            if (s.status === "completed") {
              sessionStorage.removeItem("xtc-active-job")
              setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
              await fetchLibraryBooks()
              toast.success(`"${bookTitle}" ready — ${s.totalPages} pages`)
              return
            }
            if (s.status === "failed") {
              sessionStorage.removeItem("xtc-active-job")
              setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
              toast.error(s.error || "Conversion failed")
              return
            }

            setActiveJobs(prev => new Map(prev).set(bookId, { status: s.status, progress: s.progress, totalPages: s.totalPages }))
            await new Promise(r => setTimeout(r, 500))
            return poll()
          }

          poll()
        } else {
          sessionStorage.removeItem("xtc-active-job")
        }
      } catch { /* ignore */ }
    }
    checkActiveJobs()
    return () => { cancelled = true }
  }, [fetchLibraryBooks, sendToDevice])

  return (
    <ConversionContext.Provider value={{ activeJobs, submitJob, getJobStatus }}>
      {children}
    </ConversionContext.Provider>
  )
}

export function useConversion() {
  const ctx = useContext(ConversionContext)
  if (!ctx) throw new Error("useConversion must be used within ConversionProvider")
  return ctx
}
