# Create GitLab Release using API
# Usage: .\scripts\create-gitlab-release.ps1

param(
    [string]$GitLabToken = $env:GITLAB_TOKEN,
    [string]$Version = "1.0.0",
    [string]$ApkPath = "dist\release\bittasker-v1.0.0-universal.apk"
)

$ErrorActionPreference = "Stop"

# Configuration
$ProjectId = "bittasker%2Fzapstore"  # URL-encoded project path
$GitLabApiUrl = "https://gitlab.com/api/v4"
$TagName = "v$Version"

# Check if token is provided
if (-not $GitLabToken) {
    Write-Host "ERROR: GitLab token not provided" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please set GITLAB_TOKEN environment variable or pass it as parameter:" -ForegroundColor Yellow
    Write-Host "  `$env:GITLAB_TOKEN = 'your-token-here'" -ForegroundColor Cyan
    Write-Host "  .\scripts\create-gitlab-release.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Or create a token at: https://gitlab.com/-/user_settings/personal_access_tokens" -ForegroundColor Yellow
    Write-Host "Required scopes: api, read_api, write_repository" -ForegroundColor Yellow
    exit 1
}

# Check if APK exists
if (-not (Test-Path $ApkPath)) {
    Write-Host "ERROR: APK not found at $ApkPath" -ForegroundColor Red
    exit 1
}

$ApkSize = (Get-Item $ApkPath).Length / 1MB
$ApkSizeMB = [math]::Round($ApkSize, 2)

Write-Host "Creating GitLab Release..." -ForegroundColor Blue
Write-Host "  Project: bittasker/zapstore" -ForegroundColor Gray
Write-Host "  Tag: $TagName" -ForegroundColor Gray
Write-Host "  APK: $ApkPath ($ApkSizeMB MB)" -ForegroundColor Gray
Write-Host ""

# Release notes
$ReleaseNotes = @"
## BitTasker v$Version

### Download
- Universal APK (arm64-v8a + armeabi-v7a): $ApkSizeMB MB

### Installation
1. Download the APK
2. Enable "Install from unknown sources" in Android settings
3. Install the APK
4. Or install via Zapstore for automatic updates

### Verification
- Package: com.bittasker.app
- Version: $Version
- Signed with BitTasker release key

### Changes
See CHANGELOG.md for full details.
"@

# Step 1: Create the release
Write-Host "Step 1: Creating release..." -ForegroundColor Cyan

$releaseBody = @{
    tag_name = $TagName
    name = "BitTasker v$Version"
    description = $ReleaseNotes
} | ConvertTo-Json

$headers = @{
    "PRIVATE-TOKEN" = $GitLabToken
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "$GitLabApiUrl/projects/$ProjectId/releases" `
        -Method Post `
        -Headers $headers `
        -Body $releaseBody
    
    Write-Host "✓ Release created successfully" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "ERROR: Failed to create release" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Step 2: Upload the APK as a release asset
Write-Host "Step 2: Uploading APK..." -ForegroundColor Cyan

# First, upload the file to get a URL
$uploadHeaders = @{
    "PRIVATE-TOKEN" = $GitLabToken
}

$fileName = Split-Path $ApkPath -Leaf

try {
    # Upload file to project
    $uploadResponse = Invoke-RestMethod -Uri "$GitLabApiUrl/projects/$ProjectId/uploads" `
        -Method Post `
        -Headers $uploadHeaders `
        -Form @{
            file = Get-Item -Path $ApkPath
        }
    
    Write-Host "✓ APK uploaded successfully" -ForegroundColor Green
    
    # Get the uploaded file URL
    $fileUrl = $uploadResponse.url
    $fullUrl = "https://gitlab.com/bittasker/zapstore$fileUrl"
    
    Write-Host ""
    Write-Host "Step 3: Adding APK to release..." -ForegroundColor Cyan
    
    # Add the uploaded file as a release link
    $linkBody = @{
        name = $fileName
        url = $fullUrl
        link_type = "package"
    } | ConvertTo-Json
    
    $linkResponse = Invoke-RestMethod -Uri "$GitLabApiUrl/projects/$ProjectId/releases/$TagName/assets/links" `
        -Method Post `
        -Headers $headers `
        -Body $linkBody
    
    Write-Host "✓ APK added to release" -ForegroundColor Green
    
} catch {
    Write-Host "ERROR: Failed to upload APK" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "✅ GitLab Release Created Successfully!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Release Details:" -ForegroundColor Blue
Write-Host "  Version: $Version" -ForegroundColor Gray
Write-Host "  Tag: $TagName" -ForegroundColor Gray
Write-Host "  APK: $fileName ($ApkSizeMB MB)" -ForegroundColor Gray
Write-Host "  URL: https://gitlab.com/bittasker/zapstore/-/releases/$TagName" -ForegroundColor Cyan
Write-Host ""
Write-Host "🎉 Next step: Publish to Zapstore!" -ForegroundColor Blue
Write-Host "  Run: cd E:\projects\upw\zapstore && zapstore publish" -ForegroundColor Cyan

