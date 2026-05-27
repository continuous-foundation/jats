import type { GenericNode, GenericParent } from 'myst-common';
import { toText } from 'myst-common';
import type { Node } from 'myst-spec';
import { doi } from 'doi-utils';
import { select, selectAll } from 'unist-util-select';
import type { Affiliation, ArticleId, Contrib, LinkMixin, Xref } from 'jats-tags';
import { Tags } from 'jats-tags';
import type { Affiliation as AffiliationFM, Contributor as ContributorFM } from 'myst-frontmatter';
import { remove } from 'unist-util-remove';

export type PubIdTypes = 'doi' | 'pmc' | 'pmid' | 'publisher-id' | string;

export function findArticleId(
  node: GenericParent | undefined,
  pubIdType: PubIdTypes = 'doi',
): string | undefined {
  if (!node) return undefined;
  const id = select(`[pub-id-type=${pubIdType}]`, node);
  if (id && toText(id)) return toText(id);
  const doiTag = (selectAll(`${Tags.articleId},${Tags.pubId}`, node) as ArticleId[]).find((t) =>
    doi.validate(toText(t)),
  );
  return toText(doiTag) || undefined;
}

export function processContributor(contrib: Contrib): ContributorFM {
  const author: ContributorFM = {
    name: `${toText(select(Tags.givenNames, contrib))} ${toText(select(Tags.surname, contrib))}`,
  };
  const orcid = select('[contrib-id-type=orcid]', contrib);
  if (orcid) {
    author.orcid = toText(orcid).replace(/(https?:\/\/)?orcid\.org\//, '');
  }
  const affiliationRefs = selectAll('xref[ref-type=aff]', contrib) as Xref[];
  const affiliationIds = affiliationRefs.map((xref) => xref.rid);
  if (affiliationIds.length > 0) {
    author.affiliations = affiliationIds;
  }
  const uri = select('uri', contrib) as LinkMixin | undefined;
  if (uri?.['xlink:href']) {
    author.url = uri['xlink:href'];
  }
  // If there are no aff xrefs AND contrib is in a contrib group with affs AND those affs do not have IDs, add them as affiliations...
  return author;
}

/**
 * Perform standard toText, trim, remove trailing comma and semicolon
 *
 * Additionally, this returns undefined instead of empty string if node is undefined
 */
function toTextAndTrim(content?: Node[] | Node | null): string | undefined {
  const text = toText(content);
  if (!text) return undefined;
  return text.replace(/^[\s;,]+/, '').replace(/[\s;,]+$/, '');
}

function markForDeletion(nodes: (GenericNode | undefined)[]) {
  nodes.forEach((node) => {
    if (node) node.type = '__delete__';
  });
}

export function processAffiliation(aff: Affiliation): AffiliationFM {
  const id = aff.id;
  let ror: string | undefined;
  let isni: string | undefined;
  const rorNode = select(`institution-id[institution-id-type=ror]`, aff);
  if (rorNode) {
    ror = toTextAndTrim(rorNode);
  }
  const isniNode = select(`institution-id[institution-id-type=ISNI]`, aff);
  if (isniNode) {
    isni = toTextAndTrim(isniNode);
  }
  markForDeletion(selectAll('institution-id', aff));
  remove(aff, '__delete__');
  const institutions = selectAll('institution', aff) as GenericNode[];
  const textAddress = selectAll('addr-line > text', aff) as GenericNode[];
  const namedContent = selectAll('named-content', aff) as GenericNode[];
  const departmentNode =
    institutions.find((inst) => inst['content-type'] === 'dept') ??
    namedContent.find((content) => content['content-type'] === 'organisation-division');
  const addressNode = namedContent.find((content) => content['content-type'] === 'street');
  const cityNode = namedContent.find((content) => content['content-type'] === 'city');
  const stateNode = namedContent.find((content) => content['content-type'] === 'country-part');
  const postalCodeNode = namedContent.find((content) => content['content-type'] === 'post-code');
  const countryNode =
    select('country', aff) ?? namedContent.find((content) => content['content-type'] === 'country');
  markForDeletion([
    ...textAddress,
    ...namedContent,
    departmentNode,
    addressNode,
    cityNode,
    stateNode,
    postalCodeNode,
    countryNode,
  ]);
  remove(aff, '__delete__');
  const affChildren = aff.children?.filter((child) => child.type !== 'label') ?? [];
  let institution: string | undefined;
  if (
    affChildren.filter((child) => ['text', 'institution-wrap', 'institution'].includes(child.type))
      .length === affChildren.length
  ) {
    institution = toTextAndTrim(affChildren);
  } else {
    institution = toTextAndTrim(institutions.find((inst) => inst['content-type'] !== 'dept'));
  }
  const addressLines = textAddress
    .map((line) => toTextAndTrim(line))
    .filter((line): line is string => !!line);
  let department = departmentNode
    ? toTextAndTrim(departmentNode)
    : addressLines.find((line) => line.toLowerCase().includes('department'));
  let address = addressNode
    ? toTextAndTrim(addressNode)
    : addressLines.find((line) => !line.toLowerCase().includes('department'));
  if (address && !institution) {
    institution = address;
    address = undefined;
  }
  if (department && !institution) {
    institution = department;
    department = undefined;
  }
  const city = toTextAndTrim(cityNode);
  const state = toTextAndTrim(stateNode);
  const postal_code = toTextAndTrim(postalCodeNode);
  const country = toTextAndTrim(countryNode);
  return { id, ror, isni, department, institution, address, city, state, postal_code, country };
}
