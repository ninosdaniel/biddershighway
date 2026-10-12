// Generates source-only files for a reviewed deployment using the Supabase UI.
// No secrets or data are included. Remove public/__deployment after use.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { build } from "esbuild";
const directory = path.resolve("public/__deployment");
await fs.mkdir(directory, { recursive: true });
const fromVersion = process.argv[2] || "20261012000200";
if (!/^\d{14}$/.test(fromVersion))
  throw new Error("Expected a 14-digit starting migration version");
const files = (await fs.readdir("supabase/migrations"))
  .filter((name) => name.endsWith(".sql") && name.slice(0, 14) >= fromVersion)
  .sort();
let sql =
  "begin;\nset local lock_timeout='5s';\nset local statement_timeout='90s';\n";
for (const name of files) {
  const source = await fs.readFile(`supabase/migrations/${name}`, "utf8");
  sql += `\n-- ${name}\n${source.replace(/^begin;\s*$/im, "").replace(/^commit;\s*$/im, "")}\n`;
  const [version, ...parts] = name.replace(/\.sql$/, "").split("_");
  const hash = crypto.createHash("sha256").update(source).digest("hex");
  sql += `insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${parts.join("_")}',array['Applied through dashboard; source sha256 ${hash}']);\n`;
}
sql +=
  "commit;\nselect key,value from website_private.settings order by key;\n";
await fs.writeFile(path.join(directory, "migrations.txt"), sql);
const reviewPage = (source) =>
  `<!doctype html><html lang="en"><head><meta name="robots" content="noindex"><title>Deployment source review</title></head><body><h1>Deployment source review</h1><p>Source code only. No credentials or customer data.</p><label for="source">Deployment source</label><textarea id="source" readonly rows="25" cols="120">${source.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</textarea></body></html>`;
await fs.writeFile(path.join(directory, "migrations.html"), reviewPage(sql));
for (const name of ["website-api", "website-cron", "website-webhooks"]) {
  const result = await build({
    entryPoints: [`supabase/functions/${name}/index.ts`],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    minify: false,
    plugins: [
      {
        name: "deno-imports",
        setup(b) {
          b.onResolve(
            { filter: /^(?:@supabase\/supabase-js|cheerio)$/ },
            (args) => ({
              path:
                args.path === "cheerio"
                  ? "npm:cheerio@1.2.0"
                  : "npm:@supabase/supabase-js@2.117.3",
              external: true,
            }),
          );
        },
      },
    ],
  });
  await fs.writeFile(
    path.join(directory, `${name}.txt`),
    result.outputFiles[0].text,
  );
  await fs.writeFile(
    path.join(directory, `${name}.html`),
    reviewPage(result.outputFiles[0].text),
  );
}
console.log(
  `Prepared ${files.length} migrations and 3 Edge bundles in public/__deployment (temporary).`,
);
