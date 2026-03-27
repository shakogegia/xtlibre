import { Converter } from "@/components/converter/converter"

const VALID_TABS = new Set(["files", "options", "calibre", "library"])

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { tab } = await searchParams
  const initialTab = typeof tab === "string" && VALID_TABS.has(tab) ? tab : "files"
  return <Converter initialTab={initialTab} />
}
