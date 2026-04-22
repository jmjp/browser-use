import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const __dirname = resolve();
const buildDir = resolve(__dirname, 'dist');
const distDir = resolve(__dirname, 'dist');
const zipFile = resolve(distDir, 'ultra-browser.zip');

function run(command: string) {
  console.log(`Running: ${command}`);
  execSync(command, { stdio: 'inherit' });
}

async function main() {
  console.log('Starting build process...');

  // 1. Clean up
  if (existsSync(distDir)) {
    console.log('Cleaning dist directory...');
    rmSync(distDir, { recursive: true, force: true });
  }
  mkdirSync(distDir, { recursive: true });

  // 2. Build SvelteKit
  console.log('Building SvelteKit app...');
  run('pnpm build');

  // 3. Build Background Script
  console.log('Building Background script...');
  run('pnpm build:background');

  // 3.5 Post-process SvelteKit build for Chrome Extension CSP
  console.log('Post-processing SvelteKit build for CSP compliance...');
  const indexPath = resolve(buildDir, 'index.html');
  if (existsSync(indexPath)) {
    let indexHtml = readFileSync(indexPath, 'utf-8');

    // Find the inline script
    // SvelteKit 5 usually injects one script block for initialization
    const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
    let match;
    let count = 0;

    while ((match = scriptRegex.exec(indexHtml)) !== null) {
      const inlineContent = match[1];
      const scriptFilename = `internal/loader-${count}.js`;
      const scriptPath = resolve(buildDir, scriptFilename);

      // Write the inline content to a new file
      writeFileSync(scriptPath, inlineContent);
      console.log(`Moved inline script to ${scriptFilename}`);
      count++;
    }

    // Replace all inline scripts with external ones
    let newCount = 0;
    indexHtml = indexHtml.replace(/<script>([\s\S]*?)<\/script>/g, () => {
      const tag = `<script src="/internal/loader-${newCount}.js"></script>`;
      newCount++;
      return tag;
    });

    writeFileSync(indexPath, indexHtml);
  }

  console.log('Build completed successfully! Files are in the dist/ directory.');
}

main().catch((err) => {
  console.error('Build process failed:', err);
  process.exit(1);
});
