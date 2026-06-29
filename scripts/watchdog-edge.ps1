# midcine Edge watchdog — runs forever, checks every 60s, restarts on failure
# Run hidden: Start-Process -WindowStyle Hidden powershell -ArgumentList '-ExecutionPolicy','Bypass','-File','D:\project\midcine\scripts\watchdog-edge.ps1'
$ErrorActionPreference = 'Continue'

$root        = 'D:\project\midcine'
$logDir      = Join-Path $root 'logs'
$logFile     = Join-Path $logDir 'watchdog-edge.log'
$composeFile = Join-Path $root 'infra\docker\edge-bundle.yml'

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-Log {
    param([string]$Level, [string]$Message)
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] [$Level] $Message"
    Add-Content -Path $logFile -Value $line
    Write-Host $line
}

function Test-OrthancHealth {
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:8042/system' -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return $r.StatusCode -lt 500
    } catch {
        return $false
    }
}

function Test-DicomPort {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect('localhost', 11113, $null, $null)
        $ok  = $iar.AsyncWaitHandle.WaitOne(3000)
        if ($ok) { $tcp.EndConnect($iar) | Out-Null }
        $tcp.Close()
        return $ok
    } catch {
        return $false
    }
}

function Test-ContainerRunning {
    param([string]$Name)
    $out = docker ps --filter "name=$Name" --format '{{.Names}}' 2>$null
    return ($out -split "`n") -contains $Name
}

function Restart-Service {
    param([string]$Service)
    Write-Log 'WARN' "Restarting service: $Service"
    docker compose -f $composeFile --project-directory $root restart $Service 2>&1 | Out-Null
}

Write-Log 'INFO' 'midcine edge watchdog started'

while ($true) {
    try {
        # Check 1: Orthanc HTTP
        if (-not (Test-OrthancHealth)) {
            Write-Log 'ERROR' 'Orthanc /system check failed'
            Restart-Service 'orthanc'
        }

        # Check 2: DICOM port
        if (-not (Test-DicomPort)) {
            Write-Log 'ERROR' 'DICOM port 11113 not reachable'
            Restart-Service 'dicom-receiver'
        }

        # Check 3: Postgres container
        if (-not (Test-ContainerRunning 'midcine-edge-postgres')) {
            Write-Log 'ERROR' 'Postgres container not running'
            Restart-Service 'postgres'
        }

        # Check 4: Redis container
        if (-not (Test-ContainerRunning 'midcine-edge-redis')) {
            Write-Log 'ERROR' 'Redis container not running'
            Restart-Service 'redis'
        }
    } catch {
        Write-Log 'EXCEPTION' $_.Exception.Message
    }

    Start-Sleep -Seconds 60
}
