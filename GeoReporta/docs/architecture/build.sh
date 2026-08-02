#!/bin/bash
set -e
cd "$(dirname "$0")/../.."
dot -Tsvg docs/architecture/system.dot -o docs/architecture/system.svg
echo "Generated docs/architecture/system.svg"
