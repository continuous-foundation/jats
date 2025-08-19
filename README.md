# JATS

[![jats-xml on npm](https://img.shields.io/npm/v/jats-xml.svg)](https://www.npmjs.com/package/jats-xml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/continuous-foundation/jats/blob/main/LICENSE)
[![CI](https://github.com/continuous-foundation/jats/workflows/CI/badge.svg)](https://github.com/continuous-foundation/jats/actions)

Types and utilities for working with JATS XML documents in Node and Typescript.

Read and write JATS XML from node or see summaries from the command line.

To use from the command line, use the `-g` to create a global install, which will provide a `jats` CLI:

```
npm install -g jats-cli
jats -v
```

## What is JATS?

JATS is a NISO standard for Journal Article Tags Schema, which is a way to define the XML structure of a scientific article semantically. This includes the `front`-matter (authors, funding, title, abstract, etc.), the `body` of the article (sections, figures, equations, tables, etc.), and `back`-matter (references, footnotes, etc.). The JATS can also contain `sub-articles`.

The standard documents are hosted by the NIH <https://jats.nlm.nih.gov/>. There are three flavours, this library currently uses in most cases the most prescriptive tag set (for article authoring). Another helpful resource is <https://jats4r.org/>, which provides other examples and recommendations for JATS.

Note that most publishers do **not** provide the XML as a first class output - they should, it is an important part of open-science to have the content programmatically accessible and interoperable. It is only [FAIR](https://www.go-fair.org/fair-principles/) 😉.

## What is MECA?

Manuscript Exchange Common Approach (MECA) is a [NISO standard](https://www.niso.org/standards-committees/meca) for transferring scientific manuscripts between vendors. It is a ZIP file with a `manifest.xml`, which contains a JATS file as the `article-metadata` and other source materials.

## Packages

See packages folder:

- [jats-xml](./packages/jats-xml)
- [jats-tags](./packages/jats-tags)
- [jats-fetch](./packages/jats-fetch)
- [meca](./packages/meca)

---

As of v1.0.0 this package is [ESM only](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).

---

<p style="text-align: center; color: #aaa; padding-top: 50px">
  Made with love by
  <a href="https://continuous.foundation" target="_blank" style="color: #aaa">
    Continuous Science Foundation <img src="https://continuous.foundation/images/logo-small.svg" style="height: 1em" />
  </a>
</p>
