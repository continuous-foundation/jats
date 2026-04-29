# meca

[![meca on npm](https://img.shields.io/npm/v/meca.svg)](https://www.npmjs.com/package/meca)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/continuous-foundation/jats/blob/main/LICENSE)
[![CI](https://github.com/continuous-foundation/jats/workflows/CI/badge.svg)](https://github.com/continuous-foundation/jats/actions)

Types and utilities for working with MECA bundles documents in Node and Typescript.

Read and write MECA bundles from node or see summaries from the command line.

To use from the command line, use the `-g` to create a global install, which will provide a `meca` CLI:

```
npm install -g meca
meca -v
```

## What is MECA?

Manuscript Exchange Common Approach (MECA) is a [NISO standard](https://www.niso.org/standards-committees/meca) for transferring scientific manuscripts between vendors. It is a ZIP file with a `manifest.xml`, which contains a JATS file as the `article-metadata` and other source materials.

## From the command line

Commands available:

`validate`: validate the MECA zip file, including the JATS

```bash
meca validate my-meca-file.zip
```

## From Typescript

The `manifest.xml` can be read and written as follows.

```typescript
import fs from 'fs';
import { ManifestXml, createManifestXml } from 'meca';

const data = fs.readFileSync('manifest.xml').toString();
const manifest = new ManifestXml(data);
console.log(manifest.items);

// Write a manifest file
const roundTrip = createManifestXml(manifest.items);
fs.writeFileSync('manifest.xml', roundTrip);
```

The `ManifestItem` has the following shape:

```typescript
type ManifestItem = {
  id?: string;
  itemType?: string;
  version?: string;
  title?: string;
  description?: string;
  href: string;
  mediaType?: string;
  fileOrder?: string;
  metadata?: Record<string, string>;
};
```

which translates to the following XML, for example, from the NISO spec:

```xml
<item id="b-456" item-type="figure" item-version="0">
  <item-description>Figure</item-description>
  <file-order>3</file-order>
  <item-metadata>
    <metadata metadata-name="Figure Number">1</metadata>
    <metadata metadata-name="Caption"
    >This is the caption for Figure 1</metadata>
  </item-metadata>
  <instance media-type="image/jpeg" xlink:href="wrist_scaphoidvx_diagnosis.jpg" />
</item>
```

We assume that there is only one instance for each `item` and will warn if that is not the case.

### transfer.xml

```typescript
import fs from 'fs';
import { TransferXml, createTransferXml } from 'meca';

const data = fs.readFileSync('manifest.xml').toString();
const transfer = new TransferXml(data);
console.log(transfer.source);

// Write a transfer file
const roundTrip = createTransferXml({ source, destination, instructions });
fs.writeFileSync('transfer.xml', roundTrip);
```

The `source` has the following structure:

```typescript
const source = {
  provider: {
    name: 'Aries Systems',
    contact: {
      name: { given: 'Mary', surname: 'Smith' },
      email: 'MarySmith@sample.email',
      phone: '444-555-0101',
    },
  },
  publication: {
    type: 'journal',
    title: 'The Journal of the American Medical Association',
    acronym: 'JAMA',
    contact: {
      email: 'MyJournal@ariessys.com',
    },
  },
};
```

Which creates the following XML:

```xml
<transfer-source>
  <service-provider>
    <provider-name>Aries Systems</provider-name>
    <contact>
      <contact-name>
        <surname>Smith</surname>
        <given-names>Mary</given-names>
      </contact-name>
      <email>MarySmith@sample.email</email>
      <phone>444-555-0101</phone>
    </contact>
  </service-provider>
  <publication type="journal">
    <publication-title>The Journal of the American Medical Association</publication-title>
    <acronym>JAMA</acronym>
    <contact>
      <email>MyJournal@ariessys.com</email>
    </contact>
  </publication>
</transfer-source>
```

---

This package is [ESM only](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).

---

<p style="text-align: center; color: #aaa; padding-top: 50px">
  Made with love by
  <a href="https://continuous.foundation" target="_blank" style="color: #aaa">
    Continuous Science Foundation <img src="https://cdn.curvenote.com/static/site/csf/icon.svg" style="height: 1em" />
  </a>
</p>
