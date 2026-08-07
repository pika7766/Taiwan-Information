import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(projectDir, 'assets');
const wwwDir = path.join(projectDir, 'www');
const sourcePath = path.join(assetsDir, 'app-icon-source.jpg');
await mkdir(assetsDir, { recursive: true });
await mkdir(wwwDir, { recursive: true });

const source = await readFile(sourcePath);
const iconOnly = await sharp(source)
  .resize(1024, 1024, { fit: 'cover', position: 'centre' })
  .png()
  .toBuffer();
const foregroundSquare = await sharp(source)
  .resize(768, 768, { fit: 'cover', position: 'centre' })
  .png()
  .toBuffer();
const iconForeground = await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
}).composite([{ input: foregroundSquare, left: 128, top: 128 }]).png().toBuffer();
const splashMark = await sharp(iconOnly).resize(1280, 1280).png().toBuffer();

await Promise.all([
  sharp(iconOnly).toFile(path.join(assetsDir, 'icon-only.png')),
  sharp(iconForeground).toFile(path.join(assetsDir, 'icon-foreground.png')),
  sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00647a' } })
    .png().toFile(path.join(assetsDir, 'icon-background.png')),
  sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#00647a' } })
    .composite([{ input: splashMark, left: 726, top: 726 }])
    .png().toFile(path.join(assetsDir, 'splash.png')),
  sharp(iconOnly).resize(512, 512).toFile(path.join(wwwDir, 'app-icon.png'))
]);
