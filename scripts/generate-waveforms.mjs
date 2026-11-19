import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// The artwork is generated from the actual music, not a stock illustration.
const tracks = [
  ['assets/idea2music.mp3', 'assets/wave-intro.svg'],
  ['assets/de-laatste-trein-fragment.mp3', 'assets/wave-train.svg'],
  ['assets/vandaag-is-van-jou-fragment.mp3', 'assets/wave-birthday.svg'],
  ['assets/ik-hoor-je-nog-fragment.mp3', 'assets/wave-memory.svg']
];

for (const [source, output] of tracks) {
  const result = spawnSync('ffmpeg', [
    '-v', 'error', '-i', source, '-map', '0:a:0', '-ac', '1', '-ar', '8000',
    '-f', 'f32le', 'pipe:1'
  ], { maxBuffer: 30 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Cannot decode ${source}: ${result.stderr.toString()}`);

  const pcm = result.stdout;
  const samples = Math.floor(pcm.length / 4);
  const barCount = 100;
  const rms = [];
  for (let i = 0; i < barCount; i++) {
    const from = Math.floor((i * samples) / barCount);
    const to = Math.floor(((i + 1) * samples) / barCount);
    let energy = 0;
    for (let j = from; j < to; j++) {
      const value = pcm.readFloatLE(j * 4);
      energy += value * value;
    }
    rms.push(Math.sqrt(energy / Math.max(1, to - from)));
  }

  const peak = Math.max(...rms, .0001);
  const bars = rms.map((amplitude, index) => {
    const height = Math.max(8, Math.round(108 * Math.pow(amplitude / peak, .8)));
    const x = 8 + index * 7.2;
    return `<rect x="${x.toFixed(1)}" y="${(80 - height / 2).toFixed(1)}" width="3.2" height="${height}" rx="1.6"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 735 160" width="735" height="160" role="img" aria-label="Geluidsgolf van het lied"><g fill="#ff7448">${bars}</g></svg>\n`;
  writeFileSync(output, svg);
}
