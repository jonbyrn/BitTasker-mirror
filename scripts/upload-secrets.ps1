# Upload build-time environment variables to Cloudflare Workers
# PowerShell version for Windows
#
# Usage:
#   pwsh -File scripts/upload-secrets.ps1 staging
#   pwsh -File scripts/upload-secrets.ps1 production

param(
    [Parameter(Position=0)]
    [ValidateSet('staging', 'production')]
    [string]$Environment = 'staging'
)

Write-Host "🚀 Uploading build-time environment variables for: $Environment" -ForegroundColor Cyan
Write-Host ""

# Complete list of environment variables
$Variables = @(
    "VITE_API_URL",
    "PUBLIC_GRAPHQL_ENDPOINT",
    "PUBLIC_GOOGLE_CLIENT_ID",
    "PUBLIC_GOOGLE_IOS_CLIENT_ID",
    "PUBLIC_GOOGLE_REDIRECT_URI",
    "VITE_GOOGLE_MAPS_API_KEY",
    "VITE_GOOGLE_MAPS_ID",
    "VITE_X_CLIENT_ID",
    "VITE_X_CLIENT_SECRET",
    "VITE_X_REDIRECT_URI",
    "VITE_FACEBOOK_APP_ID",
    "VITE_FACEBOOK_REDIRECT_URI",
    "VITE_CLOUDFLARE_SITEKEY",
    "VITE_FIREBASE_WEB_API_KEY",
    "VITE_FIREBASE_WEB_AUTH_DOMAIN",
    "VITE_FIREBASE_WEB_PROJECT_ID",
    "VITE_FIREBASE_WEB_STORAGE_BUCKET",
    "VITE_FIREBASE_WEB_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_WEB_APP_ID",
    "VITE_FIREBASE_VAPID_KEY",
    "VITE_BREEZ_API_KEY",
    "VITE_RSK_CONTRACT_ADDRESS",
    "VITE_BSCSCAN_API_KEY"
)

# Load .env file
$EnvFile = ".env"

if (-not (Test-Path $EnvFile)) {
    Write-Host "❌ .env file not found!" -ForegroundColor Red
    exit 1
}

Write-Host "📄 Loading variables from: $EnvFile" -ForegroundColor Yellow
Write-Host "⚠️  Make sure .env contains $Environment values!" -ForegroundColor Yellow
Write-Host ""

# Parse .env file
$EnvVars = @{}
Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    # Skip comments and empty lines
    if ($line -match '^#' -or $line -eq '') {
        return
    }
    # Parse key=value
    if ($line -match '^([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        # Remove quotes if present
        $value = $value -replace '^"(.*)"$', '$1'
        $value = $value -replace "^'(.*)'$", '$1'
        $EnvVars[$key] = $value
    }
}

# Upload each variable
$SuccessCount = 0
$FailCount = 0
$SkipCount = 0

foreach ($Var in $Variables) {
    $Value = $EnvVars[$Var]
    
    if ([string]::IsNullOrWhiteSpace($Value)) {
        Write-Host "⚠️  Skipping $Var (empty or not defined)" -ForegroundColor Yellow
        $SkipCount++
        continue
    }
    
    Write-Host "⬆️  Uploading $Var..." -ForegroundColor Cyan
    
    try {
        # For staging (default), use --env="" to explicitly target default environment
        # For production, use --env production
        if ($Environment -eq 'staging') {
            $Value | npx wrangler secret put $Var --env=""""
        } else {
            $Value | npx wrangler secret put $Var --env production
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ $Var uploaded successfully" -ForegroundColor Green
            $SuccessCount++
        } else {
            Write-Host "❌ Failed to upload $Var" -ForegroundColor Red
            $FailCount++
        }
    } catch {
        Write-Host "❌ Failed to upload $Var : $_" -ForegroundColor Red
        $FailCount++
    }
    
    Write-Host ""
}

Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📊 Upload Summary for $Environment" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Success: $SuccessCount" -ForegroundColor Green
Write-Host "❌ Failed:  $FailCount" -ForegroundColor Red
Write-Host "⚠️  Skipped: $SkipCount" -ForegroundColor Yellow
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan

if ($FailCount -gt 0) {
    Write-Host ""
    Write-Host "❌ Some uploads failed. Please check the errors above." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✨ All variables uploaded successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Next steps:" -ForegroundColor Yellow
Write-Host "   1. Verify variables in Cloudflare Dashboard:" -ForegroundColor White
Write-Host "      Workers & Pages > $Environment worker > Settings > Variables and Secrets" -ForegroundColor Gray
Write-Host "   2. Deploy your worker:" -ForegroundColor White
if ($Environment -eq 'staging') {
    Write-Host "      npm run deploy:workers" -ForegroundColor Gray
} else {
    Write-Host "      npm run deploy:workers:production" -ForegroundColor Gray
}

