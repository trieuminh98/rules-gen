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

export function ensureSymlink(target: string, linkPath: string) {
  const absTarget = path.resolve(target);
  const absLink = path.resolve(linkPath);

  ensureDir(absTarget);
  ensureDir(path.dirname(absLink));

  if (fs.existsSync(absLink)) {
    const stat = fs.lstatSync(absLink);
    if (!stat.isSymbolicLink()) {
      throw new Error(`Expected symlink at "${absLink}". Remove it to recreate.`);
    }
    const existing = fs.readlinkSync(absLink);
    const resolved = path.resolve(path.dirname(absLink), existing);
    if (resolved === absTarget) return;
    fs.unlinkSync(absLink);
  }

  fs.symlinkSync(absTarget, absLink, "dir");
}
