export async function verifyPubMedCitations(
  studies: Array<{ title?: string; journal?: string; year?: string }>,
): Promise<{ verified: number; failed: number; total: number; details: Array<{ title: string; found: boolean }> }> {
  if (!studies || studies.length === 0) return { verified: 0, failed: 0, total: 0, details: [] };

  const toCheck = studies.slice(0, 5); // Limit to 5 to avoid rate limiting
  const details: Array<{ title: string; found: boolean }> = [];
  let verified = 0;

  for (const study of toCheck) {
    if (!study.title) continue;
    try {
      // Search PubMed E-utilities (free, no API key needed for moderate use)
      const query = encodeURIComponent(study.title.slice(0, 200));
      const res = await fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${query}&retmode=json&retmax=1`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const data = await res.json();
        const count = parseInt(data?.esearchresult?.count || "0", 10);
        const found = count > 0;
        if (found) verified++;
        details.push({ title: study.title, found });
      } else {
        details.push({ title: study.title, found: false });
      }
    } catch {
      details.push({ title: study.title, found: false });
    }
    // Small delay to respect PubMed rate limits (3 req/s without API key)
    await new Promise(r => setTimeout(r, 350));
  }

  return { verified, failed: details.filter(d => !d.found).length, total: details.length, details };
}
