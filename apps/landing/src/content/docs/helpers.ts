import {
  DOCUMENTATION_REVIEW_DATE,
  type DocumentationContentSection,
  type DocumentationPage,
} from './types';

export function defineDocumentationPage(
  page: Omit<DocumentationPage, 'lastReviewed'>,
): DocumentationPage {
  return { ...page, lastReviewed: DOCUMENTATION_REVIEW_DATE };
}

export function contentSection(
  id: string,
  title: string,
  paragraphs: readonly string[],
  blocks?: DocumentationContentSection['blocks'],
): DocumentationContentSection {
  return { id, title, paragraphs, ...(blocks === undefined ? {} : { blocks }) };
}
