// Genera la portada del perfil y una tarjeta de estadísticas con el mismo lenguaje visual.
// Las estadísticas sólo leen repositorios públicos; los privados nunca se piden.
// Uso: GH_TOKEN=... node scripts/build-profile.mjs  (o, en local, con `gh` autenticado)
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const LOGIN = "NeoBmo";
const IDENTITY = ["luis rodríguez · neobmo", "frontend developer · barranquilla"];
const DESCRIPTION = "Caracteres sueltos convergen en La noche estrellada dibujada en ASCII. Luis Rodríguez, NeoBmo: frontend developer en Barranquilla.";

const NOISE = "!#$%&*+-/:;<=>?@[]^_{|}~01";
const MOON = "#f4c95d";
const VOID = "#000";
const SIGNAL = "#fff";
const MUTED = "#9aa4b2";
const BARS = [MOON, "#8fc3ea", "#5f86e8", "#7fd1c7", "#e9a24c", "#b7c7f2", "#d9dfe8"];

const TEXT = { size: 15, line: 24, char: 9 };
const BUCKETS = 10;
const BAR_CELLS = 18;
const CARD_PADDING = 30;

const token = process.env.GH_TOKEN ?? execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();

/** Pide una página de repos públicos y las contribuciones del usuario. */
async function fetchPage(after) {
  const query = `query($login:String!,$after:String){user(login:$login){
    repositories(first:100,after:$after,ownerAffiliations:OWNER,privacy:PUBLIC){
      totalCount pageInfo{hasNextPage endCursor}
      nodes{isPrivate languages(first:20){nodes{name}}}}
    contributionsCollection{restrictedContributionsCount contributionCalendar{totalContributions}}}}`;
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "user-agent": "neobmo-profile" },
    body: JSON.stringify({ query, variables: { login: LOGIN, after } }),
  });
  if (!response.ok) throw new Error(`GitHub respondió ${response.status}`);
  const { data, errors } = await response.json();
  if (errors) throw new Error(errors[0].message);
  if (!data.user) throw new Error(`No existe el usuario ${LOGIN}`);
  return data.user;
}

/** Recorre todas las páginas y se detiene antes de publicar si aparece un repo privado. */
async function fetchStats() {
  const counts = new Map();
  let after = null;
  let user;
  do {
    user = await fetchPage(after);
    for (const repo of user.repositories.nodes) {
      if (repo.isPrivate) throw new Error("La consulta devolvió un repositorio privado");
      // Contamos repos por lenguaje, no bytes: un archivo generado no debe aplastar lo demás.
      for (const { name } of repo.languages.nodes) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    after = user.repositories.pageInfo.endCursor;
  } while (user.repositories.pageInfo.hasNextPage);

  const { contributionCalendar, restrictedContributionsCount } = user.contributionsCollection;
  return {
    repos: user.repositories.totalCount,
    // El calendario suma actividad privada; aquí sólo se muestra la pública.
    contributions: contributionCalendar.totalContributions - restrictedContributionsCount,
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

/** Barra hecha con la rampa de densidad del motor: termina en polvo, no en un borde. */
function bar(count, max) {
  const length = Math.max(3, Math.round((count / max) * BAR_CELLS));
  return "@".repeat(length - 3) + "#+:";
}

const heading = (x, y, command) =>
  `<text x="${x}" y="${y}"><tspan fill="${MOON}">&gt;</tspan><tspan fill="${SIGNAL}" dx="${TEXT.char}">${escape(command)}</tspan></text>`;

const row = (x, y, parts) =>
  `<text x="${x}" y="${y}" xml:space="preserve">${parts.map(([text, fill]) => `<tspan fill="${fill}">${escape(text)}</tspan>`).join("")}</text>`;

function languageRows({ languages }, x, y) {
  const nameWidth = Math.max(0, ...languages.map(([name]) => name.length)) + 2;
  const max = languages[0]?.[1] ?? 1;
  return languages.slice(0, 8).map(([name, count], i) =>
    row(x, y + TEXT.line * (i + 1), [
      [name.padEnd(nameWidth), MUTED],
      [bar(count, max), BARS[i % BARS.length]],
      [` ${count}`, SIGNAL],
    ]),
  );
}

function totalRows(stats, x, y) {
  const totals = [
    ["repos", stats.repos],
    ["contribuciones", stats.contributions],
    ["lenguajes", stats.languages.length],
  ];
  return totals.map(([label, value], i) =>
    row(x, y + TEXT.line * (i + 1), [[label.padEnd(16), MUTED], [String(value), SIGNAL]]),
  );
}

function card({ width, height, stats, body, fontBase64 }) {
  const languages = stats.languages.map(([name, count]) => `${name} ${count}`).join(", ");
  const description = `Estadísticas de repositorios públicos: ${stats.repos} repositorios, ${stats.contributions} contribuciones en un año. Lenguajes por repositorio: ${languages}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escape(description)}">
<title>${escape(description)}</title>
<style>@font-face{font-family:M;font-weight:100 800;src:url(data:font/woff2;base64,${fontBase64}) format("woff2")}
text{font-family:M,ui-monospace,monospace;font-size:${TEXT.size}px;font-weight:500;white-space:pre}</style>
<rect width="${width}" height="${height}" fill="${VOID}"/>
${body.join("\n")}
</svg>
`;
}

function buildStatsWide(stats, fontBase64) {
  const y = CARD_PADDING + TEXT.size;
  const rows = Math.max(Math.min(stats.languages.length, 8), 3);
  const body = [
    heading(CARD_PADDING, y, "langs --publicos"),
    ...languageRows(stats, CARD_PADDING, y),
    heading(560, y, "stats --publicas"),
    ...totalRows(stats, 560, y),
  ];
  return card({ width: 900, height: y + TEXT.line * rows + CARD_PADDING, stats, body, fontBase64 });
}

function buildStatsNarrow(stats, fontBase64) {
  const x = 22;
  const y = CARD_PADDING + TEXT.size;
  const languageCount = Math.min(stats.languages.length, 8);
  const totalsY = y + TEXT.line * (languageCount + 2);
  const body = [
    heading(x, y, "langs --publicos"),
    ...languageRows(stats, x, y),
    heading(x, totalsY, "stats --publicas"),
    ...totalRows(stats, x, totalsY),
  ];
  return card({ width: 440, height: totalsY + TEXT.line * 3 + CARD_PADDING, stats, body, fontBase64 });
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

const stats = await fetchStats();
await writeFile("assets/stats-wide.svg", buildStatsWide(stats, fontBase64));
await writeFile("assets/stats-narrow.svg", buildStatsNarrow(stats, fontBase64));

console.log(`${stats.repos} repos públicos · ${stats.contributions} contribuciones · ${stats.languages.map(([n, c]) => `${n} ${c}`).join(", ")}`);
