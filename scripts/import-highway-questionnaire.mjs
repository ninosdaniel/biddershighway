import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const commit = "0bae38c04fb0e6c9510d7bba659c151f456c095d";
const [sourceDirectory, treeFile] = process.argv.slice(2);
if (!sourceDirectory || !treeFile)
  throw new Error(
    "Usage: node scripts/import-highway-questionnaire.mjs SOURCE_DIRECTORY GITHUB_TREE_JSON",
  );
const tree = JSON.parse(await fs.readFile(treeFile, "utf8"));
if (tree.sha !== commit || tree.truncated)
  throw new Error("Wrong or incomplete source tree");
const paths = ["app/models/questionnaire/schema.rb", "config/locales/sv.yml"];
const source = {};
const hashes = {};
for (const file of paths) {
  const bytes = await fs.readFile(path.join(sourceDirectory, file));
  const hash = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  if (tree.tree.find((entry) => entry.path === file)?.sha !== hash)
    throw new Error(`Source hash mismatch: ${file}`);
  source[file] = bytes.toString("utf8");
  hashes[file] = hash;
}
const translations = {};
for (const line of source[paths[1]].split("\n")) {
  const entry = line.match(
    /^(sv\.(?:activerecord\.attributes\.questionnaire\.|components\.questionnaires\.choice_component\.scale\.)[^:]+): (".*")\s*$/,
  );
  if (entry) translations[entry[1]] = JSON.parse(entry[2]);
}
const schemas = {};
let current, section;
for (const raw of source[paths[0]].split("\n")) {
  const line = raw.split("#")[0].trim();
  const definition = line.match(/^Questionnaire::Schema.define\(:(\w+)\) do$/);
  if (definition) {
    current = schemas[definition[1]] = [];
    continue;
  }
  if (!current || !line || line === "end") continue;
  const heading = line.match(/^section :(\w+) do$/);
  if (heading) {
    section = heading[1];
    continue;
  }
  const question = line.match(
    /^(enum|number|boolean|ternary|scale|text|long_text)\s+:(\w+)(.*)$/,
  );
  if (!question) throw new Error(`Unrecognized schema line: ${line}`);
  const [, type, key, options] = question;
  const label = translations[`sv.activerecord.attributes.questionnaire.${key}`];
  if (!label) throw new Error(`Missing Swedish label: ${key}`);
  const reveal = options.match(/reveal: :(\w+)/)?.[1];
  current.push({
    key,
    type,
    section,
    label,
    ...(reveal ? { reveal } : {}),
    ...(options.includes("reveal_only: true") ? { reveal_only: true } : {}),
    ...(type === "scale"
      ? {
          points: Number(options.match(/points: (\d+)/)?.[1] || 4),
          harmonize: options.match(/harmonize: :(\w+)/)?.[1] || "high",
        }
      : {}),
  });
}
for (const questions of Object.values(schemas)) {
  if (!questions.length) throw new Error("Empty schema");
  for (const q of questions)
    if (
      q.reveal &&
      !questions.some((detail) => detail.key === q.reveal && detail.reveal_only)
    )
      throw new Error(`Missing follow-up: ${q.reveal}`);
}
const data = {
  source: { repository: "biddershighway/highway", commit, blobs: hashes },
  scale_labels: Object.fromEntries(
    [1, 2, 3, 4].map((n) => [
      n,
      translations[`sv.components.questionnaires.choice_component.scale.${n}`],
    ]),
  ),
  schemas,
};
await fs.writeFile(
  new URL(
    "../supabase/functions/_shared/questionnaire-schema.json",
    import.meta.url,
  ),
  JSON.stringify(data, null, 2) + "\n",
);
console.log(
  Object.fromEntries(
    Object.entries(schemas).map(([key, questions]) => [key, questions.length]),
  ),
);
