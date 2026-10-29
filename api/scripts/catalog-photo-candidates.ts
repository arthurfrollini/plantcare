/**
 * Lists CC0 and public-domain photos on Wikimedia Commons for each curated species, and writes a
 * contact sheet to pick from. Used once to choose the catalog photos (plan Task 9).
 *
 *   npx tsx scripts/catalog-photo-candidates.ts <out dir>
 *   npx tsx scripts/catalog-photo-candidates.ts save <picks.json>
 *
 * The first writes <out dir>/candidates.json and <out dir>/sheet-<slug>.png (up to 8 candidates each,
 * numbered). The second saves each picked photo to public/plants/<slug>.webp, 800x800, and prints
 * the credits for seed-data.ts.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';

const API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'PlantCare/0.1 (arthur.frollini@gmail.com)';

// Scientific name first, then older names and common names Commons files often use.
const SPECIES: { slug: string; queries: string[] }[] = [
  {
    slug: 'aningapara',
    queries: ['Montrichardia linifera', 'Montrichardia arborescens'],
  },
  { slug: 'zamioculca', queries: ['Zamioculcas zamiifolia'] },
  {
    slug: 'peperomia',
    queries: ['Peperomia obtusifolia', 'Peperomia magnoliifolia'],
  },
  {
    slug: 'imbe',
    queries: [
      'Thaumatophyllum bipinnatifidum',
      'Philodendron bipinnatifidum',
      'Philodendron selloum',
    ],
  },
  {
    slug: 'espada-sao-jorge',
    queries: ['Dracaena trifasciata', 'Sansevieria trifasciata'],
  },
  { slug: 'yucca', queries: ['Yucca gigantea', 'Yucca elephantipes'] },
  {
    slug: 'orquidea',
    queries: ['Phalaenopsis', 'Phalaenopsis hybrid', 'moth orchid'],
  },
  {
    slug: 'violeta',
    queries: ['Streptocarpus ionanthus', 'Saintpaulia', 'African violet'],
  },
  {
    slug: 'hortensia',
    queries: ['Hydrangea macrophylla', 'Hydrangea', 'hortensia flowers'],
  },
];

const pageSchema = z.object({
  title: z.string(),
  index: z.number(),
  imageinfo: z
    .array(
      z.object({
        width: z.number(),
        height: z.number(),
        url: z.string(),
        thumburl: z.string().optional(),
        descriptionurl: z.string(),
        extmetadata: z
          .object({
            LicenseShortName: z.object({ value: z.string() }).optional(),
            Artist: z.object({ value: z.string() }).optional(),
          })
          .optional(),
      }),
    )
    .min(1),
});
const searchSchema = z.object({
  query: z.object({ pages: z.record(z.string(), pageSchema) }).optional(),
  continue: z.object({ gsroffset: z.number() }).optional(),
});

type Candidate = {
  title: string;
  thumb: string;
  original: string;
  source: string;
  author: string;
  license: string;
  width: number;
  height: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function publicDomain(license: string): boolean {
  const l = license.trim().toLowerCase();
  return (
    l === 'cc0' ||
    l.startsWith('cc0 ') ||
    l.startsWith('public domain') ||
    l.startsWith('pd')
  );
}

async function search(
  query: string,
  offset: number,
): Promise<z.infer<typeof searchSchema>> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${query} filetype:bitmap`,
    gsrlimit: '50',
    gsroffset: String(offset),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiextmetadatafilter: 'LicenseShortName|Artist',
    iiurlwidth: '600',
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${API}?${params.toString()}`, {
      headers: { 'user-agent': USER_AGENT },
    });
    const body: unknown = await response.json();
    const parsed = searchSchema.safeParse(body);
    if (
      parsed.success &&
      (parsed.data.query || parsed.data.continue === undefined)
    )
      return parsed.data;
    await sleep(3000); // "Search is too busy": wait and retry
  }
  return {};
}

async function candidatesFor(queries: string[]): Promise<Candidate[]> {
  const found = new Map<string, Candidate>();
  for (const query of queries) {
    for (let offset = 0; offset < 150; offset += 50) {
      const result = await search(query, offset);
      const pages = Object.values(result.query?.pages ?? {}).sort(
        (a, b) => a.index - b.index,
      );
      for (const page of pages) {
        const [info] = page.imageinfo;
        const license = info?.extmetadata?.LicenseShortName?.value ?? '';
        if (
          !info ||
          !publicDomain(license) ||
          Math.min(info.width, info.height) < 800
        )
          continue;
        found.set(page.title, {
          title: page.title,
          thumb: info.thumburl ?? info.url,
          original: info.url,
          source: info.descriptionurl,
          author:
            (info.extmetadata?.Artist?.value ?? '')
              .replace(/<[^>]*>/g, '')
              .trim() || 'Unknown',
          license,
          width: info.width,
          height: info.height,
        });
      }
      if (!result.continue) break;
      await sleep(1000);
    }
  }
  return [...found.values()];
}

async function sheet(
  slug: string,
  candidates: Candidate[],
  out: string,
): Promise<void> {
  const tile = 260;
  const picks = candidates.slice(0, 8);
  const tiles = await Promise.all(
    picks.map(async (candidate, i) => {
      const response = await fetch(candidate.thumb, {
        headers: { 'user-agent': USER_AGENT },
      });
      const image = await sharp(Buffer.from(await response.arrayBuffer()))
        .rotate()
        .resize(tile, tile, { fit: 'cover' })
        .toBuffer();
      const label = Buffer.from(
        `<svg width="${tile}" height="34"><rect width="34" height="34" fill="black"/><text x="9" y="25" font-size="22" font-family="Arial" fill="white">${i + 1}</text></svg>`,
      );
      return {
        input: await sharp(image)
          .composite([{ input: label, top: 0, left: 0 }])
          .png()
          .toBuffer(),
        left: (i % 4) * (tile + 6),
        top: Math.floor(i / 4) * (tile + 6),
      };
    }),
  );
  const rows = Math.max(1, Math.ceil(picks.length / 4));
  await sharp({
    create: {
      width: 4 * (tile + 6),
      height: rows * (tile + 6),
      channels: 3,
      background: '#222',
    },
  })
    .composite(tiles)
    .png()
    .toFile(path.join(out, `sheet-${slug}.png`));
}

const picksSchema = z.record(
  z.string(),
  z.object({
    thumb: z.string(),
    source: z.string(),
    author: z.string(),
    license: z.string(),
  }),
);

async function save(picksFile: string): Promise<void> {
  const picks = picksSchema.parse(
    JSON.parse(await readFile(picksFile, 'utf8')),
  );
  const dir = path.join(import.meta.dirname, '..', 'public', 'plants');
  for (const [slug, pick] of Object.entries(picks)) {
    const response = await fetch(pick.thumb, {
      headers: { 'user-agent': USER_AGENT },
    });
    if (!response.ok) throw new Error(`${slug}: ${response.status}`);
    await sharp(Buffer.from(await response.arrayBuffer()))
      .rotate()
      .resize(800, 800, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(path.join(dir, `${slug}.webp`));
    console.log(
      `${slug}: ${JSON.stringify({ author: pick.author, license: pick.license, source: pick.source })}`,
    );
    await sleep(1000);
  }
}

async function main(): Promise<void> {
  if (process.argv[2] === 'save') {
    const picksFile = process.argv[3];
    if (!picksFile)
      throw new Error('usage: catalog-photo-candidates.ts save <picks.json>');
    return save(picksFile);
  }
  const out = process.argv[2];
  if (!out) throw new Error('usage: catalog-photo-candidates.ts <out dir>');
  await mkdir(out, { recursive: true });
  const all: Record<string, Candidate[]> = {};
  for (const species of SPECIES) {
    const candidates = await candidatesFor(species.queries);
    all[species.slug] = candidates;
    console.log(`${species.slug}: ${candidates.length} candidates`);
    if (candidates.length > 0) await sheet(species.slug, candidates, out);
  }
  await writeFile(
    path.join(out, 'candidates.json'),
    JSON.stringify(all, null, 2),
  );
}

void main();
