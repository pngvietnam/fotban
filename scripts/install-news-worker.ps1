<#
  Registers (or removes) a Windows scheduled task that keeps the news worker running.
  It is NOT a fixed-time schedule: the task starts the worker at logon and restarts it if it stops;
  the worker itself decides, source by source, when fresh news is due.

  Install:   powershell -ExecutionPolicy Bypass -File scripts\install-news-worker.ps1
  Remove:    powershell -ExecutionPolicy Bypass -File scripts\install-news-worker.ps1 -Remove
  Status:    Get-ScheduledTask -TaskName "FotBan News Worker" | Get-ScheduledTaskInfo
  Logs:      logs\news-worker.log (ignored by git)
#>
param([switch]$Remove)
$taskName = "FotBan News Worker"
$root = Split-Path -Parent $PSScriptRoot
if ($Remove) {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Output "Removed '$taskName'."
  } else { Write-Output "'$taskName' is not installed." }
  return
}
New-Item -ItemType Directory -Force -Path (Join-Path $root "logs") | Out-Null
$command = "cd /d `"$root`" && npm.cmd run news:worker >> logs\news-worker.log 2>&1"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c $command" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Output "Installed '$taskName' (starts at logon, restarts on failure). Start now with: Start-ScheduledTask -TaskName '$taskName'"
