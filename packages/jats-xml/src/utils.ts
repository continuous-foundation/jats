import type { GenericNode, GenericParent } from 'myst-common';
import { doi } from 'doi-utils';
import { nodeText, selectText } from 'jats-utils';
import { select, selectAll } from 'unist-util-select';
import type { Affiliation, ArticleId, Contrib, LinkMixin, Xref } from 'jats-tags';
import { Tags } from 'jats-tags';
import type { Affiliation as AffiliationFM, Contributor as ContributorFM } from 'myst-frontmatter';
import { remove } from 'unist-util-remove';

export type PubIdTypes = 'doi' | 'pmc' | 'pmid' | 'publisher-id' | string;

/**
 * Normalize a JATS subject label for consistent frontmatter (dedupe ALL CAPS vs
 * title case, and underscore_spaced vs space-separated variants).
 */
export function normalizeSubject(subject: string): string {
  return subject
    .trim()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function findArticleId(
  node: GenericParent | undefined,
  pubIdType: PubIdTypes = 'doi',
): string | undefined {
  if (!node) return undefined;
  const id = select(`[pub-id-type=${pubIdType}]`, node);
  if (id && nodeText(id)) return nodeText(id);
  const doiTag = (selectAll(`${Tags.articleId},${Tags.pubId}`, node) as ArticleId[]).find((t) =>
    doi.validate(nodeText(t)),
  );
  return nodeText(doiTag) || undefined;
}

export function buildCorrespEmailLookup(front?: GenericParent): Record<string, string[]> {
  if (!front) return {};
  const lookup: Record<string, string[]> = {};
  selectAll('author-notes corresp[id]', front).forEach((node) => {
    const corresp = node as GenericNode;
    const id = corresp.id;
    if (!id) return;
    const emails = selectAll('email', corresp)
      .map((emailNode) => toTextAndTrim(emailNode))
      .filter((email): email is string => !!email);
    if (emails.length) lookup[id] = emails;
  });
  return lookup;
}

export type CorrespEmailState = {
  lists: Record<string, string[]>;
  index: Record<string, number>;
};

function takeCorrespEmail(correspRefs: Xref[], state?: CorrespEmailState): string | undefined {
  if (!state) return undefined;
  for (const xref of correspRefs) {
    const rid = xref.rid;
    if (!rid) continue;
    const emails = state.lists[rid];
    if (!emails?.length) continue;
    const at = state.index[rid] ?? 0;
    const email = emails[at];
    if (email) state.index[rid] = at + 1;
    return email;
  }
  return undefined;
}

export function processContributor(
  contrib: Contrib,
  opts?: { correspEmails?: CorrespEmailState },
): ContributorFM {
  const author: ContributorFM = {
    name: `${selectText(contrib, Tags.givenNames)} ${selectText(contrib, Tags.surname)}`,
  };
  const orcid = select('[contrib-id-type=orcid]', contrib);
  if (orcid) {
    author.orcid = nodeText(orcid).replace(/(https?:\/\/)?orcid\.org\//, '');
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
  const correspRefs = selectAll('xref[ref-type=corresp]', contrib) as Xref[];
  const isCorresponding =
    String(contrib.corresp ?? '').toLowerCase() === 'yes' || correspRefs.length > 0;
  if (isCorresponding) {
    author.corresponding = true;
  }
  if (String(contrib['equal-contrib'] ?? '').toLowerCase() === 'yes') {
    author.equal_contributor = true;
  }
  let email = toTextAndTrim(select('email', contrib));
  if (!email) {
    email = takeCorrespEmail(correspRefs, opts?.correspEmails);
  }
  if (email) {
    author.email = email;
  }
  // If there are no aff xrefs AND contrib is in a contrib group with affs AND those affs do not have IDs, add them as affiliations...
  return author;
}

export function processContributors(contribs: Contrib[], front?: GenericParent): ContributorFM[] {
  const correspEmails: CorrespEmailState = {
    lists: buildCorrespEmailLookup(front),
    index: {},
  };
  return contribs.map((contrib) => processContributor(contrib, { correspEmails }));
}

/**
 * Perform standard toText, trim, remove trailing comma and semicolon
 *
 * Additionally, this returns undefined instead of empty string if node is undefined
 */
function toTextAndTrim(content?: unknown): string | undefined {
  const text = nodeText(content);
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
