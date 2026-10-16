# Highway comparison

The active review compares **this workspace** with
[`biddershighway/highway:main`](https://github.com/biddershighway/highway/tree/0bae38c04fb0e6c9510d7bba659c151f456c095d).
No other local application checkout is used.

Start with [CURRENT-WORKSPACE-COMPARISON.md](CURRENT-WORKSPACE-COMPARISON.md).
It records what exists, confirmed defects fixed locally, remaining functional
gaps, Claude differences and test/deployment limits.

- [Source and workspace inventory](current-workspace-inventory.json)
- [Controller/job coverage](current-workspace-workflow-coverage.json)
- [Reviewed workflow mapping](current-workspace-workflow-map.json)
- [Rebuild script](../../scripts/compare-highway-workspace.mjs)

The current workspace's Git origin remains `ninosdaniel/biddershighway`. This
review uses its working files, including uncommitted changes; it does not claim
that those changes are present on GitHub or deployed to Supabase.

## Superseded comparison

`MAIN-COMPARISON.md`, `main-comparison-inventory.json`, `workflow-coverage.json`,
`schema-diff.json` and `biddershw-main-code-changes.patch` preserve the earlier
comparison against `BiddersHW/biddershighway` commit `303d057`. They describe a
different target and must not be used to judge this workspace. The former local
checkout has been removed by the user. Its patch is historical and is not a
migration for this workspace's `website_private` backend.

`rails-routes-main-20261015.rb` remains an exact source route snapshot at the same
Highway commit. The new current-workspace inventory independently verifies the
freshly downloaded source against GitHub hashes.
