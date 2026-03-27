import AdmZip from "adm-zip"
import { XMLParser } from "fast-xml-parser"

const parser = new XMLParser({ ignoreAttributes: false })

/**
 * Extract the cover image from an EPUB buffer by parsing OPF metadata.
 * Supports both EPUB2 (<meta name="cover">) and EPUB3 (properties="cover-image").
 * Returns the raw image buffer, or null if no cover found.
 */
export function extractCoverFromEpub(epubBuffer: Buffer): Buffer | null {
  try {
    const zip = new AdmZip(epubBuffer)

    // 1. Find OPF path from container.xml
    const containerEntry = zip.getEntry("META-INF/container.xml")
    if (!containerEntry) return null
    const container = parser.parse(containerEntry.getData().toString("utf-8"))
    const rootfile = container?.container?.rootfiles?.rootfile
    const opfPath: string | undefined = Array.isArray(rootfile)
      ? rootfile[0]?.["@_full-path"]
      : rootfile?.["@_full-path"]
    if (!opfPath) return null

    // 2. Parse OPF
    const opfEntry = zip.getEntry(opfPath)
    if (!opfEntry) return null
    const opf = parser.parse(opfEntry.getData().toString("utf-8"))
    const pkg = opf?.package ?? opf?.["opf:package"]
    if (!pkg) return null

    const manifest = pkg.manifest?.item
    if (!manifest) return null
    const items: Record<string, string>[] = Array.isArray(manifest) ? manifest : [manifest]

    let coverHref: string | null = null

    // Try EPUB3: <item properties="cover-image" .../>
    const epub3Cover = items.find(item =>
      item["@_properties"]?.split(/\s+/).includes("cover-image")
    )
    if (epub3Cover) {
      coverHref = epub3Cover["@_href"]
    }

    // Try EPUB2: <meta name="cover" content="<item-id>"/>
    if (!coverHref) {
      const metadata = pkg.metadata
      if (metadata) {
        const metas = Array.isArray(metadata.meta) ? metadata.meta : metadata.meta ? [metadata.meta] : []
        const coverMeta = metas.find((m: Record<string, string>) => m["@_name"] === "cover")
        if (coverMeta) {
          const coverId = coverMeta["@_content"]
          const coverItem = items.find(item => item["@_id"] === coverId)
          if (coverItem) coverHref = coverItem["@_href"]
        }
      }
    }

    if (!coverHref) return null

    // 3. Resolve path relative to OPF directory
    const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : ""
    const coverPath = coverHref.startsWith("/") ? coverHref.slice(1) : opfDir + coverHref

    // 4. Extract cover image
    const coverEntry = zip.getEntry(coverPath)
    if (!coverEntry) return null
    return coverEntry.getData()
  } catch {
    return null
  }
}
