# jats-cli

[![jats-cli on npm](https://img.shields.io/npm/v/jats-cli.svg)](https://www.npmjs.com/package/jats-cli)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/continuous-foundation/jats/blob/main/LICENSE)
[![CI](https://github.com/continuous-foundation/jats/workflows/CI/badge.svg)](https://github.com/continuous-foundation/jats-cli/actions)

Node CLI for working with JATS XML documents.

Read, write, and convert JATS XML and log summaries from the command line.

To use from the command line, use the `-g` to create a global install, which will provide a `jats` CLI:

```
npm install -g jats-cli
jats -v
```

## What is JATS?

JATS is a NISO standard for Journal Article Tags Schema, which is a way to define the XML structure of a scientific article semantically. This includes the `front`-matter (authors, funding, title, abstract, etc.), the `body` of the article (sections, figures, equations, tables, etc.), and `back`-matter (references, footnotes, etc.). The JATS can also contain `sub-articles`.

The standard documents are hosted by the NIH <https://jats.nlm.nih.gov/>. There are three flavours, this library currently uses in most cases the most precriptive tag set (for article authoring). Another helpful resource is <https://jats4r.org/>, which provides other examples and recomendations for JATS.

Note that most publishers do **not** provide the XML as a first class output - they should, it is an important part of open-science to have the content programatically accessible and interoperable. It is only [FAIR](https://www.go-fair.org/fair-principles/) 😉.

## From the command line

Commands available:

`download`: attempt to find the JATS file and download it locally.

```bash
jats download https://elifesciences.org/articles/81952 -o article.jats
```

For some Open Access PMC articles, you may download associated files with the `--data` option.

```bash
jats download PMC11025918 --data
```

`convert`: convert a JATS file to MyST-compatible JSON. The `--frontmatter project` option will write frontmatter to a `myst.yml` file.

```bash
jats convert article.jats --frontmatter project
```

`summary`: summarize the contents of the JATS, given a URL, DOI, or local file

```bash
jats summary https://elifesciences.org/articles/81952
jats summary 10.1371/journal.pclm.0000068
jats summary /local/article.jats
```

This will provide a summary, including a list of what the JATS file contains.

![Output of `jats summary`](/images/jats-output.png)

`validate`: validate local file against JATS Archive DTD schema. By default, this uses JATS 1.3.

```bash
jats validate article.jats --jats 1.2 --mathmml 2
```

`test`: test a JATS file against a list of unit tests in YAML

The test cases are useful for known exports and expecting specific pieces of information in the XML.

```bash
jats test article.jats --cases tests.yml
```

```yaml
cases:
  - title: Correct publisher ID (publisher-id)
    select: 'front > journal-meta > journal-id[journal-id-type="publisher-id"] > *'
    equals:
      type: text
      value: plos
  - title: Every orcid is authenticated
    selectAll: 'front > article-meta > contrib-group > contrib > contrib-id'
    equals:
      contrib-id-type: orcid
      authenticated: 'true'
```

---

As of v1.0.0 this package is [ESM only](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).

---

<p style="text-align: center; color: #aaa; padding-top: 50px">
  Made with love by
  <a href="https://continuous.foundation" target="_blank" style="color: #aaa">
    Continuous Science Foundation <img src="https://cdn.curvenote.com/static/site/csf/icon.svg" style="height: 1em" />
  </a>
</p>
