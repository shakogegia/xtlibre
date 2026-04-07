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

  // Track which jobs we're already polling so we don't double-poll
  const pollingRef = useRef(new Set<string>())
  const cancelledRef = useRef(false)

  const startPolling = useCallback((jobId: string, bookId: string, bookTitle: string, initial?: JobStatus) => {
    if (pollingRef.current.has(jobId)) return
    pollingRef.current.add(jobId)

    setActiveJobs(prev => new Map(prev).set(bookId, initial ?? { status: "pending", progress: 0, totalPages: 0 }))

    const pollStart = Date.now()
    const MAX_POLL_MS = 30 * 60 * 1000

    const poll = async (): Promise<void> => {
      if (cancelledRef.current) { pollingRef.current.delete(jobId); return }
      if (Date.now() - pollStart > MAX_POLL_MS) {
        pollingRef.current.delete(jobId)
        setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
        toast.error(`"${bookTitle}" timed out — worker may not be running`)
        return
      }

      const res = await fetch(`/api/convert/${jobId}`)
      if (!res.ok) {
        pollingRef.current.delete(jobId)
        setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
        return
      }
      const status = await res.json()

      if (status.status === "completed") {
        pollingRef.current.delete(jobId)
        setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
        const updatedBooks = await fetchLibraryBooks()
        const justSaved = updatedBooks?.find((b: { id: string }) => b.id === bookId)
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
        pollingRef.current.delete(jobId)
        setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
        toast.error(`"${bookTitle}" failed: ${status.error || "Unknown error"}`)
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
  }, [fetchLibraryBooks, sendToDevice])

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
      startPolling(job_id, bookId, bookTitle)
    } catch (err) {
      console.error("Generate XTC error:", err)
      toast.error(err instanceof Error ? err.message : "Generation failed")
    }
  }, [startPolling])

  const getJobStatus = useCallback((bookId: string): JobStatus | null => {
    return activeJobs.get(bookId) ?? null
  }, [activeJobs])

  // On mount: fetch all active jobs from the server and resume polling
  React.useEffect(() => {
    cancelledRef.current = false
    async function resumeActiveJobs() {
      try {
        const res = await fetch("/api/convert")
        if (!res.ok) return
        const jobs: { id: string; book_id: string; book_title: string; status: string; progress: number; totalPages: number }[] = await res.json()

        for (const job of jobs) {
          startPolling(job.id, job.book_id, job.book_title, {
            status: job.status,
            progress: job.progress,
            totalPages: job.totalPages,
          })
        }
      } catch { /* ignore */ }
    }
    resumeActiveJobs()
    return () => { cancelledRef.current = true }
  }, [startPolling])

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
