$c = [IO.File]::ReadAllText("vite.config.ts")
$old = "}`t}`r`n`timport pkg"
$new = "}`r`n}`r`nimport pkg"
$c = $c.Replace($old, $new)
[IO.File]::WriteAllText("vite.config.ts", $c)
Write-Host "Done"