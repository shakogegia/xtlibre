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
    filename TEXT NOT NULL,
    original_epub_name TEXT,
    file_size INTEGER,
    cover_thumbnail BLOB,
    created_at TEXT DEFAULT (datetime('now')),
    device_type TEXT
  )
`)

export interface Book {
  id: string
  title: string
  author: string | null
  filename: string
  original_epub_name: string | null
  file_size: number | null
  cover_thumbnail: Buffer | null
  created_at: string
  device_type: string | null
}

export type BookListItem = Omit<Book, "cover_thumbnail">

const stmts = {
  insert: db.prepare(`
    INSERT INTO books (id, title, author, filename, original_epub_name, file_size, cover_thumbnail, device_type)
    VALUES (@id, @title, @author, @filename, @original_epub_name, @file_size, @cover_thumbnail, @device_type)
  `),
  list: db.prepare(`
    SELECT id, title, author, filename, original_epub_name, file_size, created_at, device_type
    FROM books ORDER BY created_at DESC
  `),
  getById: db.prepare(`SELECT * FROM books WHERE id = ?`),
  deleteById: db.prepare(`DELETE FROM books WHERE id = ?`),
  getCover: db.prepare(`SELECT cover_thumbnail FROM books WHERE id = ?`),
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
