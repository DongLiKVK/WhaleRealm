' jingyu-ipguard silent launcher (called by scheduled task, keeps console window hidden)
Dim sh, cmd
Set sh = CreateObject("WScript.Shell")
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\Administrator\Tools\jingyu-ipguard\ipguard.ps1"""
sh.Run cmd, 0, False
