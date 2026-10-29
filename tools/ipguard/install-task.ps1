# 注册 jingyu-ipguard 计划任务：登录时 + 每 5 分钟，无窗口运行
$ErrorActionPreference = 'Stop'
$Dir  = 'C:\Users\Administrator\Tools\jingyu-ipguard'
$Vbs  = Join-Path $Dir 'ipguard.vbs'
$Name = 'Jingyu-IpGuard'

if (-not (Test-Path $Vbs)) { throw "缺少 $Vbs" }

$action   = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B //Nologo "{0}"' -f $Vbs)
$tLogon   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$tTimer   = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName $Name -Action $action -Trigger @($tLogon, $tTimer) -Settings $settings -Description '出口 IP 变化时自动同步鲸域服务器 fail2ban 白名单（jingyu-ipguard）' -Force | Out-Null
Write-Host "已注册计划任务 $Name"
Get-ScheduledTask -TaskName $Name | Select-Object TaskName, State | Format-Table -AutoSize

Start-ScheduledTask -TaskName $Name
Start-Sleep -Seconds 8
Get-ScheduledTaskInfo -TaskName $Name | Select-Object LastRunTime, LastTaskResult | Format-List
