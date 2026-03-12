$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcut = $ws.CreateShortcut("$desktop\Claude Bridge.lnk")
$shortcut.TargetPath = "C:\Users\drcra\Documents\Coding Projects\WhatsApp-Claude-Code-Live-Bridge\launch-dashboard.vbs"
$shortcut.WorkingDirectory = "C:\Users\drcra\Documents\Coding Projects\WhatsApp-Claude-Code-Live-Bridge"
$shortcut.Description = "Launch Claude Bridge Dashboard"
$shortcut.Save()
Write-Host "Desktop shortcut created!"
