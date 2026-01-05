import fs from "node:fs";
import path from "node:path";

function toProjectRelative(p: string) {
  const rel = path.relative(process.cwd(), path.resolve(p)).replace(/\\/g, "/");
  return rel || p;
}

function dirPattern(p: string) {
  return p.endsWith("/") ? p : `${p}/`;
}

export function ensureGitignorePatterns(cursorOut: string, codexOut: string) {
  const patterns = [
    cursorOut ? dirPattern(toProjectRelative(cursorOut)) : null,
    codexOut ? toProjectRelative(codexOut) : null,
  ].filter(Boolean) as string[];

  const abs = path.resolve(".gitignore");
  const existing = fs.existsSync(abs)
    ? fs.readFileSync(abs, "utf8").split(/\r?\n/)
    : [];
  const existingSet = new Set(existing);
  const missing = patterns.filter((p) => !existingSet.has(p));

  if (missing.length === 0) return;

  const next = existing.slice();
  if (next.length && next[next.length - 1] !== "") next.push("");
  next.push(...missing);
  const text = next.join("\n").replace(/\n+$/, "\n") + "\n";
  fs.writeFileSync(abs, text, "utf8");
}
