# Run in PowerShell (normal user is usually enough): closes listeners on 127.0.0.1:8000
# Usage:  powershell -ExecutionPolicy Bypass -File .\scripts\kill-port-8000.ps1

$ErrorActionPreference = "Continue"
$port = 8000

Write-Host "Finding TCP listeners on port $port ..."
$pids = @(
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.OwningProcess -gt 0 } |
        Select-Object -ExpandProperty OwningProcess -Unique
)

foreach ($procId in $pids) {
    Write-Host "Stopping LISTEN pid $procId"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    & taskkill.exe /F /PID $procId 2>$null
}

Write-Host "Stopping python.exe processes running uvicorn on port $port ..."
Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | ForEach-Object {
    if ($_.CommandLine -match 'uvicorn' -and $_.CommandLine -match "--port\s+$port") {
        Write-Host "Stopping uvicorn pid $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        & taskkill.exe /F /PID $_.ProcessId 2>$null
    }
    elseif ($_.CommandLine -match 'uvicorn' -and $_.CommandLine -match ':8000') {
        Write-Host "Stopping uvicorn pid $($_.ProcessId) (8000 in args)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        & taskkill.exe /F /PID $_.ProcessId 2>$null
    }
}

Start-Sleep -Seconds 2

Write-Host "`nRemaining entries mentioning :8000 (should have no LISTENING soon):"
cmd /c "netstat -ano | findstr `:8000"

try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2 -UseBasicParsing
    Write-Host "`nWARNING: Something still responded on $port (HTTP $($r.StatusCode))"
}
catch {
    Write-Host "`nPort $port appears free (no HTTP health response)."
}
