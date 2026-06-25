// src/lib/renderMarkdown.jsx
// Leichter Markdown→JSX-Renderer (bold, Überschriften, Listen, Tabellen, hr).
// Geteilt von Leadly-Panel (Chat) + Dashboard-Briefing. Keine externe Dependency.

import React from 'react';

function renderInline(text, kp) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((seg, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(seg);
    return m ? <strong key={kp + '-' + i}>{m[1]}</strong> : <span key={kp + '-' + i}>{seg}</span>;
  });
}

export function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = []; let i = 0, key = 0; let listBuf = null;
  const flushList = () => {
    if (!listBuf) return;
    const Tag = listBuf.ordered ? 'ol' : 'ul';
    out.push(<Tag key={'l' + (key++)} style={{ margin: '4px 0', paddingLeft: 20 }}>
      {listBuf.items.map((it, j) => <li key={j} style={{ margin: '2px 0' }}>{renderInline(it, 'li' + key + j)}</li>)}
    </Tag>);
    listBuf = null;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushList(); const tbl = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { tbl.push(lines[i]); i++; }
      const rows = tbl.filter(r => !/^\s*\|[\s|:-]+\|\s*$/.test(r))
        .map(r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      if (rows.length) out.push(
        <table key={'t' + (key++)} style={{ borderCollapse: 'collapse', margin: '6px 0', fontSize: 13 }}><tbody>
          {rows.map((cells, ri) => <tr key={ri}>{cells.map((c, ci) => <td key={ci} style={{ border: '1px solid #E4E7EC', padding: '4px 8px', verticalAlign: 'top' }}>{renderInline(c, 't' + ri + ci)}</td>)}</tr>)}
        </tbody></table>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flushList(); out.push(<div key={'h' + (key++)} style={{ fontWeight: 700, fontSize: 14, margin: '8px 0 2px' }}>{renderInline(h[2], 'h' + key)}</div>); i++; continue; }
    if (/^\s*---+\s*$/.test(line)) { flushList(); out.push(<hr key={'hr' + (key++)} style={{ border: 'none', borderTop: '1px solid #E4E7EC', margin: '8px 0' }} />); i++; continue; }
    const li = /^\s*[-*]\s+(.*)$/.exec(line); const oli = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (li || oli) {
      const ordered = !!oli;
      if (!listBuf || listBuf.ordered !== ordered) { flushList(); listBuf = { ordered, items: [] }; }
      listBuf.items.push(li ? li[1] : oli[1]); i++; continue;
    }
    if (line.trim() === '') { flushList(); i++; continue; }
    flushList(); out.push(<div key={'p' + (key++)} style={{ margin: '3px 0' }}>{renderInline(line, 'p' + key)}</div>); i++;
  }
  flushList(); return out;
}
