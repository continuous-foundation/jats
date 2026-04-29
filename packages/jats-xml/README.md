# jats-xml

[![jats-xml on npm](https://img.shields.io/npm/v/jats-xml.svg)](https://www.npmjs.com/package/jats-xml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/continuous-foundation/jats-xml/blob/main/LICENSE)
[![CI](https://github.com/continuous-foundation/jats-xml/workflows/CI/badge.svg)](https://github.com/continuous-foundation/jats-xml/actions)

Types and utilities for working with JATS XML documents in Node and Typescript.

## What is JATS?

JATS is a NISO standard for Journal Article Tags Schema, which is a way to define the XML structure of a scientific article semantically. This includes the `front`-matter (authors, funding, title, abstract, etc.), the `body` of the article (sections, figures, equations, tables, etc.), and `back`-matter (references, footnotes, etc.). The JATS can also contain `sub-articles`.

The standard documents are hosted by the NIH <https://jats.nlm.nih.gov/>. There are three flavours, this library currently uses in most cases the most prescriptive tag set (for article authoring). Another helpful resource is <https://jats4r.org/>, which provides other examples and recommendations for JATS.

Note that most publishers do **not** provide the XML as a first class output - they should, it is an important part of open-science to have the content programmatically accessible and interoperable. It is only [FAIR](https://www.go-fair.org/fair-principles/) 😉.

## Working in Typescript

All tags are accessible as types/enums. There is also documentation from each node-type

```typescript
import { Tags } from 'jats-xml';

Tags.journalId;
```

## Reading JATS in Node

```typescript
import 'fs' from 'fs';
import { Inventory, toDate } from 'jats-xml';
import { toText } from 'myst-common';
import { select, selectAll } from 'unist-util-select';

const data = fs.readFileSync('article.jats').toString();
const jats = new JATS(data);
// Easy access to properties
jats.doi
jats.body // A tree of the body (or front/back)
toDate(jats.publicationDate) // as a Javascript Date object
select('[id=fig1]', jats.body) // select a figure by an ID
selectAll('fig', jats.body) // Or selectAll figures
```

## Write JATS in Node

TODO!

---

As of v1.0.0 this package is [ESM only](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).

---

<p style="text-align: center; color: #aaa; padding-top: 50px">
  Made with love by
  <a href="https://continuous.foundation" target="_blank" style="color: #aaa">
    Continuous Science Foundation <img src="https://cdn.curvenote.com/static/site/csf/icon.svg" style="height: 1em" />
  </a>
</p>
