# PowerShell script to create .env file for wms-api
# Run this script: .\create-env.ps1

$envContent = @"
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=wms_desktop

# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-secret-key-change-this-in-production
JWT_EXPIRES_IN=7d
"@

$envContent | Out-File -FilePath ".env" -Encoding utf8 -NoNewline

Write-Host ".env file created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: Please update DB_PASSWORD if your MySQL root password is different from 'root'" -ForegroundColor Yellow
Write-Host "Edit the .env file and change DB_PASSWORD to your actual MySQL password" -ForegroundColor Yellow

