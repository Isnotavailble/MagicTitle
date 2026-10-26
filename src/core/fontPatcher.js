import fs from 'fs';

function srtTimeToAssTime(srtTime) {
  // srt: 00:01:23,456 -> ass: 0:01:23.45
  if (!srtTime) return '0:00:00.00';
  const clean = srtTime.replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    const mins = parts[1];
    const secsWithMs = parseFloat(parts[2]).toFixed(2);
    const secsFormatted = secsWithMs.padStart(5, '0');
    return `${hours}:${mins}:${secsFormatted}`;
  }
  return clean;
}

export function generatePadaukAss(cues, fontName = 'Padauk', fontSize = 58) {
  const header = `[Script Info]
Title: MagicTitle Generated Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3.0,1.5,2,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const dialogueLines = cues.map(cue => {
    const start = srtTimeToAssTime(cue.start);
    const end = srtTimeToAssTime(cue.end);
    // ASS expects \N for line breaks
    const text = (cue.text || '').replace(/\r?\n/g, '\\N');
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  });

  return header + dialogueLines.join('\n') + '\n';
}

export function writePadaukAssFile(filePath, cues, fontName = 'Padauk', fontSize = 58) {
  const content = generatePadaukAss(cues, fontName, fontSize);
  fs.writeFileSync(filePath, content, 'utf-8');
}
