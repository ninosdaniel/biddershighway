// Reads structural Rails schema only. Never reads data, credentials or config.
import fs from "node:fs";
const source = process.argv[2];
if (!source) throw new Error("Pass the original db/schema.rb path");
const schema = fs.readFileSync(source, "utf8");
const tables = new Set([
  "users",
  "auctions",
  "lots",
  "bids",
  "max_bids",
  "bookmarks",
  "offers",
  "leads",
  "notifications",
  "comments",
  "albums",
  "images",
  "tags",
  "taggings",
  "user_interests",
  "classifieds",
]);
let sql = `-- Structure fixture generated from Highway commit 1946e6e; no user records.\ncreate role anon; create role authenticated; create role service_role;\ncreate schema auth;\ncreate table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');\n`;
for (const table of schema.matchAll(
  /  create_table "([^"]+)"([^\n]*)\n([\s\S]*?)^  end/gm,
)) {
  if (!tables.has(table[1])) continue;
  const columns = [
    `id ${table[2].includes(":uuid") ? "uuid default gen_random_uuid()" : "bigserial"} primary key`,
  ];
  for (const match of table[3].matchAll(/^    t\.(\w+) "([^"]+)"([^\n]*)/gm)) {
    const [, type, name, options] = match;
    const types = {
      string: "text",
      text: "text",
      uuid: "uuid",
      integer: "integer",
      bigint: "bigint",
      serial: "serial",
      datetime: "timestamptz",
      timestamptz: "timestamptz",
      boolean: "boolean",
      float: "double precision",
      decimal: "numeric",
      jsonb: "jsonb",
      date: "date",
    };
    if (!(type in types)) continue;
    let def = "";
    const d = options.match(
      /default: ("[^"]*"|\[\]|\{\}|true|false|-?[\d.]+|-> \{ "([^"]+)" \})/,
    );
    if (d) {
      const raw = d[1];
      if (d[2]) def = d[2];
      else if (raw === "[]")
        def = options.includes("array: true") ? "'{}'" : "'[]'";
      else if (raw === "{}") def = "'{}'";
      else if (raw.startsWith('"'))
        def = "'" + JSON.parse(raw).replaceAll("'", "''") + "'";
      else def = raw;
    }
    columns.push(
      `"${name}" ${types[type]}${options.includes("array: true") ? "[]" : ""}${def ? " default " + def : ""}${options.includes("null: false") ? " not null" : ""}`,
    );
  }
  sql += `create table public.${table[1]} (${columns.join(",\n")});\n`;
}
sql += `create unique index users_email_ci on public.users(lower(email));\ncreate unique index bookmark_user_auction on public.bookmarks(auction_id,user_id);\ncreate unique index interests_user_category on public.user_interests(user_id,category);\n`;
fs.mkdirSync("supabase/tests/fixtures", { recursive: true });
fs.writeFileSync("supabase/tests/fixtures/highway-schema.sql", sql);
