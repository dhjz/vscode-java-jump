npm run compile
if (!(Test-Path dist)) {
    New-Item -ItemType Directory -Path dist | Out-Null
}
# 使用 printf 生成 y 输入，通过 cmd 重定向给 vsce
$inputFile = "$env:TEMP\vsce_input.txt"
Set-Content -Path $inputFile -Value "y" -NoNewline
cmd /c "npx vsce package --allow-missing-repository -o dist/ < $inputFile"
Remove-Item $inputFile -ErrorAction SilentlyContinue
