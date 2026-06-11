// Resolve the best "read the paper" links for a paper record.
// After enrichment (scraper/enrich-pdfs.mjs) a paper may carry pdf_url / arxiv_url
// / doi. When it doesn't, we fall back to a title search that reliably lands on
// the PDF for robotics papers.
export function paperLinks(p) {
  const links = [];

  if (p.pdf_url) {
    links.push({ href: p.pdf_url, label: '📄 PDF', kind: 'pdf' });
  } else {
    links.push({
      href: `https://www.google.com/search?q=${encodeURIComponent(p.title || '')}`,
      label: '🔎 Find PDF',
      kind: 'search',
    });
  }

  // arXiv abstract page, when we have it and it isn't already the pdf link.
  if (p.arxiv_url && p.arxiv_url !== p.pdf_url) {
    links.push({ href: p.arxiv_url, label: 'arXiv', kind: 'arxiv' });
  }

  if (p.url) {
    links.push({ href: p.url, label: 'Program ↗', kind: 'program' });
  }

  return links;
}
