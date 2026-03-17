import { watch, readdirSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, relative, extname } from "path";
import { createHash } from "crypto";
import Database from "bun:sqlite";

const SUPPORTED_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".ts", ".js", ".py", ".sh", ".yaml", ".yml", ".toml", ".csv",
]);

export function getDocsDir(dataDir: string): string {
  const docsDir = join(dataDir, "docs");
  if (!existsSync(docsDir)) {
    mkdirSync(docsDir, { recursive: true });
  }
  return docsDir;
}

/** Extract title from markdown (first # heading) or filename. */
function extractTitle(content: string, filePath: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return filePath.split("/").pop()?.replace(/\.[^.]+$/, "") || filePath;
}

/** Compute content hash for change detection. */
function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/** Scan directory recursively for supported files. */
function scanFiles(dir: string, base: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        files.push(...scanFiles(fullPath, base));
      } else if (SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(relative(base, fullPath));
      }
    }
  } catch {}
  return files;
}

/** Index all documents in the docs directory. Returns count of indexed files. */
export function indexDocuments(db: Database, docsDir: string): number {
  const files = scanFiles(docsDir, docsDir);

  const upsertDoc = db.prepare(
    "INSERT INTO documents (path, title, content_hash, indexed_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(path) DO UPDATE SET title = excluded.title, content_hash = excluded.content_hash, indexed_at = unixepoch()"
  );
  const getDoc = db.prepare("SELECT content_hash FROM documents WHERE path = ?");
  const deleteDoc = db.prepare("DELETE FROM documents WHERE path = ?");
  const allDocs = db.prepare("SELECT path FROM documents").all() as { path: string }[];

  let indexed = 0;
  const currentPaths = new Set(files);

  // Remove documents that no longer exist
  for (const doc of allDocs) {
    if (!currentPaths.has(doc.path)) {
      deleteDoc.run(doc.path);
    }
  }

  // Index new/changed files
  for (const filePath of files) {
    try {
      const fullPath = join(docsDir, filePath);
      const content = readFileSync(fullPath, "utf-8");
      const hash = hashContent(content);

      const existing = getDoc.get(filePath) as { content_hash: string } | null;
      if (existing?.content_hash === hash) continue;

      const title = extractTitle(content, filePath);
      upsertDoc.run(filePath, title, hash);
      indexed++;
    } catch {}
  }

  return indexed;
}

/** Read document content from disk. */
export function readDocument(docsDir: string, path: string): string | null {
  try {
    const fullPath = join(docsDir, path);
    // Security: ensure path doesn't escape docs directory
    if (!fullPath.startsWith(docsDir)) return null;
    return readFileSync(fullPath, "utf-8");
  } catch {
    return null;
  }
}

/** Start watching the docs directory for changes. Returns cleanup function. */
export function watchDocs(db: Database, docsDir: string): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher = watch(docsDir, { recursive: true }, (_event, _filename) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      indexDocuments(db, docsDir);
      console.log("Documents re-indexed after file change");
    }, 500);
  });

  return () => watcher.close();
}
