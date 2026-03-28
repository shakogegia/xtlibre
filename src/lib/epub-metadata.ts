import AdmZip from "adm-zip"
import { XMLParser } from "fast-xml-parser"

const parser = new XMLParser({ ignoreAttributes: false })

const escXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * Update dc:title and dc:creator in the OPF metadata of an EPUB buffer.
 * Returns the modified EPUB buffer, or null if the OPF could not be found/parsed.
 */
export function updateEpubMetadata(
  epubBuffer: Buffer,
  title: string,
  author: string | null
): Buffer | null {
  try {
    const zip = new AdmZip(epubBuffer)

    const containerEntry = zip.getEntry("META-INF/container.xml")
    if (!containerEntry) return null
    const container = parser.parse(containerEntry.getData().toString("utf-8"))
    const rootfile = container?.container?.rootfiles?.rootfile
    const opfPath: string | undefined = Array.isArray(rootfile)
      ? rootfile[0]?.["@_full-path"]
      : rootfile?.["@_full-path"]
    if (!opfPath) return null

    const opfEntry = zip.getEntry(opfPath)
    if (!opfEntry) return null
    let opfXml = opfEntry.getData().toString("utf-8")

    // Replace the text content of dc:title (preserving attributes)
    opfXml = opfXml.replace(
      /(<dc:title[^>]*>)[\s\S]*?(<\/dc:title>)/,
      `$1${escXml(title)}$2`
    )

    // Replace or add dc:creator
    if (author) {
      if (/<dc:creator[^>]*>[\s\S]*?<\/dc:creator>/.test(opfXml)) {
        opfXml = opfXml.replace(
          /(<dc:creator[^>]*>)[\s\S]*?(<\/dc:creator>)/,
          `$1${escXml(author)}$2`
        )
      } else {
        // Insert after dc:title
        opfXml = opfXml.replace(
          /(<\/dc:title>)/,
          `$1\n    <dc:creator>${escXml(author)}</dc:creator>`
        )
      }
    } else {
      // Remove dc:creator if author cleared
      opfXml = opfXml.replace(/\s*<dc:creator[^>]*>[\s\S]*?<\/dc:creator>/g, "")
    }

    zip.updateFile(opfPath, Buffer.from(opfXml, "utf-8"))
    return zip.toBuffer()
  } catch {
    return null
  }
}
