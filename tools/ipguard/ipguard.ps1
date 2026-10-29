# ============================================================================
# jingyu-ipguard 客户端（Windows）
#   作用：定时通过 SSH 让服务器把「本次连接的来源 IP」写进 fail2ban 白名单。
#         来源 IP 由服务器亲眼看到（$SSH_CLIENT），不依赖任何公网 IP 探测接口，
#         也不会被本机 Windows 代理（WinINET ProxyEnable）误导。
#   触发：计划任务 Jingyu-IpGuard（登录时 + 每 5 分钟，静默无窗口）
#   日志：%LOCALAPPDATA%\jingyu-ipguard\ipguard.log
# 手工用法：
#   powershell -File ipguard.ps1 -Check    只看状态（服务器认为你从哪来、是否免封）
#   powershell -File ipguard.ps1 -Force    立即同步一次并打印服务器输出
#   powershell -File ipguard.ps1           常规静默同步（计划任务用）
# ============================================================================
[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$Check
)

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root      = Join-Path $env:LOCALAPPDATA 'jingyu-ipguard'
$LogFile   = Join-Path $Root 'ipguard.log'
$StatusFile= Join-Path $Root 'last-status.txt'
$FailFile  = Join-Path $Root 'fail-count.txt'
$AlertFile = Join-Path $Root 'ALERT.txt'

$SshKey    = 'C:\Users\Administrator\.ssh\jingyu_ssh_ed25519'
$SshTarget = 'ubuntu@43.142.153.74'
$SshExe    = 'C:\WINDOWS\System32\OpenSSH\ssh.exe'
if (-not (Test-Path $SshExe)) { $SshExe = 'ssh.exe' }
$RemoteBin = '/usr/local/sbin/jingyu-ipguard'
$SelfSync  = '/usr/local/sbin/jingyu-ipguard-selfsync'
$SiteUrl   = 'https://seekbbs.cn/'
$MaxLogLines = 400
$AlertAfterFailures = 3

New-Item -ItemType Directory -Force -Path $Root | Out-Null

function Write-Log {
    param([string]$Message)
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    if (Test-Path $LogFile) {
        $all = @(Get-Content -Path $LogFile -Encoding UTF8)
        if ($all.Count -gt $MaxLogLines) {
            $all[-$MaxLogLines..-1] | Set-Content -Path $LogFile -Encoding UTF8
        }
    }
}

function Get-DirectIp {
    # 绕过本机 Windows 代理，取真正的直连出口 IP（仅用于告警提示，同步逻辑不依赖它）
    $wc = New-Object System.Net.WebClient
    $wc.Proxy = $null
    foreach ($u in @('https://api.ipify.org', 'https://ipv4.icanhazip.com')) {
        try {
            $ip = $wc.DownloadString($u).Trim()
            if ($ip -match '^(\d{1,3}\.){3}\d{1,3}$') { return $ip }
        } catch { }
    }
    return $null
}

function Get-SiteStatus {
    try {
        $resp = Invoke-WebRequest -Uri $SiteUrl -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 3
        return [int]$resp.StatusCode
    } catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return 0
    }
}

function Invoke-Remote {
    param([string]$RemoteCommand)
    $raw = & $SshExe -i $SshKey -o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR $SshTarget $RemoteCommand 2>&1
    $code = $LASTEXITCODE
    $text = ($raw | Out-String).Trim()
    return [pscustomobject]@{ Code = $code; Text = $text }
}

if ($Check) {
    $r = Invoke-Remote "sudo -n $RemoteBin show"
    Write-Host "== 服务器视角 =="
    if ($r.Code -eq 0) { $r.Text -split "\r?\n" | Select-Object -First 14 | ForEach-Object { Write-Host "  $_" } }
    else { Write-Host "  SSH 调用失败（退出码 $($r.Code)）：$($r.Text)" }
    Write-Host "== 客户端 =="
    Write-Host ("  本机直连出口 IP (绕过代理): " + (Get-DirectIp))
    Write-Host ("  站点状态: " + (Get-SiteStatus))
    if (Test-Path $StatusFile) { Write-Host ("  上次结果: " + ((Get-Content $StatusFile -Raw -Encoding UTF8).Trim())) }
    if (Test-Path $LogFile) {
        Write-Host "  最近日志:"
        @(Get-Content -Path $LogFile -Encoding UTF8 -Tail 8) | ForEach-Object { Write-Host "    $_" }
    }
    if (Test-Path $AlertFile) { Write-Host "  存在未处理告警：$AlertFile" }
    exit 0
}

$remoteArgs = if ($Force) { $SelfSync } else { "$SelfSync --quiet" }
$r = Invoke-Remote $remoteArgs

if ($r.Code -eq 0) {
    $statusLine = ($r.Text -split "\r?\n" | Where-Object { $_ -like 'IPGUARD_STATUS=*' } | Select-Object -First 1)
    Set-Content -Path $StatusFile -Value ("{0} | {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $statusLine) -Encoding UTF8
    Set-Content -Path $FailFile -Value '0' -Encoding ASCII
    if (Test-Path $AlertFile) { Remove-Item $AlertFile -Force -ErrorAction SilentlyContinue }

    if ($statusLine -like '*=added*') {
        Write-Log "OK   出口 IP 已变化，白名单已更新：$statusLine"
        foreach ($l in ($r.Text -split "\r?\n")) {
            if ($l.Trim() -and $l -notlike 'IPGUARD_STATUS=*') { Write-Log "     | $($l.Trim())" }
        }
        Write-Log ("INFO 站点自检 https 状态码 = " + (Get-SiteStatus))
    } elseif ($Force) {
        Write-Log "INFO 手动同步：$statusLine"
    }
    if ($Force) { Write-Host $r.Text }
    exit 0
}

$fails = 0
if (Test-Path $FailFile) { $fails = [int]((Get-Content -Path $FailFile -Raw -Encoding UTF8).Trim()) }
$fails = $fails + 1
Set-Content -Path $FailFile -Value "$fails" -Encoding ASCII
Write-Log "ERROR 同步失败（第 $fails 次，ssh 退出码 $($r.Code)）：$($r.Text)"

if ($fails -ge $AlertAfterFailures) {
    $directIp = Get-DirectIp
    $alertLines = @(
        "jingyu-ipguard 连续 $fails 次无法把出口 IP 同步到服务器。",
        "",
        "本机直连出口 IP : $directIp",
        "服务器           : $SshTarget",
        "最后错误         : $($r.Text)",
        "",
        "可能原因与处置：",
        "1) 云防火墙（安全组）把 22 端口限制在旧 IP —— 到腾讯云控制台 -> 轻量应用服务器 -> 防火墙，",
        "   把 22 号端口的来源临时改成 $directIp（或暂时改为任意 IPv4）。",
        "   配好 /etc/jingyu-ipguard/tc.json 后，服务器端也能自动改这条规则。",
        "2) SSH 密钥缺失或被改动 —— 确认 $SshKey 存在。",
        "3) 服务器宕机或网络中断 —— 手工 ssh 试一次。",
        "",
        "时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    )
    Set-Content -Path $AlertFile -Value $alertLines -Encoding UTF8
    Write-Log "ALERT 已连续失败 $fails 次，写出 $AlertFile"
}
exit 1
