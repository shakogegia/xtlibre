import AdmZip from "adm-zip"
import { XMLParser } from "fast-xml-parser"

const parser = new XMLParser({ ignoreAttributes: false })

/**
 * Check if an EPUB already has a cover page as its first spine item.
 * Looks for the first spine itemref and checks if the corresponding
 * manifest item is marked as a cover or contains only an image.
 */
function hasCoverPage(zip: AdmZip, opfPath: string, opf: Record<string, unknown>): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pkg = (opf as any)?.package ?? (opf as any)?.["opf:package"]
  if (!pkg) return false

  const spine = pkg.spine
  if (!spine) return false
  const itemrefs = Array.isArray(spine.itemref) ? spine.itemref : spine.itemref ? [spine.itemref] : []
  if (itemrefs.length === 0) return false

  const firstRef = itemrefs[0]
  const firstId: string = firstRef["@_idref"] || ""

  const manifest = pkg.manifest?.item
  if (!manifest) return false
  const items: Record<string, string>[] = Array.isArray(manifest) ? manifest : [manifest]

  const firstItem = items.find(item => item["@_id"] === firstId)
  if (!firstItem) return false
  const href = firstItem["@_href"] || ""

  // 1. First spine item's id or href contains "cover"
  if (firstId.toLowerCase().includes("cover") || href.toLowerCase().includes("cover")) return true

  // 2. First item has properties="cover-image" (EPUB3)
  if (firstItem["@_properties"]?.includes("cover-image")) return true

  // 3. OPF <guide> has a cover reference matching the first spine item
  const guide = pkg.guide
  if (guide) {
    const refs = Array.isArray(guide.reference) ? guide.reference : guide.reference ? [guide.reference] : []
    for (const ref of refs) {
      if (ref["@_type"] === "cover" && href && ref["@_href"]?.includes(href.split("/").pop() || "")) return true
    }
  }

  // 4. Content analysis: check if the XHTML is mostly an image wrapper
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : ""
  const pagePath = href.startsWith("/") ? href.slice(1) : opfDir + href
  const entry = zip.getEntry(pagePath)
  if (!entry) return false

  const content = entry.getData().toString("utf-8").toLowerCase()
  const hasImage = content.includes("<img") || content.includes("<image") || content.includes("<svg")
  // Strip tags AND style/script blocks before measuring visible text
  const visibleText = content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()

  return hasImage && visibleText.length < 200
}

/**
 * Find the cover image href from OPF metadata.
 * Returns the resolved path relative to the EPUB root.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findCoverImageHref(opfPath: string, pkg: any): { href: string; mediaType: string } | null {
  const manifest = pkg.manifest?.item
  if (!manifest) return null
  const items: Record<string, string>[] = Array.isArray(manifest) ? manifest : [manifest]

  let coverItem: Record<string, string> | undefined

  // EPUB3: <item properties="cover-image" .../>
  coverItem = items.find(item =>
    item["@_properties"]?.split(/\s+/).includes("cover-image")
  )

  // EPUB2: <meta name="cover" content="<item-id>"/>
  if (!coverItem) {
    const metadata = pkg.metadata
    if (metadata) {
      const metas = Array.isArray(metadata.meta) ? metadata.meta : metadata.meta ? [metadata.meta] : []
      const coverMeta = metas.find((m: Record<string, string>) => m["@_name"] === "cover")
      if (coverMeta) {
        const coverId = coverMeta["@_content"]
        coverItem = items.find(item => item["@_id"] === coverId)
      }
    }
  }

  if (!coverItem) return null

  const href = coverItem["@_href"]
  const mediaType = coverItem["@_media-type"] || "image/jpeg"
  if (!href) return null

  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : ""
  const resolvedHref = href.startsWith("/") ? href.slice(1) : opfDir + href

  return { href: resolvedHref, mediaType }
}

/**
 * Ensure the EPUB has a cover page as its first content page.
 * If the EPUB already has one, returns the original buffer unchanged.
 * If not, injects a simple XHTML cover page referencing the embedded cover image.
 * Returns null if no cover image is found in the EPUB metadata.
 */
export function ensureCoverPage(epubBuffer: Buffer): Buffer | null {
  try {
    const zip = new AdmZip(epubBuffer)

    // Find OPF path from container.xml
    const containerEntry = zip.getEntry("META-INF/container.xml")
    if (!containerEntry) return null
    const container = parser.parse(containerEntry.getData().toString("utf-8"))
    const rootfile = container?.container?.rootfiles?.rootfile
    const opfPath: string | undefined = Array.isArray(rootfile)
      ? rootfile[0]?.["@_full-path"]
      : rootfile?.["@_full-path"]
    if (!opfPath) return null

    // Parse OPF
    const opfEntry = zip.getEntry(opfPath)
    if (!opfEntry) return null
    const opf = parser.parse(opfEntry.getData().toString("utf-8"))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pkg = (opf as any)?.package ?? (opf as any)?.["opf:package"]
    if (!pkg) return null

    // Already has a cover page — return original
    if (hasCoverPage(zip, opfPath, opf)) return null

    // Find cover image in manifest
    const coverInfo = findCoverImageHref(opfPath, pkg)
    if (!coverInfo) return null

    // Verify the cover image actually exists in the EPUB
    if (!zip.getEntry(coverInfo.href)) return null

    // Build a cover XHTML page
    const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : ""
    // Make the image src relative to the cover page location (same directory as OPF)
    const coverImageRelative = coverInfo.href.startsWith(opfDir)
      ? coverInfo.href.substring(opfDir.length)
      : coverInfo.href

    const coverXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Cover</title>
<style>@page{margin:0;}*{margin:0;padding:0;}img{width:100vw;height:100vh;display:block;}</style>
</head>
<body><img src="${coverImageRelative}" alt="Cover"/></body>
</html>`

    const coverPagePath = opfDir + "_xtc_cover.xhtml"
    zip.addFile(coverPagePath, Buffer.from(coverXhtml, "utf-8"))

    // Rebuild OPF XML: add cover page to manifest and as first spine item
    let opfContent = opfEntry.getData().toString("utf-8")

    // Insert manifest item before </manifest>
    const manifestClose = opfContent.indexOf("</manifest>")
    if (manifestClose === -1) return null
    const manifestItem = `  <item id="_xtc_cover_page" href="_xtc_cover.xhtml" media-type="application/xhtml+xml"/>\n  `
    opfContent = opfContent.slice(0, manifestClose) + manifestItem + opfContent.slice(manifestClose)

    // Insert spine itemref as first item after <spine...>
    const spineMatch = opfContent.match(/<spine[^>]*>/)
    if (!spineMatch) return null
    const spineTagEnd = opfContent.indexOf(">", opfContent.indexOf(spineMatch[0])) + 1
    const spineItem = `\n    <itemref idref="_xtc_cover_page"/>`
    opfContent = opfContent.slice(0, spineTagEnd) + spineItem + opfContent.slice(spineTagEnd)

    // Update the OPF in the ZIP
    zip.deleteFile(opfPath)
    zip.addFile(opfPath, Buffer.from(opfContent, "utf-8"))

    return zip.toBuffer()
  } catch {
    return null
  }
}
