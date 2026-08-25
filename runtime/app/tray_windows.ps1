# tray_windows.ps1 - Conxa Runner system tray (PROD-5).
# Spawned BY the scheduler daemon (runtime/app/scheduler_daemon.js); one native
# NotifyIcon, zero npm dependencies, nothing extra shipped beyond this script.
#
# Protocol (file-based, same as scheduler_cli.js):
#   reads   <baseDir>\state.json   - daemon status + schedule summaries (refreshed ~30s)
#   reads   <baseDir>\daemon.lock  - existence/staleness decides when the tray exits
#   writes  <baseDir>\commands\*.cmd - {"type":"pause"|"resume"|"quit"|"run_now",...}
#
# The tray is a VIEW ONLY: every action becomes a command file the daemon consumes,
# so there is exactly one writer of scheduler truth at all times.

param(
    [Parameter(Mandatory = $true)]
    [string]$BaseDir
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$StateFile    = Join-Path $BaseDir "state.json"
$LockFile     = Join-Path $BaseDir "daemon.lock"
$CommandsDir  = Join-Path $BaseDir "commands"
$LogsDir      = Join-Path $BaseDir "logs"
$SchedulesDir = Join-Path $BaseDir "schedules"

function Send-Cmd {
    param([string]$Type, [string]$ScheduleId)
    try {
        New-Item -ItemType Directory -Force -Path $CommandsDir | Out-Null
        $obj = @{ type = $Type }
        if ($ScheduleId) { $obj.schedule_id = $ScheduleId }
        $name = "{0}-{1}.cmd" -f ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()), (Get-Random -Maximum 999999)
        [System.IO.File]::WriteAllText((Join-Path $CommandsDir $name), ($obj | ConvertTo-Json -Compress))
    } catch {}
}

function Read-State {
    try {
        return ConvertFrom-Json ([System.IO.File]::ReadAllText($StateFile))
    } catch { return $null }
}

function Test-DaemonAlive {
    # Alive = lock exists AND (fresh heartbeat OR pid still running). Mirrors the
    # daemon's own single-instance rule so both sides agree on "stopped".
    try {
        if (-not (Test-Path $LockFile)) { return $false }
        $rec = ConvertFrom-Json ([System.IO.File]::ReadAllText($LockFile))
        $ageMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -
                 [DateTimeOffset]::Parse($rec.heartbeat_at).ToUnixTimeMilliseconds()
        if ($ageMs -lt 20000) { return $true }
        $proc = Get-Process -Id $rec.pid -ErrorAction SilentlyContinue
        return ($proc -ne $null)
    } catch { return $false }
}

function New-TrayIcon {
    # Simple branded glyph drawn in code - no .ico asset to ship.
    $bmp = New-Object System.Drawing.Bitmap 16, 16
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 37, 99, 235))
    $g.FillEllipse($brush, 0, 0, 15, 15)
    $font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $white = [System.Drawing.Brushes]::White
    $g.DrawString("C", $font, $white, 2, 1)
    $g.Dispose()
    $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
    $bmp.Dispose()
    return $icon
}

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = New-TrayIcon
$notifyIcon.Text = "Conxa Runner"
$notifyIcon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

function Update-Menu {
    $menu.Items.Clear()
    $st = Read-State

    $statusText = "Conxa Runner: starting…"
    if ($st -ne $null) {
        if ($st.paused) { $statusText = "Conxa Runner: PAUSED" }
        else            { $statusText = "Conxa Runner: running" }
    }
    $statusItem = New-Object System.Windows.Forms.ToolStripMenuItem ($statusText)
    $statusItem.Enabled = $false
    [void]$menu.Items.Add($statusItem)

    if ($st -ne $null -and $st.schedules) {
        foreach ($s in @($st.schedules | Select-Object -First 8)) {
            if (-not $s.enabled) { continue }
            $nextLabel = "?"
            if ($s.next_run_at) {
                try { $nextLabel = ([datetime]$s.next_run_at).ToString("ddd HH:mm") } catch { $nextLabel = "?" }
            }
            $label = "Run now: {0}   ({1})" -f $s.name, $nextLabel
            $item = New-Object System.Windows.Forms.ToolStripMenuItem ($label)
            $sid = [string]$s.id
            $item.Add_Click({ Send-Cmd "run_now" $sid }.GetNewClosure())
            [void]$menu.Items.Add($item)
        }
        [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
    }

    if ($st -ne $null -and $st.paused) {
        $toggle = New-Object System.Windows.Forms.ToolStripMenuItem ("Resume scheduling")
        $toggle.Add_Click({ Send-Cmd "resume" })
    } else {
        $toggle = New-Object System.Windows.Forms.ToolStripMenuItem ("Pause scheduling")
        $toggle.Add_Click({ Send-Cmd "pause" })
    }
    [void]$menu.Items.Add($toggle)

    $openLogs = New-Object System.Windows.Forms.ToolStripMenuItem ("Open logs folder")
    $openLogs.Add_Click({ Start-Process explorer.exe -ArgumentList ('"' + $LogsDir + '"') })
    [void]$menu.Items.Add($openLogs)

    $openSched = New-Object System.Windows.Forms.ToolStripMenuItem ("Open schedules folder")
    $openSched.Add_Click({ Start-Process explorer.exe -ArgumentList ('"' + $SchedulesDir + '"') })
    [void]$menu.Items.Add($openSched)

    [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

    $quit = New-Object System.Windows.Forms.ToolStripMenuItem ("Quit Conxa Runner")
    $quit.Add_Click({ Send-Cmd "quit" })
    [void]$menu.Items.Add($quit)
}

Update-Menu
$menu.Add_Opening({ Update-Menu })
$notifyIcon.ContextMenuStrip = $menu
$notifyIcon.Add_DoubleClick({ Start-Process explorer.exe -ArgumentList ('"' + $LogsDir + '"') })

# Exit when the daemon goes away - the tray must never outlive its owner.
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.Add_Tick({
    if (-not (Test-DaemonAlive)) {
        $timer.Stop()
        $notifyIcon.Visible = $false
        $notifyIcon.Dispose()
        [System.Windows.Forms.Application]::Exit()
    }
})
$timer.Start()

$context = New-Object System.Windows.Forms.ApplicationContext
[System.Windows.Forms.Application]::Run($context)
