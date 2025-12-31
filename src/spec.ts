import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export type RulesSpec = {
  sources: string[]; // glob patterns in hub repo
  overlays?: string[]; // local files in project
  outputs?: {
    cursor?: { path: string };
    codex?: { path: string };
  };
};

export const DEFAULT_SPEC: RulesSpec = {
  sources: ["rules/**/*.rules.md", "rules/**/*.md"],
  overlays: [],
};

function readSpecFile(specPath: string): RulesSpec {
  const abs = path.resolve(specPath);
  const raw = fs.readFileSync(abs, "utf8");
  const data = yaml.load(raw) as any;

  if (!data || !Array.isArray(data.sources) || data.sources.length === 0) {
    throw new Error(`Invalid spec: "sources" must be a non-empty array`);
  }

  return data as RulesSpec;
}

export function readSpec(specPath: string): RulesSpec {
  return readSpecFile(specPath);
}

export function loadSpec(specPath?: string): RulesSpec {
  if (specPath) return readSpecFile(specPath);

  const defaultPath = path.resolve("rules.yaml");
  if (fs.existsSync(defaultPath)) return readSpecFile(defaultPath);

  return DEFAULT_SPEC;
}
