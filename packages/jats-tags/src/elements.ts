import type { GenericParent } from 'myst-common';
import type { Tags } from './elementTags.js';
import type { RefType } from './refType.js';

export type LinkMixin = {
  'xlink:href'?: string;
};

export type Article = GenericParent & {
  type: Tags.article;
};

export type Front = GenericParent & {
  type: Tags.front;
};

export type ArticleMeta = GenericParent & {
  type: Tags.articleMeta;
};

export type Body = GenericParent & {
  type: Tags.body;
};

export type Back = GenericParent & {
  type: Tags.back;
};

export type SubArticle = GenericParent & {
  type: Tags.subArticle;
  'article-type'?: string;
};

export type RefList = GenericParent & {
  type: Tags.refList;
};

export type Reference = GenericParent & {
  type: Tags.ref;
};

export type TitleGroup = GenericParent & {
  type: Tags.titleGroup;
  children: (ArticleTitle | Subtitle)[];
};

export type ArticleTitle = GenericParent & {
  type: Tags.articleTitle;
};

export type ArticleId = GenericParent & {
  type: Tags.articleId;
  'assigning-authority': string;
  'custom-type': string;
  'pub-id-type': string;
  'specific-use': string;
};

export type Subtitle = GenericParent & {
  type: Tags.subtitle;
};

export type Permissions = GenericParent & {
  type: Tags.permissions;
};

export type PubDate = GenericParent & {
  type: Tags.pubDate;
  'assigning-authority': string;
  calendar: string;
  'date-type': string;
  'iso-8601-date': string;
  'publication-format': string;
  /** @deprecated */
  'pub-type': string;
};

export type License = GenericParent &
  LinkMixin & {
    type: Tags.license;
    'license-type'?: string;
  };

export type Abstract = GenericParent & {
  type: Tags.abstract;
  'abstract-type'?: string;
};

export type ContribGroup = GenericParent & {
  type: Tags.contribGroup;
  'content-type'?: string;
  children: (Contrib | Affiliation)[];
};

export type Contrib = GenericParent & {
  type: Tags.contrib;
  'contrib-type'?: string;
};

export type Affiliation = GenericParent & {
  type: Tags.aff;
};

export type KeywordGroup = GenericParent & {
  type: Tags.kwdGroup;
  'kwd-group-type'?: string;
};

export type Keyword = GenericParent & {
  type: Tags.kwd;
};

export type Xref = GenericParent & {
  type: Tags.xref;
  rid: string;
  'ref-type'?: RefType;
};

export type ArticleCategories = GenericParent & {
  type: Tags.articleCategories;
};
