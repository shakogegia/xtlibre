import { Converter } from "@/components/converter/converter"
import { getSettings } from "@/lib/db"
import { DEFAULT_SETTINGS } from "@/lib/settings-schema"

const VALID_TABS = new Set(["files", "options", "calibre", "library"])

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { tab } = await searchParams
  const initialTab = typeof tab === "string" && VALID_TABS.has(tab) ? tab : "files"
  const initialSettings = getSettings() ?? DEFAULT_SETTINGS
  return <Converter initialTab={initialTab} initialSettings={initialSettings} />
}
