import { Converter } from "@/components/converter/converter"
import { getSettings, listFonts } from "@/lib/db"
import { DEFAULT_SETTINGS } from "@/lib/settings-schema"

const VALID_TABS = new Set(["library", "options", "calibre", "device"])

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { tab } = await searchParams
  const initialTab = typeof tab === "string" && VALID_TABS.has(tab) ? tab : "library"
  const initialSettings = getSettings() ?? DEFAULT_SETTINGS
  const initialFonts = listFonts()
  const opdsUrl = process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/+$/, "")}/opds` : null
  return <Converter initialTab={initialTab} initialSettings={initialSettings} initialFonts={initialFonts} opdsUrl={opdsUrl} />
}
