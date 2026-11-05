// Genera la portada del perfil: el ruido converge en La noche estrellada y una
// terminal escribe quién soy. No lee repositorios: sólo el arte y la identidad.
// Uso: node scripts/build-profile.mjs
import { readFile, writeFile } from "node:fs/promises";

const IDENTITY = ["luis rodríguez · neobmo", "frontend developer · barranquilla"];
const DESCRIPTION = "Caracteres sueltos convergen en La noche estrellada dibujada en ASCII. Luis Rodríguez, NeoBmo: frontend developer en Barranquilla.";

const NOISE = "!#$%&*+-/:;<=>?@[]^_{|}~01";
const MOON = "#f4c95d";
const VOID = "#000";
const SIGNAL = "#fff";
const MUTED = "#9aa4b2";

const TEXT = { size: 15, line: 24, char: 9 };
const BUCKETS = 10;

/** Generador con semilla: la misma entrada produce el mismo SVG y el diff queda limpio. */
function seeded(seed) {
  return () => (seed = (seed * 48271) % 2147483647) / 2147483647;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v / 17).toString(16)).join("");
const round = (n) => +n.toFixed(1);

/** Agrupa caracteres por tanda y color: decenas de nodos de texto, no miles. */
function glyphRuns(items) {
  const groups = new Map();
  for (const item of items) {
    const key = `${item.className}|${item.fill}`;
    if (!groups.has(key)) groups.set(key, { ...item, x: [], y: [], text: [] });
    const group = groups.get(key);
    group.x.push(round(item.px));
    group.y.push(round(item.py));
    group.text.push(item.glyph);
  }
  return [...groups.values()]
    .map((g) => `<text class="${g.className}" fill="${g.fill}" x="${g.x.join(" ")}" y="${g.y.join(" ")}">${escape(g.text.join(""))}</text>`)
    .join("\n");
}

/** La luz llega primero: la misma coreografía del hero, de la estrella al ciprés. */
function paintingLayer(painting, { scale, keep }) {
  const random = seeded(1890);
  const items = [];
  for (const [col, row, glyph, r, g, b, lum] of painting.cells) {
    const px = (col + 0.2) * painting.cellWidth * scale;
    if (random() >= keep(px)) continue;
    const bucket = Math.min(BUCKETS - 1, Math.floor(((1 - lum) * 0.7 + random() * 0.3) * BUCKETS));
    items.push({ className: `p p${bucket}`, fill: hex(r, g, b), glyph, px, py: (row + 0.8) * painting.cellHeight * scale });
  }
  return glyphRuns(items);
}

function noiseLayer({ width, height, count, className, spawn }) {
  const random = seeded(1889);
  const items = [];
  for (let i = 0; i < count; i++) {
    const point = spawn(random);
    if (!point) continue;
    const glyph = NOISE[Math.floor(random() * NOISE.length)];
    const bucket = Math.floor(random() * BUCKETS);
    items.push({ className: className(bucket), fill: SIGNAL, glyph, px: point[0] * width, py: point[1] * height });
  }
  return glyphRuns(items);
}

/** El comando se escribe carácter a carácter; la identidad aparece y queda el cursor. */
function terminalLayer({ x, y, start }) {
  const command = "whoami";
  const width = (command.length + 2) * TEXT.char;
  const typing = command.length * 0.06;
  const printed = start + typing + 0.15;
  const [name, role] = IDENTITY;
  const lastLine = y + TEXT.line * 2;

  return {
    bottom: lastLine + TEXT.line,
    markup: [
      `<text class="print" x="${x}" y="${y}" style="--t:${start}s"><tspan fill="${MOON}">&gt;</tspan><tspan fill="${SIGNAL}" dx="${TEXT.char}">${command}</tspan></text>`,
      `<rect class="typing" x="${x + TEXT.char * 2}" y="${y - TEXT.size}" width="${width}" height="${TEXT.line}" fill="${VOID}" style="--w:${width}px;--n:${command.length};--t:${start}s;--d:${typing.toFixed(2)}s"/>`,
      `<text class="print" x="${x}" y="${y + TEXT.line}" fill="${SIGNAL}" style="--t:${printed.toFixed(2)}s">${escape(name)}</text>`,
      `<text class="print" x="${x}" y="${lastLine}" fill="${MUTED}" style="--t:${(printed + 0.12).toFixed(2)}s">${escape(role)}</text>`,
      `<rect class="cursor" x="${x + (role.length + 1) * TEXT.char}" y="${lastLine - TEXT.size + 2}" width="${TEXT.char}" height="${TEXT.size + 2}" fill="${SIGNAL}" style="--t:${(printed + 0.2).toFixed(2)}s"/>`,
    ].join("\n"),
  };
}

function styles(fontBase64) {
  const delays = Array.from({ length: BUCKETS }, (_, i) => `.p${i}{animation-delay:${(1 + i * 0.17).toFixed(2)}s}.n${i},.d${i}{animation-delay:${(i * 0.09).toFixed(2)}s}`).join("");
  return `@font-face{font-family:M;font-weight:100 800;src:url(data:font/woff2;base64,${fontBase64}) format("woff2")}
text{font-family:M,ui-monospace,monospace;white-space:pre}
.paint text{font-size:var(--glyph);font-weight:600}
.term text{font-size:${TEXT.size}px;font-weight:500}
.p{animation:arrive .5s both}
.n{opacity:0;animation:noise 3.2s both}
.d{animation:appear .3s both}
.print{animation:appear .01s both;animation-delay:var(--t)}
.typing{transform:translateX(var(--w));animation:type var(--d) steps(var(--n)) both;animation-delay:var(--t)}
.cursor{animation:appear .01s var(--t) both,blink 1.1s steps(1) var(--t) infinite}
${delays}
@keyframes arrive{from{opacity:0}}
@keyframes appear{from{opacity:0}}
@keyframes noise{0%{opacity:0}8%,62%{opacity:1}82%,100%{opacity:0}}
@keyframes type{from{transform:translateX(0)}to{transform:translateX(var(--w))}}
@keyframes blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
}

function svg({ width, height, glyph, layers, fontBase64 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escape(DESCRIPTION)}">
<title>${escape(DESCRIPTION)}</title>
<style>${styles(fontBase64)}</style>
<rect width="${width}" height="${height}" fill="${VOID}"/>
<g class="paint" style="--glyph:${glyph}px">
${layers.painting}
${layers.noise}
</g>
<g class="term">
${layers.terminal}
</g>
</svg>
`;
}

function buildWide(painting, fontBase64) {
  const width = 900;
  const scale = 0.625;
  const height = Math.round(painting.rows * painting.cellHeight * scale);
  const terminal = terminalLayer({ x: 34, y: Math.round(height / 2 - TEXT.line * 0.6), start: 3.1 });
  const noise = noiseLayer({
    width, height, count: 1800,
    className: (b) => `n n${b}`,
    spawn: (random) => [random(), random()],
  });
  // Polvo: el rastro que queda donde el ruido se vuelve pintura. Nunca entra en la terminal.
  const dust = noiseLayer({
    width, height, count: 600,
    className: (b) => `d d${b}`,
    spawn: (random) => {
      const u = 0.47 + random() * 0.17;
      return random() < 1 - smooth(0.47, 0.64, u) ? [u, random()] : null;
    },
  });
  const layers = {
    painting: paintingLayer(painting, { scale, keep: (x) => smooth(width * 0.46, width * 0.62, x) }),
    noise: `${noise}\n${dust}`,
    terminal: terminal.markup,
  };
  return svg({ width, height, glyph: 7.5, layers, fontBase64 });
}

function buildNarrow(painting, fontBase64) {
  const width = 440;
  const paintingHeight = painting.rows * painting.cellHeight;
  const terminal = terminalLayer({ x: 22, y: paintingHeight + 36, start: 3.1 });
  const noise = noiseLayer({
    width, height: paintingHeight, count: 900,
    className: (b) => `n n${b}`,
    spawn: (random) => [random(), random()],
  });
  const layers = {
    painting: paintingLayer(painting, { scale: 1, keep: () => 1 }),
    noise,
    terminal: terminal.markup,
  };
  return svg({ width, height: Math.ceil(terminal.bottom + 4), glyph: 8, layers, fontBase64 });
}

const fontBase64 = (await readFile("assets/jetbrains-mono.woff2")).toString("base64");
const load = async (name) => JSON.parse(await readFile(`assets/${name}.json`, "utf8"));

await writeFile("assets/profile-wide.svg", buildWide(await load("painting-wide"), fontBase64));
await writeFile("assets/profile-narrow.svg", buildNarrow(await load("painting-narrow"), fontBase64));
