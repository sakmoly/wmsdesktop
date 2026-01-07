// Build script to bundle ES modules into a single file for packaging
import esbuild from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function build() {
  console.log('🔨 Building WMS API for deployment...\n');

  // Ensure dist directory exists
  const distDir = join(__dirname, 'dist');
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  try {
    // Bundle the server entry point to CommonJS (for pkg compatibility)
    // Externalize native modules - they'll be included by pkg separately
    await esbuild.build({
      entryPoints: ['src/server.js'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs', // Use CommonJS for pkg compatibility
      outfile: 'dist/server.cjs',
      external: [
        'mysql2', // Native module - keep external, pkg will include it
        'mysql2/promise', // Native module
      ],
      banner: {
        js: `// WMS API Server - Bundled Build\n// Built: ${new Date().toISOString()}\n`,
      },
      keepNames: true,
      sourcemap: false,
      minify: false, // Keep readable for debugging
      logLevel: 'info',
    });

    // Create a wrapper entry point for pkg
    const wrapperContent = `// WMS API Server - Entry Point for pkg
// This file loads the bundled server
require('./server.cjs');
`;
    writeFileSync(join(distDir, 'entry.js'), wrapperContent);

    console.log('\n✅ Build completed successfully!');
    console.log('📦 Output: dist/server.cjs');
    console.log('📦 Entry: dist/entry.js');
    console.log('\n💡 Note: mysql2 native module will be included by pkg automatically\n');
  } catch (error) {
    console.error('\n❌ Build failed:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

build();
