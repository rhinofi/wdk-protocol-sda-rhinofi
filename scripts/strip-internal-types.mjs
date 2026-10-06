// Removes generated declaration files for modules that are internal to the
// package. `tsc` emits a `.d.ts` for every compiled module, and `stripInternal`
// only blanks `@internal`-tagged *members* — it does not drop whole files. The
// public API surface is the package entrypoint (`index.js` -> `rhinofi-protocol`,
// `errors` and the `types` typedefs), so any other declaration file only leaks
// internals (the mappers, the error-description helper) and is deleted here.
//
// Keeping this as an explicit allow-list (rather than tagging every internal
// export with `@internal`) means new internal modules are stripped by default.

import { readdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const typesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'types')

const PUBLIC_DECLARATIONS = new Set([
  'index.d.ts',
  'src/rhinofi-protocol.d.ts',
  'src/errors.d.ts',
  'src/types.d.ts'
])

const removed = []

const walk = async (dir, base = '') => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      await walk(join(dir, entry.name), rel)
    } else if (rel.endsWith('.d.ts') && !PUBLIC_DECLARATIONS.has(rel)) {
      await rm(join(dir, entry.name))
      removed.push(rel)
    }
  }
}

await walk(typesDir)

if (removed.length > 0) {
  console.log(`Stripped internal type declarations: ${removed.join(', ')}`)
}
