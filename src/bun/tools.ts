import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

/** Read a file from the filesystem. */
export function readFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch (err: any) {
    return `Error reading file: ${err.message}`;
  }
}

/** Write content to a file (creates directories if needed). */
export function writeFile(path: string, content: string): string {
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(path, content, "utf-8");
    return `File written: ${path}`;
  } catch (err: any) {
    return `Error writing file: ${err.message}`;
  }
}

/** Find and replace in a file. */
export function editFile(path: string, oldText: string, newText: string): string {
  try {
    const content = readFileSync(path, "utf-8");
    if (!content.includes(oldText)) {
      return `Error: Could not find the text to replace in ${path}`;
    }
    const updated = content.replace(oldText, newText);
    writeFileSync(path, updated, "utf-8");
    return `File edited: ${path}`;
  } catch (err: any) {
    return `Error editing file: ${err.message}`;
  }
}
