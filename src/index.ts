#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import { Command } from "commander";
import fg from "fast-glob";

import { cloneMain, cleanupDir } from "./git.js";
import { loadSpec } from "./spec.js";
import { extractTargets } from "./extractTargets.js";
import { ensureDir, writeFile, isDirPath } from "./write.js";

function splitOut(v: string) {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as Array<"cursor" | "codex">;
}

function readUtf8(p: string) {
  return fs.readFileSync(p, "utf8");
}

const program = new Command();

program
  .name("rules-gen")
  .requiredOption("--repo <git-url>", "Rules hub git repo (main branch)")
  .option(
    "--spec <rules.yaml>",
    "Optional YAML spec in current project (defaults to rules.yaml if present)"
  )
  .option("--out <list>", "cursor,codex", "cursor,codex")
  .option("--cursor-out <path>", "Cursor output folder (default .cursor/rules)")
  .option(
    "--codex-out <path>",
    "Codex output file or folder (default AGENTS.md)"
  );

program.parse(process.argv);
const opts = program.opts();

const outTargets = splitOut(opts.out);

(async () => {
  const spec = loadSpec(opts.spec);

  // defaults (CLI override > spec.outputs > default)
  const cursorOut =
    opts.cursorOut ?? spec.outputs?.cursor?.path ?? ".cursor/rules";
  const codexOutRaw = opts.codexOut ?? spec.outputs?.codex?.path ?? "AGENTS.md";

  // codex-out can be folder or file
  const codexOut = isDirPath(codexOutRaw)
    ? path.join(codexOutRaw, "AGENTS.md")
    : codexOutRaw;

  let hubDir: string | null = null;
  try {
    hubDir = await cloneMain(opts.repo);

    // resolve sources (glob in hub repo)
    const patterns = spec.sources;
    const sourceFiles = (await fg(patterns, { cwd: hubDir, dot: true }))
      .map((p) => p.replace(/\\/g, "/"))
      .sort(); // deterministic

    if (sourceFiles.length === 0) {
      throw new Error(
        `No source files matched in hub repo. patterns=${patterns.join(", ")}`
      );
    }

    // overlays (local project files): append them into each module (MVP)
    const overlayTexts = (spec.overlays ?? []).map((p) =>
      readUtf8(path.resolve(p))
    );
    const overlayJoined = overlayTexts.length
      ? "\n\n" + overlayTexts.join("\n\n")
      : "";

    // Cursor: each source → mirrored path under cursorOut, .mdc extension
    if (outTargets.includes("cursor")) {
      for (const rel of sourceFiles) {
        const abs = path.join(hubDir, rel);
        const raw = readUtf8(abs) + overlayJoined;
        const cursorText = extractTargets(raw, new Set(["all", "cursor"]));

        const outRel = rel
          .replace(/\.rules\.md$/i, ".mdc")
          .replace(/\.md$/i, ".mdc");

        const outPath = path.join(process.cwd(), cursorOut, outRel);
        const header = `<!-- GENERATED: do not edit. repo=${opts.repo} branch=main -->\n`;
        writeFile(outPath, header + cursorText);
      }
    }

    // Codex: bundle 1 file
    if (outTargets.includes("codex")) {
      let bundle = `<!-- GENERATED: do not edit. repo=${opts.repo} branch=main -->\n# AGENTS\n`;
      for (const rel of sourceFiles) {
        const abs = path.join(hubDir, rel);
        const raw = readUtf8(abs) + overlayJoined;
        const codexText = extractTargets(raw, new Set(["all", "codex"]));
        bundle += `\n---\n\n## ${rel}\n\n${codexText}`;
      }

      const outPath = path.join(process.cwd(), codexOut);
      ensureDir(path.dirname(outPath));
      fs.writeFileSync(outPath, bundle, "utf8");
    }

    console.log("✅ Generated:", outTargets.join(", "));
  } finally {
    if (hubDir) cleanupDir(hubDir);
  }
})().catch((e) => {
  console.error("💥", e?.message ?? e);
  process.exit(1);
});
