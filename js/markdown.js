/* Markdown — minimal md → html, zero dependencies.
 * Supports: # ## ### headings, **bold**, *italic*, `code`, ``` fenced blocks,
 * - lists, 1. lists, [links](url), ![images](src), --- hr, paragraphs.
 */
const Markdown = (() => {
  const escapeHtml = s => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  function inline(t) {
    return escapeHtml(t)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function render(src) {
    const lines = src.split('\n');
    const out = [];
    let inCode = false;
    let codeBuf = [];
    let listType = null; // 'ul' | 'ol' | null

    const closeList = () => {
      if (listType) { out.push(`</${listType}>`); listType = null; }
    };

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');

      if (/^```/.test(line)) {
        if (inCode) {
          out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
          codeBuf = [];
          inCode = false;
        } else {
          closeList();
          inCode = true;
        }
        continue;
      }
      if (inCode) { codeBuf.push(raw); continue; }

      if (line.trim() === '') { closeList(); continue; }

      let m;
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
        closeList();
        const level = m[1].length;
        out.push(`<h${level}>${inline(m[2])}</h${level}>`);
      } else if (/^---+\s*$/.test(line)) {
        closeList();
        out.push('<hr>');
      } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
        if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
        out.push(`<li>${inline(m[1])}</li>`);
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
        out.push(`<li>${inline(m[1])}</li>`);
      } else {
        closeList();
        out.push(`<p>${inline(line)}</p>`);
      }
    }
    closeList();
    if (inCode) out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
    return out.join('\n');
  }

  return { render };
})();
