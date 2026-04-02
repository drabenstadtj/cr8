#!/bin/sh
FILE=$(echo "$SLSKD_SCRIPT_DATA" | grep -o '"localFilename":"[^"]*"' | cut -d'"' -f4)
DIR=$(dirname "$FILE")
NAME=$(basename "$DIR")
wget -q -O/dev/null \
  --post-data "path=/downloads&name=$NAME" \
  --header "X-API-Key: dfe127c81fab58fe3aaa948de167bedd" \
  http://betanin:9393/api/torrents
