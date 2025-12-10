# Development startup script - starts all services needed for admin dashboard to see nodes

Write-Host "Stopping any existing node processes..." -ForegroundColor Yellow
taskkill /F /IM node.exe 2>$null

Start-Sleep -Seconds 2

Write-Host "`n[1/3] Starting Storage Controller on port 6000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$PSScriptRoot'; node main.js --controller`""

Start-Sleep -Seconds 3

Write-Host "`n[2/3] Starting Auth Server on port 4000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$PSScriptRoot'; node auth/auth.js`""

Start-Sleep -Seconds 3

Write-Host "`n[3/3] Starting Admin Dashboard on port 4001..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$PSScriptRoot'; node main.js --admin`""

Start-Sleep -Seconds 2

Write-Host "`n✅ All services started!" -ForegroundColor Green
Write-Host "`nAccess points:" -ForegroundColor Cyan
Write-Host "  • Auth Server: http://localhost:4000/login" -ForegroundColor Yellow
Write-Host "  • Admin Dashboard: http://localhost:4001" -ForegroundColor Yellow
Write-Host "`nDefault Admin Credentials:" -ForegroundColor Cyan
Write-Host "  • Email: admin@gmail.com" -ForegroundColor Yellow
Write-Host "  • Password: admin123" -ForegroundColor Yellow
Write-Host "`nAPI Endpoints:" -ForegroundColor Cyan
Write-Host "  • Controller API: http://localhost:6000/api/nodes" -ForegroundColor Yellow
Write-Host "  • Auth API: http://localhost:4000/api/user (after login)" -ForegroundColor Yellow
