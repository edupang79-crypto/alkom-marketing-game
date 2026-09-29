#!/bin/sh
# 웹사이트판(GitHub Pages)을 최신으로 올린다 — gh-pages 브랜치에 index.html · fonts · firebase-config.js만 담는다.
set -e
cd "$(dirname "$0")"
./build.sh
W=$(mktemp -d)
git fetch -q origin gh-pages
git worktree add -q "$W" origin/gh-pages --detach
cp index.html firebase-config.js .nojekyll "$W"/
rm -rf "$W/fonts" && cp -r fonts "$W"/
cd "$W"
git add -A
if git diff --cached --quiet; then echo "바뀐 것 없음"; else
  git commit -q -m "웹사이트판 갱신"
  git push -q origin HEAD:gh-pages
  echo "gh-pages 갱신 완료"
fi
cd - >/dev/null
git worktree remove --force "$W"
