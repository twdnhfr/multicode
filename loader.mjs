// Custom loader für .scm und .wasm Dateien
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

export async function load(url, context, nextLoad) {
  // .scm Dateien (tree-sitter queries)
  if (url.endsWith('.scm')) {
    const filePath = fileURLToPath(url);
    const source = readFileSync(filePath, 'utf8');
    return {
      format: 'module',
      source: `export default ${JSON.stringify(source)};`,
      shortCircuit: true,
    };
  }

  // .wasm Dateien
  if (url.endsWith('.wasm')) {
    const filePath = fileURLToPath(url);
    const buffer = readFileSync(filePath);
    const base64 = buffer.toString('base64');
    return {
      format: 'module',
      source: `
        const base64 = "${base64}";
        const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        export default binary.buffer;
      `,
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
}
