/*
  Generates PWA icons from public/logo-quadrada.png
  - public/icons/icon-192.png (192x192)
  - public/icons/apple-touch-icon-180.png (180x180)

  Requires: sharp (npm i -D sharp)
*/

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const src = path.join(process.cwd(), 'public', 'logo-quadrada.png');
  const outDir = path.join(process.cwd(), 'public', 'icons');

  if (!fs.existsSync(src)) {
    console.error('Source image not found:', src);
    process.exit(1);
  }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const targets = [
    { file: 'icon-192.png', size: 192 },
    { file: 'apple-touch-icon-180.png', size: 180 },
  ];

  for (const t of targets) {
    const dest = path.join(outDir, t.file);
    await sharp(src).resize(t.size, t.size, { fit: 'cover' }).png().toFile(dest);
    console.log('Wrote', dest);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

