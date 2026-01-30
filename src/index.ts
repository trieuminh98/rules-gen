#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import { Command } from "commander";
import fg from "fast-glob";
import yaml from "js-yaml";

import { cloneMain, cleanupDir } from "./git.js";
import { loadSpec } from "./spec.js";
import { extractTargets } from "./extractTargets.js";
import { ensureDir, writeFile, isDirPath, ensureSymlink } from "./write.js";
import { ensureGitignorePatterns } from "./gitignore.js";

function splitOut(v: string) {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as Array<"cursor" | "codex">;
}

function splitKinds(v: string) {
  const kinds = v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const k of kinds) {
    if (k !== "rules" && k !== "skills") {
      throw new Error(`Invalid kind "${k}". Use "rules" and/or "skills".`);
    }
  }
  return kinds as Array<"rules" | "skills">;
}

function readUtf8(p: string) {
  return fs.readFileSync(p, "utf8");
}

function addHeaderAfterFrontmatter(body: string, header: string): string {
  if (body.startsWith("---\n")) {
    const end = body.indexOf("\n---", 3);
    if (end !== -1) {
      const fmEnd = end + "\n---".length;
      return body.slice(0, fmEnd + 1) + header + body.slice(fmEnd + 1);
    }
  }
  return header + body;
}

function splitFrontmatter(text: string): {
  frontmatter: Record<string, any>;
  frontmatterRaw: string | null;
  body: string;
} {
  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---", 3);
    if (end !== -1) {
      const fmEnd = end + 4; // include closing ---\n
      const fmRaw = text.slice(0, fmEnd);
      const fmContent = fmRaw.replace(/^---\n/, "").replace(/\n---$/, "");
      const fmData = yaml.load(fmContent) as any;
      const body = text.slice(fmEnd).replace(/^\n/, "");
      return {
        frontmatter: fmData && typeof fmData === "object" ? fmData : {},
        frontmatterRaw: fmRaw + "\n",
        body,
      };
    }
  }
  return { frontmatter: {}, frontmatterRaw: null, body: text };
}

const program = new Command();

program
  .name("rules-gen")
  .requiredOption("--repo <git-url>", "Rules hub git repo (main branch)")
  .option(
    "--spec <rules.yaml>",
    "Optional YAML spec in current project (defaults to rules.yaml if present)",
  )
  .option("--kind <list>", "rules,skills", "rules,skills")
  .option("--out <list>", "cursor,codex", "cursor,codex")
  .option("--cursor-out <path>", "Rules Cursor output folder (default .cursor/rules)")
  .option("--codex-out <path>", "Rules Codex output file or folder (default AGENTS.md)")
  .option("--skills-cursor-out <path>", "Skills Cursor output folder (default .cursor/skills)")
  .option("--skills-codex-out <path>", "Skills Codex output folder (default .codex/skills)")
  .option("--skills-root <path>", "Skills shared output folder (default .agent/skills)");

program.parse(process.argv);
const opts = program.opts();

const outTargets = splitOut(opts.out);
const kindTargets = splitKinds(opts.kind);

(async () => {
  const spec = loadSpec(opts.spec);

  // defaults (CLI override > spec.outputs > default)
  const rulesCursorOut = opts.cursorOut ?? spec.rules.outputs?.cursor?.path ?? ".cursor/rules";
  const rulesCodexOutRaw = opts.codexOut ?? spec.rules.outputs?.codex?.path ?? "AGENTS.md";

  const skillsCursorOut =
    opts.skillsCursorOut ?? spec.skills.outputs?.cursor?.path ?? ".cursor/skills";
  const skillsCodexOut = opts.skillsCodexOut ?? spec.skills.outputs?.codex?.path ?? ".codex/skills";
  const skillsRoot = opts.skillsRoot ?? spec.skills.outputs?.agent?.path ?? ".agent/skills";

  // codex-out can be folder or file
  const rulesCodexOut = isDirPath(rulesCodexOutRaw)
    ? path.join(rulesCodexOutRaw, "AGENTS.md")
    : rulesCodexOutRaw;

  if (kindTargets.includes("skills")) {
    if (outTargets.includes("cursor") && !isDirPath(skillsCursorOut)) {
      throw new Error(`Skills cursor output must be a directory. got="${skillsCursorOut}"`);
    }
    if (outTargets.includes("codex") && !isDirPath(skillsCodexOut)) {
      throw new Error(`Skills codex output must be a directory. got="${skillsCodexOut}"`);
    }
    if (!isDirPath(skillsRoot)) {
      throw new Error(`Skills root output must be a directory. got="${skillsRoot}"`);
    }
  }

  const gitignoreTargets: string[] = [];
  if (outTargets.includes("cursor")) gitignoreTargets.push(".cursor");
  if (outTargets.includes("codex")) {
    gitignoreTargets.push(".codex");
    if (kindTargets.includes("rules")) gitignoreTargets.push("AGENTS.md");
  }
  if (kindTargets.includes("skills")) gitignoreTargets.push(".agent");

  ensureGitignorePatterns(gitignoreTargets);

  let hubDir: string | null = null;
  try {
    hubDir = await cloneMain(opts.repo);
    const repoDir = hubDir;

    const header = `<!-- GENERATED: do not edit. repo=${opts.repo} branch=main -->\n`;

    if (!repoDir) throw new Error("Failed to clone repo");

    const resolveSources = async (patterns: string[], label: string) => {
      if (!patterns || patterns.length === 0) {
        throw new Error(`No source patterns for ${label}`);
      }
      const files = (await fg(patterns, {
        cwd: repoDir,
        dot: true,
      })) as string[];
      const normalized = files.map((p) => p.replace(/\\/g, "/")).sort();
      if (files.length === 0) {
        throw new Error(
          `No source files matched in hub repo for ${label}. patterns=${patterns.join(", ")}`,
        );
      }
      return normalized;
    };

    const overlayText = (overlays: string[]) => {
      const overlayTexts = overlays.map((p) => readUtf8(path.resolve(p)));
      return overlayTexts.length ? "\n\n" + overlayTexts.join("\n\n") : "";
    };

    const toCursorRel = (relNoPrefix: string) =>
      relNoPrefix.replace(/\.rules?\.md$/i, ".mdc").replace(/\.md$/i, ".mdc");
    const toSkillRel = (relNoPrefix: string) => relNoPrefix.replace(/\\/g, "/");

    if (kindTargets.includes("rules")) {
      const sourceFiles = await resolveSources(spec.rules.sources, "rules");
      const overlayJoined = overlayText(spec.rules.overlays ?? []);

      if (outTargets.includes("cursor")) {
        for (const rel of sourceFiles) {
          const abs = path.join(repoDir, rel);
          const raw = readUtf8(abs) + overlayJoined;
          const { frontmatterRaw, body } = splitFrontmatter(raw);
          const cursorText = extractTargets(body, new Set(["all", "cursor"]));
          const cursorWithFm = (frontmatterRaw ?? "") + cursorText;

          const relNoPrefix = rel.replace(/^rules[\\/]/, "");
          const outRel = toCursorRel(relNoPrefix);

          const outPath = path.join(process.cwd(), rulesCursorOut, outRel);
          writeFile(outPath, addHeaderAfterFrontmatter(cursorWithFm, header));
        }
      }

      if (outTargets.includes("codex")) {
        let bundle = `${header}# AGENTS\n`;

        for (const rel of sourceFiles) {
          const abs = path.join(repoDir, rel);
          const raw = readUtf8(abs) + overlayJoined;
          const { frontmatter, body } = splitFrontmatter(raw);
          const codexText = extractTargets(body, new Set(["all", "codex"]));
          const relNoPrefix = rel.replace(/^rules[\\/]/, "");

          // build AGENTS: alwaysApply true => inline content; otherwise point to cursor rule
          const alwaysApply = frontmatter?.alwaysApply;
          const description =
            typeof frontmatter?.description === "string" ? frontmatter.description : "";
          const globs =
            Array.isArray(frontmatter?.globs) && frontmatter.globs.length
              ? frontmatter.globs.join(", ")
              : "";
          const cursorRel = toCursorRel(relNoPrefix);
          const cursorPath = path.join(rulesCursorOut, cursorRel).replace(/\\/g, "/");

          const sectionHeader = `\n---\n\n## ${rel}\n\n`;
          const metaLines: string[] = [];
          if (description) metaLines.push(`> ${description}`);
          if (globs) metaLines.push(`> globs: ${globs}`);
          const alwaysApplyFlag =
            typeof alwaysApply === "string" ? alwaysApply.toLowerCase() === "true" : !!alwaysApply;
          metaLines.push(`> alwaysApply: ${alwaysApplyFlag}`);

          if (alwaysApplyFlag) {
            bundle += sectionHeader;
            if (metaLines.length) bundle += metaLines.join("\n") + "\n\n";
            bundle += codexText;
          } else {
            bundle += sectionHeader;
            if (metaLines.length) bundle += metaLines.join("\n") + "\n\n";
            bundle += `- See cursor rule: ${cursorPath}\n`;
          }
        }

        const outPath = path.join(process.cwd(), rulesCodexOut);
        ensureDir(path.dirname(outPath));
        fs.writeFileSync(outPath, bundle, "utf8");
      }
    }

    if (kindTargets.includes("skills")) {
      const sourceFiles = await resolveSources(spec.skills.sources, "skills");
      const overlayJoined = overlayText(spec.skills.overlays ?? []);

      const includeSkillsOutput = outTargets.includes("cursor") || outTargets.includes("codex");

      if (includeSkillsOutput) {
        for (const rel of sourceFiles) {
          const abs = path.join(repoDir, rel);
          const raw = readUtf8(abs) + overlayJoined;
          const { frontmatterRaw, body } = splitFrontmatter(raw);
          const skillText = extractTargets(body, new Set(["all", "cursor", "codex"]));
          const skillWithFm = (frontmatterRaw ?? "") + skillText;

          const relNoPrefix = rel.replace(/^skills[\\/]/, "");
          const outRel = toSkillRel(relNoPrefix);

          const outPath = path.join(process.cwd(), skillsRoot, outRel);
          writeFile(outPath, addHeaderAfterFrontmatter(skillWithFm, header));
        }
      }

      if (outTargets.includes("cursor")) {
        ensureSymlink(skillsRoot, skillsCursorOut);
      }
      if (outTargets.includes("codex")) {
        ensureSymlink(skillsRoot, skillsCodexOut);
      }
    }

    console.log("✅ Generated:", outTargets.join(", "), "for", kindTargets.join(", "));
  } finally {
    if (hubDir) cleanupDir(hubDir);
  }
})().catch((e) => {
  console.error("💥", e?.message ?? e);
  process.exit(1);
});
