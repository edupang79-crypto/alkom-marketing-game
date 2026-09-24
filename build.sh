#!/bin/sh
# src/ 를 한 파일로 묶는다. index.html = GitHub Pages 등에서 바로 여는 완성본, dist/artifact.html = 아티팩트용 본문
set -e
cd "$(dirname "$0")"
mkdir -p dist
{
  cat src/shell.html
  printf '<script>\n'; cat src/data.js; printf '\n</script>\n<script>\n'; cat src/app.js; printf '\n</script>\n'
} > dist/artifact.html
{
  printf '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n'
  cat dist/artifact.html
  printf '</body>\n</html>\n'
} > index.html
echo "built index.html ($(wc -c < index.html) bytes)"
