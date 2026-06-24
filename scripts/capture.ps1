Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool repaint);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$script:target = [IntPtr]::Zero
$script:best = 0
$script:title = ''
$cb = {
  param($h, $p)
  if ([Win]::IsWindowVisible($h)) {
    $sb = New-Object System.Text.StringBuilder 512
    [Win]::GetWindowText($h, $sb, 512) | Out-Null
    $t = $sb.ToString()
    if (($t -like '*React Video Editor*' -or $t -like '*localhost:5173*') -and $t -like '*Chrome*') {
      $rr = New-Object Win+RECT
      [Win]::GetWindowRect($h, [ref]$rr) | Out-Null
      $area = ($rr.Right - $rr.Left) * ($rr.Bottom - $rr.Top)
      if ($area -gt $script:best) { $script:best = $area; $script:target = $h; $script:title = $t }
    }
  }
  return $true
}
[Win]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($script:target -eq [IntPtr]::Zero) { Write-Output 'CHROME WINDOW NOT FOUND'; exit 1 }

[Win]::ShowWindow($script:target, 9) | Out-Null
[Win]::MoveWindow($script:target, 30, 30, 1720, 1000, $true) | Out-Null
Start-Sleep -Milliseconds 600
# Force the window to the foreground past Windows' focus lock.
$wsh = New-Object -ComObject WScript.Shell
$wsh.AppActivate($script:title) | Out-Null
Start-Sleep -Milliseconds 2200

$r = New-Object Win+RECT
[Win]::GetWindowRect($script:target, [ref]$r) | Out-Null
$w = $r.Right - $r.Left
$h = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$bmp.Save('D:\video-editor\docs\screenshot.png', [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "SAVED $w x $h  ($script:title)"
