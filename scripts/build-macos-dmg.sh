#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must be run on macOS to create a .app/.dmg installer."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js first."
  exit 1
fi

if ! command -v rustup >/dev/null 2>&1; then
  echo "rustup is required. Install Rust first: https://rustup.rs"
  exit 1
fi

rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm install
npm run build:mac

echo
echo "macOS app bundle:"
echo "  src-tauri/target/universal-apple-darwin/release/bundle/macos/Desktop Pet.app"
echo
echo "macOS DMG installer:"
echo "  src-tauri/target/universal-apple-darwin/release/bundle/dmg/"
