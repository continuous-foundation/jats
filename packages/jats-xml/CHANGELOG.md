# jats-xml

## 1.0.16

### Patch Changes

- 15cd57e: Do not error on top=level xml comment in jats
- Updated dependencies [15cd57e]
  - jats-tags@1.0.16
  - jats-utils@1.0.16

## 1.0.15

### Patch Changes

- Updated dependencies [aa43f62]
  - jats-tags@1.0.15
  - jats-utils@1.0.15

## 1.0.14

### Patch Changes

- Updated dependencies [20b6246]
  - jats-tags@1.0.14
  - jats-utils@1.0.14

## 1.0.13

### Patch Changes

- jats-tags@1.0.13
- jats-utils@1.0.13

## 1.0.12

### Patch Changes

- jats-tags@1.0.12
- jats-utils@1.0.12

## 1.0.11

### Patch Changes

- 493f4fa: Add PMC to frontmatter identifiers
  - jats-tags@1.0.11
  - jats-utils@1.0.11

## 1.0.10

### Patch Changes

- 719058d: Improve affiliation handling
- 719058d: Support author urls
- 719058d: Refactor jats-cli to separate package
- 719058d: Allow missing doctype
- 719058d: Add biorxiv specific transforms
- 719058d: Improve license string collection
- Updated dependencies [719058d]
- Updated dependencies [719058d]
- Updated dependencies [719058d]
  - jats-tags@1.0.10
  - jats-utils@1.0.10

## 1.0.9

### Patch Changes

- f88ba59: Ensure table-wrap has correct order
- Updated dependencies [f88ba59]
  - jats-utils@1.0.9
  - jats-tags@1.0.9
  - jats-fetch@1.0.9

## 1.0.8

### Patch Changes

- 224d4a4: Pull out utilities into stand-alone package
- Updated dependencies [224d4a4]
  - jats-utils@1.0.8
  - jats-tags@1.0.8
  - jats-fetch@1.0.8

## 1.0.7

### Patch Changes

- 8d71b11: premissions --> permissions
- 8d71b11: Allow to modify the tree and write the XML
- Updated dependencies [8d71b11]
  - jats-tags@1.0.7
  - jats-fetch@1.0.7

## 1.0.6

### Patch Changes

- 30cd2c8: Rename `jats-download` to `jats-fetch`
- Updated dependencies [30cd2c8]
  - jats-fetch@1.0.6
  - jats-tags@1.0.6

## 1.0.5

### Patch Changes

- 71402d0: XML read --> unist use the \_type attribute.
- bb9af8b: Relax xmlValidate taking session (only need log)
- 4bb09b5: Update cli-utils and export unist helpers
- 76decdf: Split out download functionality into a separate package.
- 913965b: Change the typescript config and package github
- Updated dependencies [76decdf]
- Updated dependencies [913965b]
  - jats-download@1.0.5
  - jats-tags@1.0.5

## 1.0.4

### Patch Changes

- jats-tags@1.0.4

## 1.0.3

### Patch Changes

- e3a9d1c: Update buffer for download
- 40f42d1: Suppress failure to load external entity warning
  - jats-tags@1.0.3

## 1.0.2

### Patch Changes

- a68640f: Export additional functions and types
  - jats-tags@1.0.2

## 1.0.1

### Patch Changes

- 2da15a2: Update which sync
  - jats-tags@1.0.1

## 1.0.0

### Major Changes

- c1257c0: ESM release of jats-xml

### Patch Changes

- Updated dependencies [c1257c0]
  - jats-tags@1.0.0

## 0.1.0

### Minor Changes

- 8846ec9: Move to using jats-tags for types

### Patch Changes

- e5520ee: Trim CDATA strings, based on pandoc output
- Updated dependencies [8846ec9]
  - jats-tags@0.1.0

## 0.0.17

### Patch Changes

- Add the testing CLI to JATS:

`jats test article.xml --cases tests.yml`

## 0.0.16

### Patch Changes

- f066817: Support JATS authoring and publishing libraries, in addition to archiving
- f066817: Support JATS versions down to 1.1
- a85bab7: Infer JATS version from file content

## 0.0.15

### Patch Changes

- 7a28c41: Add validation command for DTD validation

## 0.0.13

### Patch Changes

- Use peer-dependencies for myst

## 0.0.10

### Patch Changes

- aed76d7: Less selective on unist-util-select dependency

## 0.0.9

### Patch Changes

- 9cde75c: Update packaging

## 0.0.8

### Patch Changes

- 3ea5c4a7: Improve the options for jats resolvers and fetchers to expose these externally.
- Updated dependencies [bfd72456]
- Updated dependencies [e7330dbb]
- Updated dependencies [0a87866d]
- Updated dependencies [6ebaffda]
  - myst-frontmatter@0.0.5
  - myst-common@0.0.11

## 0.0.7

### Patch Changes

- 69beba40: Update readme and documentation
- Updated dependencies [ececeab6]
  - myst-common@0.0.10

## 0.0.6

### Patch Changes

- Updated dependencies [4e27734b]
  - myst-common@0.0.9

## 0.0.5

### Patch Changes

- 566c9ffe: Improve download logic for JATS xml, by looking at the DOI json service.
- 11ff02b4: Update doi-utils to 1.0.9
- Updated dependencies [5403b5b5]
- Updated dependencies [11ff02b4]
  - myst-frontmatter@0.0.4
  - myst-common@0.0.8

## 0.0.4

### Patch Changes

- 19b59f85: Consume `jats-xml` in `myst-to-jats`
- Updated dependencies [97a888c0]
  - myst-common@0.0.7
