#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1

if command -v python3 >/dev/null 2>&1; then
    python3 "$DIR/serve.py"
elif command -v python >/dev/null 2>&1; then
    python "$DIR/serve.py"
else
    echo ""
    echo "Python 3 was not found."
    echo "Please install Python 3, then run this file again."
    echo ""
    read -r -p "Press Enter to close..."
fi
