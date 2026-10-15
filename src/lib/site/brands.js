// Match the original AliasMatchable rules, including PV 444/PV444 and 9-3/93.
export function aliasMatchLength(value, entry) {
  value = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  return Math.max(
    0,
    ...[entry.name, ...(entry.aliases || [])].map((alias) => {
      const normalized = String(alias || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
      const runs = normalized.match(/[\p{L}]+|[0-9]+/gu);
      if (!runs) return 0;
      let pattern = runs[0];
      for (let i = 1; i < runs.length; i++) {
        pattern +=
          (/^\d/.test(runs[i - 1]) === /^\d/.test(runs[i])
            ? "[^\\p{L}\\p{N}]+"
            : "[^\\p{L}\\p{N}]*") + runs[i];
      }
      pattern += /^\d/.test(runs.at(-1)) ? "([^0-9]|$)" : "([^\\p{L}\\p{N}]|$)";
      return new RegExp(`^${pattern}`, "u").test(value) ? normalized.length : 0;
    }),
  );
}

export function matchingEntry(value, entries) {
  return entries
    .map((entry) => ({ entry, length: aliasMatchLength(value, entry) }))
    .filter(({ length }) => length > 0)
    .sort((a, b) => b.length - a.length)[0]?.entry;
}

export function brandListings(rows, brands, brand, model) {
  return rows.filter(
    (row) =>
      row.vehicle_type === brand.vehicle_type &&
      matchingEntry(
        row.manufacturer,
        brands.filter((item) => item.vehicle_type === brand.vehicle_type),
      )?.slug === brand.slug &&
      (!model || matchingEntry(row.model, brand.models)?.slug === model.slug),
  );
}
