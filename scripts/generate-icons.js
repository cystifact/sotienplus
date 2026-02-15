/**
 * Generate PWA icons for Sổ Ghi Tiền
 * Run: node scripts/generate-icons.js
 *
 * Creates simple emerald green icons with "SGT" text.
 * For production, replace with proper designed icons.
 */

const fs = require('fs');
const path = require('path');

// Simple SVG icon template - emerald green with SGT text
function createSVG(size, maskable = false) {
  const padding = maskable ? size * 0.1 : 0;
  const bgSize = size;
  const iconSize = size - padding * 2;
  const fontSize = Math.floor(iconSize * 0.3);
  const subFontSize = Math.floor(iconSize * 0.12);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bgSize}" height="${bgSize}" viewBox="0 0 ${bgSize} ${bgSize}">
  <rect width="${bgSize}" height="${bgSize}" fill="#059669" rx="${maskable ? 0 : size * 0.15}"/>
  <text x="${bgSize/2}" y="${bgSize * 0.45}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">SGT</text>
  <text x="${bgSize/2}" y="${bgSize * 0.68}" font-family="Arial, sans-serif" font-size="${subFontSize}" fill="rgba(255,255,255,0.8)" text-anchor="middle" dominant-baseline="middle">Sổ Ghi Tiền</text>
</svg>`;
}

const publicDir = path.join(__dirname, '..', 'public');

// Generate SVG versions (browsers can use these)
const sizes = [192, 512];

for (const size of sizes) {
  // Regular icon
  const svg = createSVG(size, false);
  fs.writeFileSync(path.join(publicDir, `icon-${size}x${size}.svg`), svg);

  // Maskable icon (full bleed, no rounded corners)
  const maskableSvg = createSVG(size, true);
  fs.writeFileSync(path.join(publicDir, `icon-${size}x${size}-maskable.svg`), maskableSvg);
}

// Also create a favicon.svg
const faviconSvg = createSVG(32, false);
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg);

console.log('Icons generated in public/ directory');
console.log('Note: For production, convert SVGs to PNGs using:');
console.log('  npx sharp-cli icon-192x192.svg -o icon-192x192.png');
console.log('  npx sharp-cli icon-512x512.svg -o icon-512x512.png');
console.log('Or use an online tool like realfavicongenerator.net');
