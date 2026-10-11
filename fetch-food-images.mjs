import { mkdir, readFile, writeFile } from 'node:fs/promises';

const OUT_DIR = new URL('./apps/web/public/menu/', import.meta.url);
const UA = 'TavolaDemoSeed/1.0 (restaurant demo app; one-time image fetch)';

const slugOf = (name) => `seed-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

const DISHES = [
  ['Paneer Tikka', ['paneer tikka', 'paneer tikka skewers']],
  ['Hara Bhara Kebab', ['hara bhara kebab', 'vegetable kebab green', 'vegetable cutlet kebab']],
  ['Chicken 65', ['chicken 65', 'chicken 65 dish', 'fried chicken chilli indian']],
  ['Crispy Corn', ['crispy corn dish', 'fried sweet corn snack', 'masala sweet corn']],
  ['Butter Chicken', ['butter chicken', 'murgh makhani']],
  ['Paneer Butter Masala', ['paneer butter masala', 'paneer makhani', 'paneer curry']],
  ['Dal Makhani', ['dal makhani', 'makhani dal lentils']],
  ['Kadai Chicken', ['kadai chicken', 'kadhai chicken', 'chicken curry']],
  ['Butter Naan', ['butter naan', 'naan bread', 'naan']],
  ['Garlic Naan', ['garlic naan', 'naan bread', 'naan']],
  ['Tandoori Roti', ['tandoori roti', 'roti tandoor', 'indian roti']],
  ['Cheese Stuffed Naan', ['cheese naan', 'stuffed naan', 'naan bread']],
  ['Hyderabadi Chicken Biryani', ['hyderabadi chicken biryani', 'chicken biryani']],
  ['Veg Dum Biryani', ['vegetable biryani', 'veg biryani', 'biryani vegetable']],
  ['Jeera Rice', ['jeera rice', 'cumin rice']],
  ['Steamed Rice', ['steamed rice', 'cooked white rice', 'basmati rice cooked']],
  ['Veg Hakka Noodles', ['hakka noodles', 'vegetable chow mein', 'fried noodles vegetables']],
  ['Chicken Manchurian Gravy', ['chicken manchurian', 'manchurian dish']],
  ['Chilli Paneer Dry', ['chilli paneer', 'paneer chilli']],
  ['Steamed Veg Momos', ['steamed momos', 'momos dumplings', 'vegetable momo']],
  ['Fresh Lime Soda', ['lime soda drink', 'lemon soda', 'lemonade glass']],
  ['Mango Lassi', ['mango lassi', 'lassi drink']],
  ['Cold Coffee with Ice Cream', ['cold coffee drink', 'iced coffee glass', 'coffee milkshake']],
  ['Masala Chai', ['masala chai', 'indian chai tea']],
  ['Gulab Jamun (2 pcs)', ['gulab jamun']],
  ['Rasmalai (2 pcs)', ['rasmalai']],
  ['Sizzling Brownie with Ice Cream', ['brownie with ice cream', 'chocolate brownie dessert', 'brownie sundae']],
  ['Boondi Raita', ['boondi raita', 'raita yogurt']],
  ['Green Salad', ['green salad bowl', 'vegetable salad bowl', 'salad vegetables']],
  ['Roasted Masala Papad', ['masala papad', 'papadum roasted', 'papad']],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, attempts = 3) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
      if (!res.ok) {
        console.warn(`  HTTP ${res.status} (attempt ${i + 1})`);
        await sleep(2000 * (i + 1));
        continue;
      }
      return await res.json();
    } catch (err) {
      console.warn(`  ${err.message} (attempt ${i + 1})`);
      await sleep(2000 * (i + 1));
    }
  }
  return null;
}

async function searchImage(queries) {
  for (const q of queries) {
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*'
      + '&generator=search&gsrnamespace=6&gsrlimit=6'
      + `&gsrsearch=${encodeURIComponent(q)}`
      + '&prop=imageinfo&iiprop=url%7Cmime%7Csize%7Cextmetadata&iiurlwidth=700';
    const data = await fetchJson(url);
    await sleep(800);
    if (!data?.query) continue;
      const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      for (const page of pages) {
        const info = page.imageinfo?.[0];
        if (!info) continue;
        if (info.mime !== 'image/jpeg' && info.mime !== 'image/png') continue;
        if ((info.width ?? 0) < 500 || (info.height ?? 0) < 400) continue;
        if (/svg|logo|diagram|map|chart/i.test(page.title)) continue;
        return { query: q, title: page.title, info };
      }
  }
  return null;
}

const stripHtml = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

await mkdir(OUT_DIR, { recursive: true });

const HEADER = ['# Food image credits', '', 'All images are from Wikimedia Commons (free licences). Retrieved automatically for the Tavola demo seed.', ''];

let manifest = {};
let creditLines = [];
try {
  manifest = JSON.parse(await readFile(new URL('./image-manifest.json', import.meta.url), 'utf8'));
  const existing = await readFile(new URL('CREDITS.md', OUT_DIR), 'utf8');
  creditLines = existing.split('\n').filter((line) => {
    const m = line.match(/^- \*\*(.+?)\*\*/);
    return m ? Boolean(manifest[slugOf(m[1])]) : false;
  });
} catch {
  // first run: no manifest yet
}

const credits = [...HEADER, ...creditLines];

for (const [name, queries] of DISHES) {
  const slug = slugOf(name);
  if (manifest[slug]) {
    console.log(`SKIP  ${name} (already have ${manifest[slug]})`);
    continue;
  }
  const hit = await searchImage(queries);
  if (!hit) {
    console.log(`MISS  ${name} (no usable image)`);
    credits.push(`- **${name}** — no image found; uses the letter placeholder.`);
    continue;
  }
  const ext = hit.info.mime === 'image/png' ? 'png' : 'jpg';
  const file = `${slug}.${ext}`;
  const thumb = (hit.info.thumburl || hit.info.url).split('?')[0];
  let buf = null;
  for (let attempt = 1; attempt <= 3 && !buf; attempt += 1) {
    try {
      const res = await fetch(thumb, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 8000) throw new Error(`too small (${bytes.length} bytes)`);
      buf = bytes;
    } catch (err) {
      console.warn(`  download attempt ${attempt} failed for ${name}: ${err.message}`);
      await sleep(2500 * attempt);
    }
  }
  try {
    if (!buf) throw new Error('all download attempts failed');
    await writeFile(new URL(file, OUT_DIR), buf);
    manifest[slug] = `/menu/${file}`;
    const meta = hit.info.extmetadata ?? {};
    const author = stripHtml(meta.Artist?.value) || 'Unknown';
    const license = stripHtml(meta.LicenseShortName?.value) || 'See source';
    const page = hit.info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(hit.title)}`;
    credits.push(`- **${name}** — [${hit.title.replace(/^File:/, '')}](${page}) by ${author}, ${license}.`);
    console.log(`OK    ${name} -> ${file} (${Math.round(buf.length / 1024)} KB) via "${hit.query}"`);
    await sleep(900);
  } catch (err) {
    console.log(`FAIL  ${name}: ${err.message}`);
    credits.push(`- **${name}** — download failed; uses the letter placeholder.`);
  }
}

await writeFile(new URL('./image-manifest.json', import.meta.url), JSON.stringify(manifest, null, 2));
await writeFile(new URL('CREDITS.md', OUT_DIR), credits.join('\n') + '\n');
console.log(`\n${Object.keys(manifest).length}/${DISHES.length} images saved.`);
