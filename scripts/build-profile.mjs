// Genera las piezas del perfil: el ruido converge en La noche estrellada mientras
// una terminal escribe datos reales. Sin dependencias: sólo Node 24 y la API de GitHub.
// Uso: GH_TOKEN=... node scripts/build-profile.mjs  (o, en local, con `gh` autenticado)
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const LOGIN = "NeoBmo";
const WHO = ["luis rodríguez · neobmo", "frontend autodidacta · barranquilla", "entender el negocio detrás del código"];
const NOW = "1 portafolio   2 blog   3 lobos negros";
const CLOSING = "one. be more";

const NOISE = "!#$%&*+-/:;<=>?@[]^_{|}~01";
const COLORS = ["#f4c95d", "#8fc3ea", "#5f86e8", "#7fd1c7", "#e9a24c", "#b7c7f2", "#d9dfe8"];
const VOID = "#000";
const SIGNAL = "#fff";
const MUTED = "#9aa4b2";

const TEXT = { size: 13, line: 19, char: 7.8 };
const BUCKETS = 10;
const BAR_CELLS = 18;

const token = process.env.GH_TOKEN ?? execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();

/** Una sola consulta trae repos, lenguajes y contribuciones. Sólo se publican agregados. */
async function fetchStats() {
  const query = `query($login:String!){user(login:$login){
    repositories(first:100,ownerAffiliations:OWNER){nodes{languages(first:20){nodes{name}}}}
    contributionsCollection{contributionCalendar{totalContributions}}}}`;
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "user-agent": "neobmo-profile" },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  if (!response.ok) throw new Error(`GitHub respondió ${response.status}`);
  const { data, errors } = await response.json();
  if (errors) throw new Error(errors[0].message);

  // Contamos repos por lenguaje, no bytes: un archivo generado no debe aplastar lo demás.
  const repos = data.user.repositories.nodes;
  const counts = new Map();
  for (const repo of repos) {
    for (const { name } of repo.languages.nodes) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return {
    repos: repos.length,
    contributions: data.user.contributionsCollection.contributionCalendar.totalContributions,
    languages: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}

/** Generador con semilla: la misma entrada produce el mismo SVG y el diff queda limpio. */
function seeded(seed) {
  return () => (seed = (seed * 48271) % 2147483647) / 2147483647;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
function paintingLayer(painting, { scale, keep, top = 0 }) {
  const random = seeded(1890);
  const items = [];
  for (const [col, row, glyph, r, g, b, lum] of painting.cells) {
    const px = (col + 0.2) * painting.cellWidth * scale;
    if (random() >= keep(px)) continue;
    const bucket = Math.min(BUCKETS - 1, Math.floor(((1 - lum) * 0.7 + random() * 0.3) * BUCKETS));
    items.push({ className: `p p${bucket}`, fill: hex(r, g, b), glyph, px, py: top + (row + 0.8) * painting.cellHeight * scale });
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

/** Barra hecha con la rampa de densidad del motor: termina en polvo, no en un borde. */
function bar(count, max) {
  const length = Math.max(3, Math.round((count / max) * BAR_CELLS));
  return "@".repeat(length - 3) + "#+:";
}

/** Cada línea es un bloque: `type` se escribe carácter a carácter; el resto aparece. */
function terminalLines(stats) {
  const nameWidth = Math.max(...stats.languages.map(([name]) => name.length)) + 2;
  const max = stats.languages[0][1];
  return [
    { command: "whoami" },
    ...WHO.map((text, i) => ({ text, color: i ? MUTED : SIGNAL })),
    { gap: true },
    { command: "ls ahora" },
    { text: NOW, color: SIGNAL },
    { gap: true },
    { command: "langs --por-repo" },
    ...stats.languages.slice(0, 8).map(([name, count], i) => ({
      parts: [
        { text: name.padEnd(nameWidth), color: MUTED },
        { text: bar(count, max), color: COLORS[i % COLORS.length] },
        { text: ` ${count}`, color: SIGNAL },
      ],
    })),
    { text: `${stats.repos} repos · ${stats.contributions} contribuciones en un año`, color: MUTED },
    { gap: true },
    { command: CLOSING, cursor: true },
  ];
}

function terminalLayer(lines, { x, y, start }) {
  const output = [];
  let top = y;
  let clock = start;

  for (const line of lines) {
    if (line.gap) {
      top += TEXT.line * 0.6;
      continue;
    }
    if (line.command !== undefined) {
      const width = (line.command.length + 2) * TEXT.char;
      const duration = line.command.length * 0.04;
      output.push(
        `<text class="print" x="${x}" y="${top}" style="--t:${clock.toFixed(2)}s"><tspan fill="${COLORS[0]}">&gt;</tspan><tspan fill="${SIGNAL}" dx="${TEXT.char}">${escape(line.command)}</tspan></text>`,
        `<rect class="typing" x="${x + TEXT.char * 2}" y="${top - TEXT.size}" width="${width}" height="${TEXT.line}" fill="${VOID}" style="--w:${width}px;--n:${line.command.length};--t:${clock.toFixed(2)}s;--d:${duration.toFixed(2)}s"/>`,
      );
      clock += duration + 0.12;
      if (line.cursor) {
        const cursorX = x + (line.command.length + 2) * TEXT.char;
        output.push(`<rect class="cursor" x="${cursorX}" y="${top - TEXT.size + 2}" width="${TEXT.char}" height="${TEXT.size + 2}" fill="${SIGNAL}" style="--t:${clock.toFixed(2)}s"/>`);
      }
    } else {
      const parts = line.parts ?? [line];
      const spans = parts.map((p) => `<tspan fill="${p.color}" xml:space="preserve">${escape(p.text)}</tspan>`).join("");
      output.push(`<text class="print" x="${x}" y="${top}" xml:space="preserve" style="--t:${clock.toFixed(2)}s">${spans}</text>`);
      clock += 0.07;
    }
    top += TEXT.line;
  }
  return { markup: output.join("\n"), bottom: top };
}

function styles(fontBase64) {
  const painted = Array.from({ length: BUCKETS }, (_, i) => `.p${i}{animation-delay:${(1 + i * 0.17).toFixed(2)}s}.n${i},.d${i}{animation-delay:${(i * 0.09).toFixed(2)}s}`).join("");
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
${painted}
@keyframes arrive{from{opacity:0}}
@keyframes appear{from{opacity:0}}
@keyframes noise{0%{opacity:0}8%,62%{opacity:1}82%,100%{opacity:0}}
@keyframes type{from{transform:translateX(0)}to{transform:translateX(var(--w))}}
@keyframes blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
}

function svg({ width, height, glyph, description, layers, fontBase64 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escape(description)}">
<title>${escape(description)}</title>
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

function buildWide(painting, stats, fontBase64) {
  const width = 900;
  const scale = 0.625;
  const height = Math.round(painting.rows * painting.cellHeight * scale);
  const terminal = terminalLayer(terminalLines(stats), { x: 30, y: 44, start: 3.1 });
  const noise = noiseLayer({
    width, height, count: 2600,
    className: (b) => `n n${b}`,
    spawn: (random) => [random(), random()],
  });
  // Polvo: el rastro que queda donde el ruido se vuelve pintura. Nunca entra en la terminal.
  const dust = noiseLayer({
    width, height, count: 900,
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
  return svg({ width, height, glyph: 7.5, description: describe(stats), layers, fontBase64 });
}

function buildNarrow(painting, stats, fontBase64) {
  const width = 440;
  const paintingHeight = painting.rows * painting.cellHeight;
  const terminal = terminalLayer(terminalLines(stats), { x: 22, y: paintingHeight + 34, start: 3.1 });
  const height = Math.ceil(terminal.bottom + 12);
  const noise = noiseLayer({
    width, height: paintingHeight, count: 1100,
    className: (b) => `n n${b}`,
    spawn: (random) => [random(), random()],
  });
  const layers = {
    painting: paintingLayer(painting, { scale: 1, keep: () => 1 }),
    noise,
    terminal: terminal.markup,
  };
  return svg({ width, height, glyph: 8, description: describe(stats), layers, fontBase64 });
}

function describe(stats) {
  const languages = stats.languages.map(([name, count]) => `${name} ${count}`).join(", ");
  return `Caracteres sueltos convergen en La noche estrellada dibujada en ASCII. Luis Rodríguez, NeoBmo: frontend autodidacta en Barranquilla. Lenguajes por número de repositorios: ${languages}.`;
}

const stats = await fetchStats();
const fontBase64 = (await readFile("assets/jetbrains-mono.woff2")).toString("base64");
const load = async (name) => JSON.parse(await readFile(`assets/${name}.json`, "utf8"));

await writeFile("assets/profile-wide.svg", buildWide(await load("painting-wide"), stats, fontBase64));
await writeFile("assets/profile-narrow.svg", buildNarrow(await load("painting-narrow"), stats, fontBase64));

console.log(`${stats.repos} repos · ${stats.contributions} contribuciones · ${stats.languages.map(([n, c]) => `${n} ${c}`).join(", ")}`);
