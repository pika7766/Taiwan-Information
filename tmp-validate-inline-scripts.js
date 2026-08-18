const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script(?:[^>]*type=['"]?text\/javascript['"]?)?[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
if (!scripts.length) {
  throw new Error('No inline scripts found');
}
scripts.forEach((code, index) => {
  try {
    new vm.Script(code, { filename: `inline-script-${index}.js` });
  } catch (err) {
    console.error(`Syntax error in inline script ${index}:`, err.message);
    process.exit(1);
  }
});
console.log(`Inline script syntax check passed for ${scripts.length} script block(s).`);
