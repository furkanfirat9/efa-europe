Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\furka\.gemini\antigravity\brain\bb7f5119-0f1e-4c98-9762-0ad5df73ed74\.user_uploaded\media_1789772492302.png"
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

Write-Host "Original dimensions: $($src.Width)x$($src.Height)"

# Find bounds of logo
$minX = $src.Width
$maxX = 0
$minY = $src.Height
$maxY = 0

for ($y = 0; $y -lt $src.Height; $y += 1) {
    for ($x = 0; $x -lt $src.Width; $x += 1) {
        $c = $src.GetPixel($x, $y)
        # Check non-white pixels
        if ($c.A -gt 20 -and ($c.R -lt 240 -or $c.G -lt 240 -or $c.B -lt 240)) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

Write-Host "Logo Bounds: X: $minX to $maxX, Y: $minY to $maxY"
$logoW = $maxX - $minX + 1
$logoH = $maxY - $minY + 1
Write-Host "Logo Size: ${logoW}x${logoH}"

# We want a square output (e.g. 512x512 with transparent or clean background)
$size = 512
$target = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($target)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Clear with transparent
$g.Clear([System.Drawing.Color]::Transparent)

# Calculate fitting scale with a slight margin (e.g. 85% of total size so it doesn't touch the borders)
$padding = 40
$avail = $size - (2 * $padding)
$scale = [Math]::Min($avail / $logoW, $avail / $logoH)
$destW = [int]($logoW * $scale)
$destH = [int]($logoH * $scale)
$destX = [int](($size - $destW) / 2)
$destY = [int](($size - $destH) / 2)

$srcRect = New-Object System.Drawing.Rectangle $minX, $minY, $logoW, $logoH
$destRect = New-Object System.Drawing.Rectangle $destX, $destY, $destW, $destH

$g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$src.Dispose()

# Save as PNG
$outPng = "C:\Users\furka\urun_yukleme\src\app\icon.png"
$target.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved: $outPng"

# Save to public/icon.png as well
$publicPng = "C:\Users\furka\urun_yukleme\public\icon.png"
$target.Save($publicPng, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved: $publicPng"

# Create a 32x32 icon for favicon.ico
$icoSize = 32
$icoBmp = New-Object System.Drawing.Bitmap $target, (New-Object System.Drawing.Size $icoSize, $icoSize)
$icoBmp.Save("C:\Users\furka\urun_yukleme\public\favicon.ico", [System.Drawing.Imaging.ImageFormat]::Png)
$icoBmp.Save("C:\Users\furka\urun_yukleme\src\app\favicon.ico", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved favicons"

$target.Dispose()
$icoBmp.Dispose()
