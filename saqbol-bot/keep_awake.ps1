# SaqBol: пока это окно открыто, компьютер не уходит в сон (экран гаснуть может).
# Настройки питания Windows не меняются: закрыли окно - всё как было.
$host.UI.RawUI.WindowTitle = 'SaqBol keep-awake'
Add-Type -Name P -Namespace W -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
Write-Host 'SaqBol: пока это окно открыто, компьютер не уснёт.' -ForegroundColor Yellow
Write-Host 'Выключить всё - файл «Остановить SaqBol» на рабочем столе.'
while ($true) { [W.P]::SetThreadExecutionState([uint32]2147483649) | Out-Null  # 0x80000001: ES_CONTINUOUS + ES_SYSTEM_REQUIRED (как uint32, иначе PowerShell передаёт отрицательное число и Windows его не принимает); Start-Sleep -Seconds 60 }
