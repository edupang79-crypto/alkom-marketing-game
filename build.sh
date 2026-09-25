#!/bin/sh
# src/ 를 한 파일로 묶는다.
#  index.html         — GitHub Pages 등에서 바로 여는 완성본 (서체는 fonts/ 파일을 읽음)
#  dist/artifact.html — 아티팩트용 본문 (서체를 파일 안에 넣음)
set -e
cd "$(dirname "$0")"
mkdir -p dist
FONT=fonts/PretendardVariable.subset.woff2
body() {
  python3 -c 'import sys;p=sys.argv[1];s=open("src/shell.html").read();src=("data:font/woff2;base64,"+__import__("base64").b64encode(open(p,"rb").read()).decode()) if sys.argv[2]=="inline" else p;sys.stdout.write(s.replace("__PRETENDARD_SRC__",src))' "$FONT" "$1"
  printf '<script>\n'; cat src/cases.js src/data.js src/examples.js; printf '\n</script>\n<script>\n'; cat src/app.js; printf '\n</script>\n'
}
body inline > dist/artifact.html
{
  printf '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<link rel="preload" href="%s" as="font" type="font/woff2" crossorigin>\n</head>\n<body>\n' "$FONT"
  body file
  printf '</body>\n</html>\n'
} > index.html
echo "built index.html ($(wc -c < index.html) bytes), dist/artifact.html ($(wc -c < dist/artifact.html) bytes)"
