import fs from "node:fs";
import path from "node:path";

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function writeFile(p: string, content: string) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, "utf8");
}

export function isDirPath(p: string) {
  // heuristic: ends with slash OR has no extension
  const norm = p.replace(/\\/g, "/");
  if (norm.endsWith("/")) return true;
  return path.extname(norm) === "";
}
