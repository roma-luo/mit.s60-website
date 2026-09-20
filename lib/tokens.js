/* tokens.js — shared tokenizer for BM25 (build-time chunk indexing and
 * query-time search must tokenize identically).
 * Latin text becomes words; CJK runs become bigrams. */
export function tokenize(text) {
  const q = String(text).toLowerCase();
  const words = q.match(/[a-z0-9']+/g) || [];
  const bigrams = [];
  for (const run of q.match(/[一-鿿豈-﫿]+/g) || []) {
    if (run.length === 1) bigrams.push(run);
    for (let i = 0; i < run.length - 1; i++) bigrams.push(run.slice(i, i + 2));
  }
  return words.concat(bigrams);
}
