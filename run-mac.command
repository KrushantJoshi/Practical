#!/bin/bash
cd "$(dirname "$0")"
echo "TapForge → http://localhost:8000  (press Ctrl+C to stop)"
( sleep 1; open "http://localhost:8000" ) &
python3 -m http.server 8000 || python -m http.server 8000
