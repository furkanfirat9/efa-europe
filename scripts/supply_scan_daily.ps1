# Windows Görev Zamanlayıcı her sabah 07:00'de bunu çalıştırır (görev: "EFA tedarik taraması").
# Her gün Amazon.de + amazon.pl; pazartesileri ayrıca Ceneo (IPRoyal trafiği ücretli, ~80 MB / tarama).
# Her gün tek bir log dosyası: data\supply-scans\daily_YYYY-MM-DD.log
# Sonuçlar SupplyScanRun tablosunda; /fiyat-onerisi ve 17:00 hatırlatması oradan okur.

$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..')
$dir = 'data\supply-scans'
New-Item -ItemType Directory -Force $dir | Out-Null
$log = Join-Path $dir ('daily_{0:yyyy-MM-dd}.log' -f (Get-Date))
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }

$channels = 'amazon-de,amazon-pl'
if ((Get-Date).DayOfWeek -eq 'Monday') { $channels += ',ceneo' }

"=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $channels ===" | Out-File $log -Append -Encoding utf8
& $node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts\supply_scan.mjs --channel $channels *>&1 | Out-File $log -Append -Encoding utf8
"=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') bitti (çıkış kodu $LASTEXITCODE) ===" | Out-File $log -Append -Encoding utf8
