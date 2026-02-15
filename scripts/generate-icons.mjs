import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'App-icon.png');
const PUBLIC = path.join(ROOT, 'public');

async function generateIcons() {
  const metadata = await sharp(SOURCE).metadata();
  console.log(`Source image: ${metadata.width}x${metadata.height}`);

  // Trim whitespace from source to get the actual graphic content
  const trimmed = await sharp(SOURCE)
    .trim()
    .toBuffer({ resolveWithObject: true });
  console.log(`Trimmed to: ${trimmed.info.width}x${trimmed.info.height}`);

  // 1. Standard icons — use trimmed source so the graphic fills the space
  for (const size of [192, 512]) {
    await sharp(trimmed.data)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(PUBLIC, `icon-${size}x${size}.png`));
    console.log(`Generated icon-${size}x${size}.png`);
  }

  // 2. Maskable icons — use original source as-is (already has safe zone padding)
  for (const size of [192, 512]) {
    await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(path.join(PUBLIC, `icon-${size}x${size}-maskable.png`));
    console.log(`Generated icon-${size}x${size}-maskable.png`);
  }

  // 3. Favicon ICO (multi-size: 16, 32, 48) — use trimmed source
  const faviconSizes = [16, 32, 48];
  const faviconBuffers = [];
  for (const size of faviconSizes) {
    const buf = await sharp(trimmed.data)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    faviconBuffers.push({ size, buf });
  }

  const icoBuffer = buildIco(faviconBuffers);
  fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), icoBuffer);
  console.log('Generated favicon.ico');

  // 4. Favicon PNG (32x32) — use trimmed source
  await sharp(trimmed.data)
    .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(path.join(PUBLIC, 'favicon.png'));
  console.log('Generated favicon.png');

  console.log('\nAll icons generated successfully!');
}

function buildIco(images) {
  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = images.length;
  let dataOffset = headerSize + dirEntrySize * numImages;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(numImages, 4);

  const dirEntries = [];
  const imageDataBuffers = [];

  for (const { size, buf } of images) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(size < 256 ? size : 0, 0);
    entry.writeUInt8(size < 256 ? size : 0, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(dataOffset, 12);

    dirEntries.push(entry);
    imageDataBuffers.push(buf);
    dataOffset += buf.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageDataBuffers]);
}

generateIcons().catch(console.error);
