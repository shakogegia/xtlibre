import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data")
const LIBRARY_DIR = path.join(DATA_DIR, "library")
const DB_PATH = path.join(DATA_DIR, "library.db")

// Ensure directories exist
fs.mkdirSync(LIBRARY_DIR, { recursive: true })

const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    filename TEXT,
    original_epub_name TEXT,
    file_size INTEGER,
    cover_thumbnail BLOB,
    created_at TEXT DEFAULT (datetime('now')),
    device_type TEXT
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS calibre_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    url TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  )
`)

// Migration: add epub_filename column and make filename nullable
const hasEpubFilename = db.prepare(
  `SELECT COUNT(*) as cnt FROM pragma_table_info('books') WHERE name = 'epub_filename'`
).get() as { cnt: number }
if (hasEpubFilename.cnt === 0) {
  db.exec(`ALTER TABLE books ADD COLUMN epub_filename TEXT`)
}

export interface Book {
  id: string
  title: string
  author: string | null
  filename: string | null
  original_epub_name: string | null
  file_size: number | null
  cover_thumbnail: Buffer | null
  created_at: string
  device_type: string | null
  epub_filename: string | null
}

export type BookListItem = Omit<Book, "cover_thumbnail">

const stmts = {
  insert: db.prepare(`
    INSERT INTO books (id, title, author, filename, original_epub_name, file_size, cover_thumbnail, device_type)
    VALUES (@id, @title, @author, @filename, @original_epub_name, @file_size, @cover_thumbnail, @device_type)
  `),
  list: db.prepare(`
    SELECT id, title, author, filename, original_epub_name, file_size, created_at, device_type, epub_filename
    FROM books ORDER BY created_at DESC
  `),
  getById: db.prepare(`SELECT * FROM books WHERE id = ?`),
  deleteById: db.prepare(`DELETE FROM books WHERE id = ?`),
  getCover: db.prepare(`SELECT cover_thumbnail FROM books WHERE id = ?`),
  insertEpub: db.prepare(`
    INSERT INTO books (id, title, author, epub_filename, original_epub_name, file_size, cover_thumbnail)
    VALUES (@id, @title, @author, @epub_filename, @original_epub_name, @file_size, @cover_thumbnail)
  `),
  findByOriginalEpub: db.prepare(`
    SELECT * FROM books WHERE original_epub_name = @original_epub_name AND file_size = @file_size LIMIT 1
  `),
  linkXtcToBook: db.prepare(`
    UPDATE books SET filename = @filename, device_type = @device_type WHERE id = @id
  `),
}

export interface CalibreConfig {
  url: string
  username: string
  password: string
}

const calibreStmts = {
  get: db.prepare(`SELECT url, username, password FROM calibre_config WHERE id = 1`),
  upsert: db.prepare(`
    INSERT INTO calibre_config (id, url, username, password, updated_at)
    VALUES (1, @url, @username, @password, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      url = @url,
      username = @username,
      password = @password,
      updated_at = datetime('now')
  `),
  delete: db.prepare(`DELETE FROM calibre_config WHERE id = 1`),
  getPassword: db.prepare(`SELECT password FROM calibre_config WHERE id = 1`),
}

export function getCalibreConfig(): CalibreConfig | null {
  return (calibreStmts.get.get() as CalibreConfig) ?? null
}

export function setCalibreConfig(config: CalibreConfig): void {
  calibreStmts.upsert.run(config)
}

export function deleteCalibreConfig(): void {
  calibreStmts.delete.run()
}

export function getCalibrePassword(): string | null {
  const row = calibreStmts.getPassword.get() as { password: string } | undefined
  return row?.password ?? null
}

export function insertBook(book: {
  id: string
  title: string
  author: string | null
  filename: string
  original_epub_name: string | null
  file_size: number
  cover_thumbnail: Buffer | null
  device_type: string | null
}) {
  stmts.insert.run(book)
}

export function listBooks(): BookListItem[] {
  return stmts.list.all() as BookListItem[]
}

export function getBook(id: string): Book | undefined {
  return stmts.getById.get(id) as Book | undefined
}

export function deleteBook(id: string): boolean {
  const result = stmts.deleteById.run(id)
  return result.changes > 0
}

export function getCover(id: string): Buffer | null {
  const row = stmts.getCover.get(id) as { cover_thumbnail: Buffer | null } | undefined
  return row?.cover_thumbnail ?? null
}

export function getLibraryDir(): string {
  return LIBRARY_DIR
}

export function insertEpubBook(book: {
  id: string
  title: string
  author: string | null
  epub_filename: string
  original_epub_name: string | null
  file_size: number
  cover_thumbnail: Buffer | null
}) {
  stmts.insertEpub.run(book)
}

export function findByOriginalEpub(originalName: string, fileSize: number): Book | undefined {
  return stmts.findByOriginalEpub.get({
    original_epub_name: originalName,
    file_size: fileSize,
  }) as Book | undefined
}

export function linkXtcToBook(id: string, filename: string, deviceType: string | null) {
  stmts.linkXtcToBook.run({ id, filename, device_type: deviceType })
}
