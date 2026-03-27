import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"

interface CalibreDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  calibreConnected: boolean
  calibreConfig: { url: string; username: string } | null
  opdsSaveSettings: (config: { url: string; username: string; password: string }) => void
  opdsDisconnect: () => void
}

export function CalibreDialog({
  open, onOpenChange, calibreConnected, calibreConfig, opdsSaveSettings, opdsDisconnect,
}: CalibreDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Calibre Connection</DialogTitle>
          <DialogDescription className="text-[12px]">
            Connect to your Calibre-Web server.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3 mt-2"
          onSubmit={(e) => {
            e.preventDefault()
            const form = e.target as HTMLFormElement
            const data = new FormData(form)
            opdsSaveSettings({
              url: (data.get("url") as string).replace(/\/+$/, ""),
              username: data.get("username") as string,
              password: data.get("password") as string,
            })
          }}
        >
          <div className="space-y-1.5">
            <Label className="text-[12px]">Server URL</Label>
            <Input
              name="url"
              placeholder="https://calibre.example.com"
              defaultValue={calibreConfig?.url ?? ""}
              className="h-8 text-[12px]"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Username</Label>
            <Input
              name="username"
              placeholder="Optional"
              defaultValue={calibreConfig?.username ?? ""}
              className="h-8 text-[12px]"
              autoComplete="username"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Password</Label>
            <Input
              name="password"
              type="password"
              placeholder="Optional"
              defaultValue=""
              className="h-8 text-[12px]"
              autoComplete="current-password"
            />
          </div>
          <div className="flex justify-between pt-1">
            {calibreConnected && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => { opdsDisconnect(); onOpenChange(false) }}
              >
                Disconnect
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="h-7 text-[12px]">
                Connect
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
