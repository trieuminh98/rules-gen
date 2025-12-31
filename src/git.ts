import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { simpleGit } from "simple-git";

function tmpDirName(repo: string) {
  const h = crypto
    .createHash("sha1")
    .update(repo + Date.now())
    .digest("hex")
    .slice(0, 10);
  return path.join(os.tmpdir(), `rules-gen-${h}`);
}

export async function cloneMain(repo: string) {
  const dir = tmpDirName(repo);
  await simpleGit().clone(repo, dir, ["--depth", "1", "--branch", "main"]);
  return dir;
}

export function cleanupDir(dir: string) {
  // Node 14+ supports rmSync recursive
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
