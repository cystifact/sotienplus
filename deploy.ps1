# Quick deploy script
param(
    [switch]$SkipBuild
)

Write-Host "Starting quick deploy..." -ForegroundColor Green

if (-not $SkipBuild) {
    Write-Host "Building..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed!" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy sotienplus `
    --source . `
    --region asia-southeast1 `
    --allow-unauthenticated `
    --project sotienplus `
    --quiet

if ($LASTEXITCODE -ne 0) {
    Write-Host "Cloud Run deploy failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Cloud Run deployed!" -ForegroundColor Green

Write-Host "Deploying Firebase Hosting..." -ForegroundColor Yellow
firebase deploy --only hosting --project sotienplus

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deploy successful!" -ForegroundColor Green
    Write-Host "URL: https://sotienplus.web.app" -ForegroundColor Cyan
} else {
    Write-Host "Hosting deploy failed! App is still live on Cloud Run." -ForegroundColor Yellow
}
