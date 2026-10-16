// Inventory the pinned GitHub source against the workspace that runs this script.
// No Git clone, network requests, credentials, database writes or deployments.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const [sourceDirectory, treeFile] = process.argv.slice(2);
if (!sourceDirectory || !treeFile) throw new Error("Usage: node scripts/compare-highway-workspace.mjs /path/to/source-snapshot /path/to/github-tree.json");
const commit = "0bae38c04fb0e6c9510d7bba659c151f456c095d";
const tree = JSON.parse(readFileSync(treeFile, "utf8"));
if (tree.truncated || tree.sha !== commit) throw new Error("Wrong or incomplete GitHub tree; review and repin the source first.");
const cwd = process.cwd();
if (!existsSync("supabase/functions/website-api/index.ts")) throw new Error("Run from the current website_private workspace.");
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 10_000_000 }).trimEnd();
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const folders = ["app/controllers", "app/jobs", "app/models", "app/policies", "app/services", "app/mailers", "app/views", "app/pdfs", "app/javascript", "config", "lib/tasks"];
const files = tree.tree.filter(entry => entry.type === "blob" && folders.some(folder => entry.path.startsWith(`${folder}/`)) && /\.(rb|js|yml|yaml|rake|cr)$/.test(entry.path));
const sourceFiles = files.map(entry => {
  if (entry.path.split("/").includes("..")) throw new Error("Invalid source path");
  const bytes = readFileSync(path.join(sourceDirectory, entry.path));
  const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  if (blob !== entry.sha) throw new Error(`Source differs from GitHub: ${entry.path}`);
  const content = bytes.toString("utf8");
  return { path: entry.path, git_blob: blob, sha256: sha256(bytes), github_url: `https://github.com/biddershighway/highway/blob/${commit}/${entry.path}`,
    methods: [...content.matchAll(/^[ \t]*def[ \t]+([^\s(;]+)/gm)].map(match => ({ name: match[1], line: content.slice(0, match.index).split("\n").length })) };
});
const paths = [...new Set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "src", "supabase", "scripts", "package.json", "package-lock.json", "next.config.mjs", "AGENTS.md").split("\0").filter(Boolean))].sort();
const workspaceFiles = paths.filter(filename => existsSync(filename)).map(filename => ({ path: filename, sha256: sha256(readFileSync(filename)) }));
const source = { repository: "biddershighway/highway", branch: "main", commit };
const target = { directory: cwd, origin: git("remote", "get-url", "origin"), head: git("rev-parse", "HEAD"), includes_working_tree_changes: true,
  code_fingerprint: sha256(JSON.stringify(workspaceFiles)), files: workspaceFiles };
const groups = JSON.parse(readFileSync("docs/port/current-workspace-workflow-map.json", "utf8"));
for (const group of groups) for (const filename of group.target_paths) if (!existsSync(filename)) throw new Error(`Missing review evidence: ${filename}`);
const workflows = sourceFiles.filter(file => /app\/(controllers|jobs)\//.test(file.path)).map(file => {
  const group = groups.find(group => group.patterns.some(pattern => new RegExp(pattern).test(file.path)));
  return { ...file, review_group: group?.id || "unmapped", status: group?.status || "not_reviewed", target_paths: group?.target_paths || [],
    gap: group?.gap || "No reviewed mapping yet; do not treat this file as ported." };
});
const counts = entries => Object.fromEntries([...new Set(entries.map(entry => entry.status))].sort().map(status => [status, entries.filter(entry => entry.status === status).length]));
const note = "Static workflow mapping, not a parity percentage. Partial means related implementation exists but source-equivalent behavior or acceptance remains incomplete. Framework/support files and unrouted legacy code need an explicit compatibility decision. Methods are lexical Ruby declarations, not all runtime Rails actions. Live Supabase/provider state is not verified.";
writeFileSync("docs/port/current-workspace-inventory.json", JSON.stringify({ source, target, source_counts: Object.fromEntries(folders.map(folder => [folder, sourceFiles.filter(file => file.path.startsWith(`${folder}/`)).length])), source_method_count: sourceFiles.reduce((n, file) => n + file.methods.length, 0), note, source_files: sourceFiles }, null, 2) + "\n");
writeFileSync("docs/port/current-workspace-workflow-coverage.json", JSON.stringify({ source, target: { ...target, files: undefined }, counts: { controllers: counts(workflows.filter(file => file.path.startsWith("app/controllers/"))), jobs: counts(workflows.filter(file => file.path.startsWith("app/jobs/"))) }, note, workflows }, null, 2) + "\n");
console.log(JSON.stringify({ source: commit, target: target.origin, source_files: sourceFiles.length, workspace_files: workspaceFiles.length, workflows: workflows.length, statuses: counts(workflows), code_fingerprint: target.code_fingerprint }, null, 2));
