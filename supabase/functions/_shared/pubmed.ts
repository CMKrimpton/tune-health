// ---------------------------------------------------------------------------
// Citation Verification — PubMed, CrossRef, Semantic Scholar
// ---------------------------------------------------------------------------
// Three independent academic databases. If a citation can't be found in any
// of them, it's either fabricated, badly paraphrased, or not a real study.
// ---------------------------------------------------------------------------

// Sources that won't be in academic databases
const NON_ACADEMIC_PATTERNS = [
  /\bgao\b/i, /\bcbo\b/i, /\bcongressional\b/i, /\bfederal law\b/i,
  /\bwhite house\b/i, /\bexecutive order\b/i, /\bstatute\b/i,
  /\brand corporation\b/i, /\bbrookings\b/i, /\burban institute\b/i,
  /\bkaiser family\b/i, /\bcommonwealth fund\b/i, /\bpew research\b/i,
  /\bnational academies\b/i, /\binstitute of medicine\b/i,
  /\bNew York Times\b/i, /\bWashington Post\b/i, /\bReuters\b/i,
  /\bAssociated Press\b/i, /\bBBC\b/i, /\bCNN\b/i, /\bNPR\b/i,
  /\bFDA guidance\b/i, /\bWHO report\b/i, /\bCDC report\b/i,
  /\bpress release\b/i, /\bnews release\b/i,
];

export type CitationDetail = {
  title: string;
  found: boolean;
  skipped?: boolean;
  source?: "pubmed" | "crossref" | "semantic_scholar";
  pmid?: string;
  doi?: string;
  url?: string;
};

type VerifyResult = {
  verified: number;
  failed: number;
  skipped: number;
  total: number;
  details: CitationDetail[];
};

// ── PubMed E-utilities ──────────────────────────────────────────────────────

async function searchPubMed(query: string): Promise<{ count: number; pmid?: string }> {
  const res = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=1`,
    { signal: AbortSignal.timeout(6000) },
  );
  if (!res.ok) return { count: 0 };
  const data = await res.json();
  const count = parseInt(data?.esearchresult?.count || "0", 10);
  const pmid = data?.esearchresult?.idlist?.[0] || undefined;
  return { count, pmid };
}

async function tryPubMed(title: string, journal?: string, year?: string): Promise<{ found: boolean; pmid?: string }> {
  const clean = title.replace(/['"]/g, "").slice(0, 200);

  // Strategy 1: exact title in title field
  let result = await searchPubMed(`"${clean}"[ti]`);
  if (result.count > 0) return { found: true, pmid: result.pmid };
  await delay(350);

  // Strategy 2: title + journal
  if (journal) {
    const jClean = journal.replace(/['"]/g, "");
    result = await searchPubMed(`"${clean}"[ti] AND "${jClean}"[ta]`);
    if (result.count > 0) return { found: true, pmid: result.pmid };
    await delay(350);
  }

  // Strategy 3: title + year
  if (year) {
    result = await searchPubMed(`"${clean}"[ti] AND ${year}[dp]`);
    if (result.count > 0) return { found: true, pmid: result.pmid };
    await delay(350);
  }

  // Strategy 4: first 10 significant words in title field
  const words = clean.split(/\s+/).filter(w => w.length > 3).slice(0, 10);
  if (words.length >= 4) {
    result = await searchPubMed(`${words.join(" ")}[ti]`);
    if (result.count > 0) return { found: true, pmid: result.pmid };
    await delay(350);
  }

  return { found: false };
}

// ── CrossRef API ────────────────────────────────────────────────────────────

async function tryCrossRef(title: string): Promise<{ found: boolean; doi?: string }> {
  try {
    const query = encodeURIComponent(title.slice(0, 200));
    const res = await fetch(
      `https://api.crossref.org/works?query.title=${query}&rows=1&select=DOI,title,score`,
      {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "alumi-news/1.0 (https://aluminews.com; mailto:hello@aluminews.com)" },
      },
    );
    if (!res.ok) return { found: false };
    const data = await res.json();
    const items = data?.message?.items;
    if (!items || items.length === 0) return { found: false };

    const best = items[0];
    // CrossRef returns a relevance score — threshold filters false positives
    if (best.score < 50) return { found: false };

    // Fuzzy title match: normalize and check overlap
    const resultTitle = (Array.isArray(best.title) ? best.title[0] : best.title || "").toLowerCase();
    const queryTitle = title.toLowerCase();
    if (titleSimilarity(queryTitle, resultTitle) > 0.6) {
      return { found: true, doi: best.DOI };
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}

// ── Semantic Scholar API ────────────────────────────────────────────────────

async function trySemanticScholar(title: string): Promise<{ found: boolean; doi?: string; url?: string }> {
  try {
    const query = encodeURIComponent(title.slice(0, 200));
    const res = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&limit=1&fields=title,externalIds,url`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { found: false };
    const data = await res.json();
    const papers = data?.data;
    if (!papers || papers.length === 0) return { found: false };

    const best = papers[0];
    const resultTitle = (best.title || "").toLowerCase();
    const queryTitle = title.toLowerCase();

    if (titleSimilarity(queryTitle, resultTitle) > 0.6) {
      return {
        found: true,
        doi: best.externalIds?.DOI || undefined,
        url: best.url || undefined,
      };
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / Math.max(wordsA.size, wordsB.size);
}

function isLikelyNonAcademic(title: string, journal?: string): boolean {
  const text = `${title} ${journal || ""}`;
  return NON_ACADEMIC_PATTERNS.some(p => p.test(text));
}

// ── Main export ─────────────────────────────────────────────────────────────

export async function verifyPubMedCitations(
  studies: Array<{ title?: string; journal?: string; year?: string; doi?: string }>,
): Promise<VerifyResult> {
  if (!studies || studies.length === 0) return { verified: 0, failed: 0, skipped: 0, total: 0, details: [] };

  const toCheck = studies.slice(0, 8); // Check up to 8 citations
  const details: CitationDetail[] = [];
  let verified = 0;
  let skipped = 0;

  for (const study of toCheck) {
    if (!study.title) continue;

    // Skip non-academic sources
    if (isLikelyNonAcademic(study.title, study.journal)) {
      details.push({ title: study.title, found: false, skipped: true });
      skipped++;
      continue;
    }

    // If DOI provided by research stage, verify it directly via CrossRef
    if (study.doi) {
      try {
        const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(study.doi)}`, {
          signal: AbortSignal.timeout(5000),
          headers: { "User-Agent": "alumi-news/1.0 (https://aluminews.com; mailto:hello@aluminews.com)" },
        });
        if (res.ok) {
          verified++;
          details.push({ title: study.title, found: true, source: "crossref", doi: study.doi, url: `https://doi.org/${study.doi}` });
          await delay(350);
          continue;
        }
      } catch { /* fall through to title search */ }
      await delay(350);
    }

    // Source 1: PubMed
    const pm = await tryPubMed(study.title, study.journal, study.year);
    if (pm.found) {
      verified++;
      details.push({
        title: study.title, found: true, source: "pubmed",
        pmid: pm.pmid, url: pm.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pm.pmid}/` : undefined,
      });
      await delay(350);
      continue;
    }

    // Source 2: CrossRef (covers most DOI-registered papers)
    const cr = await tryCrossRef(study.title);
    if (cr.found) {
      verified++;
      details.push({
        title: study.title, found: true, source: "crossref",
        doi: cr.doi, url: cr.doi ? `https://doi.org/${cr.doi}` : undefined,
      });
      await delay(500);
      continue;
    }
    await delay(500);

    // Source 3: Semantic Scholar (broadest coverage)
    const ss = await trySemanticScholar(study.title);
    if (ss.found) {
      verified++;
      details.push({
        title: study.title, found: true, source: "semantic_scholar",
        doi: ss.doi, url: ss.url || (ss.doi ? `https://doi.org/${ss.doi}` : undefined),
      });
      await delay(500);
      continue;
    }
    await delay(350);

    // Not found anywhere
    details.push({ title: study.title, found: false });
  }

  return {
    verified,
    failed: details.filter(d => !d.found && !d.skipped).length,
    skipped,
    total: details.length,
    details,
  };
}
