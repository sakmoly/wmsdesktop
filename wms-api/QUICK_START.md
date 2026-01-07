# Quick Start - Build Deployment Package

## Prerequisites

1. **Node.js 18+** installed
2. All dependencies installed: `npm install`

## Build Steps

### 1. Install Build Tools

```bash
cd wms-api
npm install
```

This will install:
- `esbuild` - For bundling code
- `pkg` - For creating executable

### 2. Build the Executable

```bash
npm run package
```

This command will:
1. Bundle all code into a single file
2. Create `wms-api.exe`
3. Package everything into `deployment` folder

### 3. Deployment Package Location

After building, you'll find the deployment package in:

```
wms-api/deployment/
```

## What's Included

The `deployment` folder contains:

- **wms-api.exe** - Standalone executable (includes Node.js runtime)
- **.env.template** - Configuration template
- **install.bat** - Installation script
- **start-server.bat** - Start server script
- **setup-firewall.bat** - Firewall configuration
- **README.txt** - User documentation

## Deploy to Client

1. Copy the entire `deployment` folder to client machine
2. Run `install.bat` on client machine
3. Edit `.env` file with database credentials
4. Run `start-server.bat` to start server

## Troubleshooting

### Build Fails

If build fails:

```bash
# Clean and rebuild
rm -rf dist deployment node_modules
npm install
npm run package
```

### mysql2 Native Module Issues

If you see mysql2 errors:

1. Ensure you're building on Windows (target: win-x64)
2. Try: `npm install mysql2 --build-from-source`
3. Check that Node.js version matches (18+)

### Executable Size

The executable will be ~50-70MB (includes Node.js runtime). This is normal.

## Alternative: Manual Build

If automated build fails, build manually:

```bash
# Step 1: Bundle code
node build.js

# Step 2: Create executable
pkg dist/entry.js --targets node18-win-x64 --output dist/wms-api.exe

# Step 3: Package deployment
node package-deployment.js
```

## Testing the Build

After building, test locally:

```bash
cd deployment
# Create .env from template
copy .env.template .env
# Edit .env with your settings
# Then run
wms-api.exe
```

Or use the start script:

```bash
start-server.bat
```

Test: http://localhost:3000/health
