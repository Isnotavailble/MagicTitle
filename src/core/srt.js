import fs from 'fs';

export function parseSrt(content) {
  if (!content) return [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const blocks = normalized.split(/\n\s*\n/);
  const entries = [];

  for (const b of blocks) {
    const lines = b.trim().split('\n');
    if (lines.length >= 2) {
      let index = lines[0].trim();
      let tsLine = lines[1].trim();
      let textLines = lines.slice(2);

      // Handle cases where index might be missing or merged
      if (!tsLine.includes('-->') && lines[0].includes('-->')) {
        tsLine = lines[0].trim();
        index = String(entries.length + 1);
        textLines = lines.slice(1);
      }

      const match = tsLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
      const text = textLines.map(l => l.trim()).join(' ');

      if (match) {
        entries.push({
          index: index || String(entries.length + 1),
          start: match[1].replace('.', ','),
          end: match[2].replace('.', ','),
          timestamp: tsLine,
          text: text,
        });
      }
    }
  }

  return entries;
}

export function stringifySrt(entries) {
  return entries.map((entry, i) => {
    const idx = entry.index || (i + 1);
    const ts = entry.timestamp || `${entry.start} --> ${entry.end}`;
    return `${idx}\n${ts}\n${entry.text || ''}`;
  }).join('\n\n') + '\n';
}

export function readSrtFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseSrt(content);
}

export function writeSrtFile(filePath, entries) {
  const content = stringifySrt(entries);
  fs.writeFileSync(filePath, content, 'utf-8');
}
