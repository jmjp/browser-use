import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';

const __dirname = resolve();
const buildDir = resolve(__dirname, 'dist');

function run(command: string) {
  console.log(`Running: ${command}`);
  execSync(command, { stdio: 'inherit' });
}

function getAllFiles(dir: string, ext: string): string[] {
  let results: string[] = [];
  if (!existsSync(dir)) return results;
  const list = readdirSync(dir);
  list.forEach((file) => {
    file = join(dir, file);
    const stat = statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(file, ext));
    } else if (file.endsWith(ext)) {
      results.push(file);
    }
  });
  return results;
}

async function main() {
  console.log('Starting build process...');

  // 1. Clean up
  if (existsSync(buildDir)) {
    console.log('Cleaning dist directory...');
    rmSync(buildDir, { recursive: true, force: true });
  }
  mkdirSync(buildDir, { recursive: true });

  // 2. Build SvelteKit
  console.log('Building SvelteKit app...');
  run('pnpm build');

  // 3. Build Background Script
  console.log('Building Background script...');
  run('pnpm build:background');

  // 3.5 Post-process SvelteKit build for Chrome Extension CSP
  console.log('Post-processing SvelteKit build for CSP compliance...');
  
  const internalScriptsDir = resolve(buildDir, 'internal-scripts');
  if (!existsSync(internalScriptsDir)) {
    mkdirSync(internalScriptsDir, { recursive: true });
  }

  // --- Process HTML Files ---
  const htmlFiles = getAllFiles(buildDir, '.html');
  for (const filePath of htmlFiles) {
    const relativePath = relative(buildDir, filePath);
    let html = readFileSync(filePath, 'utf-8');
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let count = 0;
    
    const newHtml = html.replace(scriptRegex, (match, content) => {
      if (match.includes(' src=')) return match;
      const inlineContent = content.trim();
      if (!inlineContent) return match;

      const scriptId = relativePath.replace(/[/\\]/g, '-').replace('.html', '');
      const scriptFilename = `internal-scripts/loader-${scriptId}-${count}.js`;
      const scriptAbsPath = resolve(buildDir, scriptFilename);
      
      writeFileSync(scriptAbsPath, inlineContent);
      console.log(`  -> Extracted inline script from ${relativePath} to ${scriptFilename}`);
      
      count++;
      return `<script src="/${scriptFilename}"></script>`;
    });
    
    if (html !== newHtml) writeFileSync(filePath, newHtml);
  }

  console.log('Build completed successfully! Files are in the dist/ directory.');
}

main().catch((err) => {
  console.error('Build process failed:', err);
  process.exit(1);
});
