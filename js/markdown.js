/* Markdown — minimal md → html, zero dependencies.
 * Supports: #-###### headings, **bold**, *italic*, `code`, ``` fenced blocks,
 * - lists, 1. lists, [links](url), ![images](src), | tables |, > blockquotes,
 * --- hr, paragraphs (consecutive plain lines merge into one <p>).
 *
 *   Markdown.render(md, { baseUrl })
 *     Relative image/link URLs are resolved against baseUrl (the md file's
 *     own URL), so documents render correctly from any host root or subpath.
 */
const Markdown = (() => {
  const escapeHtml = s => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  function resolveUrl(src, baseUrl) {
    if (!baseUrl) return src;
    try { return new URL(src, baseUrl).href; } catch (e) { return src; }
  }

  function inline(t, baseUrl) {
    return escapeHtml(t)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) =>
        '<img alt="' + alt + '" src="' + resolveUrl(src, baseUrl) + '">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, href) =>
        '<a href="' + resolveUrl(href, baseUrl) + '" target="_blank" rel="noopener">' + txt + '</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  const isTableRow = l => /^\|.*\|$/.test(l.trim());
  const isTableSep = l => /^\|[\s:\-|]+\|$/.test(l.trim());
  const parseRow = (l, baseUrl) =>
    l.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim(), baseUrl));

  function render(src, opts) {
    const baseUrl = opts && opts.baseUrl;
    const lines = src.split('\n');
    const out = [];
    let inCode = false;
    let codeBuf = [];
    let listType = null; // 'ul' | 'ol' | null
    let para = [];       // consecutive plain lines → one <p>
    let quote = [];      // consecutive > lines → one <blockquote>

    const closeList = () => {
      if (listType) { out.push(`</${listType}>`); listType = null; }
    };
    const flushPara = () => {
      if (para.length) { out.push('<p>' + inline(para.join('\n'), baseUrl) + '</p>'); para = []; }
    };
    const flushQuote = () => {
      if (quote.length) {
        out.push('<blockquote>' + quote.map(l => '<p>' + inline(l, baseUrl) + '</p>').join('') + '</blockquote>');
        quote = [];
      }
    };
    const flushAll = () => { flushPara(); flushQuote(); closeList(); };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.replace(/\s+$/, '');

      if (/^```/.test(line)) {
        if (inCode) {
          out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
          codeBuf = [];
          inCode = false;
        } else {
          flushAll();
          inCode = true;
        }
        continue;
      }
      if (inCode) { codeBuf.push(raw); continue; }

      if (line.trim() === '') { flushAll(); continue; }

      // table: header row immediately followed by a |---| separator row
      if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1].replace(/\s+$/, ''))) {
        flushAll();
        const head = parseRow(line, baseUrl);
        i++; // consume separator
        const bodyRows = [];
        while (i + 1 < lines.length && isTableRow(lines[i + 1].replace(/\s+$/, ''))) {
          i++;
          bodyRows.push(parseRow(lines[i], baseUrl));
        }
        let html = '<table><thead><tr>' + head.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
        for (const r of bodyRows) html += '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>';
        out.push(html + '</tbody></table>');
        continue;
      }

      let m;
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        flushAll();
        const level = m[1].length;
        out.push(`<h${level}>${inline(m[2], baseUrl)}</h${level}>`);
      } else if ((m = line.match(/^>\s?(.*)$/))) {
        flushPara();
        closeList();
        quote.push(m[1]);
      } else if (/^---+\s*$/.test(line)) {
        flushAll();
        out.push('<hr>');
      } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
        flushPara();
        flushQuote();
        if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
        out.push(`<li>${inline(m[1], baseUrl)}</li>`);
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        flushPara();
        flushQuote();
        if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
        out.push(`<li>${inline(m[1], baseUrl)}</li>`);
      } else {
        flushQuote();
        closeList();
        para.push(line);
      }
    }
    flushAll();
    if (inCode) out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
    return out.join('\n');
  }

  return { render };
})();
