import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(projectDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const outputDir = path.join(projectDir, '安裝檔');
await mkdir(outputDir, { recursive: true });
await copyFile(source, path.join(outputDir, '台灣智慧生活-android-debug.apk'));
