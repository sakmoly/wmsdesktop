# Debug vs Release Build Guide

## Overview
.NET projects have two main build configurations: **Debug** and **Release**. Each serves a different purpose and produces different output.

---

## 🔍 DEBUG Configuration

### Purpose
- **Development and testing**
- **Debugging** with breakpoints and step-through
- **Rapid iteration** during development

### Characteristics
- ✅ **Debug symbols included** (.pdb files) - allows debugging
- ✅ **No code optimization** - code runs exactly as written
- ✅ **Faster compilation** - less processing time
- ⚠️ **Larger file size** - includes debug information
- ⚠️ **Slower runtime** - no optimization
- ✅ **Detailed error messages** - easier troubleshooting
- ✅ **Assertions enabled** - debug checks active

### Output Location
```
bin\Debug\net8.0-windows\
```

### When to Use
- During development
- When testing new features
- When debugging issues
- When you need detailed error information

---

## 🚀 RELEASE Configuration

### Purpose
- **Production deployment**
- **Final distribution** to end users
- **Optimized performance**

### Characteristics
- ❌ **No debug symbols** (optional .pdb files)
- ✅ **Code optimization enabled** - compiler optimizes code
- ⚠️ **Slower compilation** - more processing for optimization
- ✅ **Smaller file size** - optimized and stripped
- ✅ **Faster runtime** - optimized code execution
- ⚠️ **Less detailed errors** - optimized code can be harder to debug
- ❌ **Assertions disabled** - performance optimized

### Output Location
```
bin\Release\net8.0-windows\
```

### When to Use
- For final deployment
- For production environment
- When you need best performance
- When distributing to users

---

## 📊 Comparison Table

| Feature | DEBUG | RELEASE |
|---------|-------|---------|
| **Optimization** | ❌ No | ✅ Yes |
| **Debug Symbols** | ✅ Yes | ❌ No |
| **File Size** | ⚠️ Larger | ✅ Smaller |
| **Runtime Speed** | ⚠️ Slower | ✅ Faster |
| **Compilation Speed** | ✅ Faster | ⚠️ Slower |
| **Error Details** | ✅ Detailed | ⚠️ Less detailed |
| **Use Case** | Development | Production |

---

## 🔧 How to Build Each Configuration

### Build Debug Configuration
```powershell
dotnet build Wms.Desktop.csproj --configuration Debug
# OR
dotnet build Wms.Desktop.csproj  # Debug is default
```

**Output:** `bin\Debug\net8.0-windows\Wms.Desktop.exe`

### Build Release Configuration
```powershell
dotnet build Wms.Desktop.csproj --configuration Release
```

**Output:** `bin\Release\net8.0-windows\Wms.Desktop.exe`

### Build Both Configurations
```powershell
# Build Debug
dotnet build Wms.Desktop.csproj --configuration Debug

# Build Release
dotnet build Wms.Desktop.csproj --configuration Release
```

---

## ❓ Why Do Different Folders Update at Different Times?

### Reason
**Each configuration builds to its own folder independently.**

- When you build **Debug** → Only `bin\Debug\` folder updates
- When you build **Release** → Only `bin\Release\` folder updates
- The folders are **completely separate** - building one does NOT affect the other

### Visual Studio / IDE Behavior
- If you run/debug from Visual Studio → Usually builds **Debug**
- If you publish/deploy → Usually builds **Release**
- The IDE remembers which configuration was last used

### Manual Build Behavior
- If you run `dotnet build` without specifying → Builds **Debug** (default)
- If you specify `--configuration Release` → Builds **Release**
- You need to explicitly build each configuration you want updated

---

## 💡 Best Practices

### During Development
1. ✅ Use **DEBUG** for daily development work
2. ✅ Build Debug when testing changes
3. ✅ Run from `bin\Debug\` folder

### Before Deployment
1. ✅ Build **RELEASE** configuration
2. ✅ Test the Release build thoroughly
3. ✅ Deploy from `bin\Release\` folder

### Recommendation
- **Build Debug frequently** during development
- **Build Release before deployment** or when you need to test production-like performance

---

## 🎯 For Your Current Situation

Since you're developing and testing:
- **Use DEBUG** for regular development
- **Build Debug** when you make changes (it's the default)
- **Build Release** only when you need the optimized version

### Quick Commands

**Build Debug (Most Common):**
```powershell
dotnet build
# or explicitly:
dotnet build --configuration Debug
```

**Build Release (For Deployment):**
```powershell
dotnet build --configuration Release
```

**Build Both:**
```powershell
dotnet build --configuration Debug
dotnet build --configuration Release
```

---

## 📝 Summary

- **DEBUG** = Development, debugging, testing → Updated frequently
- **RELEASE** = Production, deployment, optimized → Updated before deployment
- Each builds to its own folder independently
- Build the configuration you need when you need it

