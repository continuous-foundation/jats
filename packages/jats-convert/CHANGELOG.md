# jats-convert

## 1.0.16

### Patch Changes

- 15cd57e: Support figures with media instead of graphics
- 15cd57e: Fix boxed-text admonitions
- Updated dependencies [15cd57e]
- Updated dependencies [15cd57e]
- Updated dependencies [7adb975]
- Updated dependencies [b980e20]
  - jats-tags@1.0.16
  - jats-xml@1.0.16
  - jats-fetch@1.0.16

## 1.0.15

### Patch Changes

- aa43f62: Create figure from supplementary material media
- Updated dependencies [aa43f62]
  - jats-tags@1.0.15
  - jats-xml@1.0.15
  - jats-fetch@1.0.15

## 1.0.14

### Patch Changes

- 20b6246: Allow jats convert to find xml if there is only one
- 20b6246: Support xrefs to boxed-text
- 20b6246: Remove data availability title from part
- 20b6246: Reorganize and simplify jats transform functions
- 20b6246: Correctly support jats citation element
- 20b6246: Correctly normalize math labels and identifiers
- 20b6246: Basic support for appendices
- 20b6246: Support email element
- 20b6246: Fix citation range filling
- 20b6246: Support media ref type
- 20b6246: Support text disp-formulas
- 20b6246: Add unparsed citations as notes in bibtex
- 20b6246: Footnotes: extract abbreviations, leave unreferenced table fns in table legend
- 20b6246: Basic automatic parsing of abbreviations
- Updated dependencies [20b6246]
  - jats-tags@1.0.14
  - jats-xml@1.0.14
  - jats-fetch@1.0.14

## 1.0.13

### Patch Changes

- Updated dependencies [aa53c1d]
  - jats-fetch@1.0.13
  - jats-xml@1.0.13
  - jats-tags@1.0.13

## 1.0.12

### Patch Changes

- 475d4be: Do not include footnote reference children in the tree
- 475d4be: Remove redundant acknowledgments title
- Updated dependencies [475d4be]
  - jats-fetch@1.0.12
  - jats-xml@1.0.12
  - jats-tags@1.0.12

## 1.0.11

### Patch Changes

- 493f4fa: Handle floating supplementary material
- 493f4fa: Ensure logged error messages are reported
- 493f4fa: Always write title to page frontmatter
- 493f4fa: Basic support for jats alternatives node
- Updated dependencies [493f4fa]
- Updated dependencies [493f4fa]
- Updated dependencies [493f4fa]
  - jats-xml@1.0.11
  - jats-fetch@1.0.11
  - jats-tags@1.0.11

## 1.0.10

### Patch Changes

- 719058d: Refactor jats-cli to separate package
- 719058d: Add option to build bibtex entry even if doi is present
- 719058d: Add abstract transforms and get description from abstract
- 719058d: Fill in hyphen-deleniated citations
- 719058d: Add transform to pull abbreviations from section
- 719058d: Convert backmatter footnotes and sections
- 719058d: Improve license string collection
- 719058d: Start fixing mis-formatted inline citations
- 719058d: Basic support for supplementary-material
- 719058d: Remove keys transform
- 719058d: Add options for how frontmatter is written from jats
- 719058d: Support graphics outside figures and table captions as titles
- 719058d: Support JATS references with DOI, PMID, bibtex generation
- Updated dependencies [719058d]
- Updated dependencies [719058d]
- Updated dependencies [719058d]
- Updated dependencies [719058d]
- Updated dependencies [719058d]
- Updated dependencies [719058d]
- Updated dependencies [719058d]
- Updated dependencies [719058d]
- Updated dependencies [719058d]
- Updated dependencies [719058d]
- Updated dependencies [719058d]
  - jats-fetch@1.0.10
  - jats-xml@1.0.10
  - jats-tags@1.0.10
