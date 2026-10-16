#!/usr/bin/env bash
# Stores the Developer ID certificate and an App Store Connect API key as GitHub Actions secrets,
# so the release workflow signs and notarizes Lacuna and macOS opens it without asking.
#
# Before running:
#   1. In Xcode → Settings → Accounts → Manage Certificates, add a "Developer ID Application"
#      certificate (needs the paid Apple Developer Program; only the account holder can create it).
#   2. In Keychain Access → My Certificates, right-click "Developer ID Application: …" →
#      Export… and save it as a .p12 with a password.
#   3. In App Store Connect → Users and Access → Integrations → Team Keys, generate a key with
#      Developer access and download its AuthKey_<KEY ID>.p8 file. Note the Issuer ID shown above
#      the key list.
#
# Usage: scripts/setup-signing.sh path/to/certificate.p12 path/to/AuthKey_XXXXXXXXXX.p8
#
# Nothing is written to disk; the password is read without echo and secrets go to `gh` on stdin.

set -euo pipefail

p12=${1:-}
p8=${2:-}
if [ -z "$p12" ] || [ ! -f "$p12" ] || [ -z "$p8" ] || [ ! -f "$p8" ]; then
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

command -v gh >/dev/null || { echo "Install the GitHub CLI first: brew install gh" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Sign in to GitHub first: gh auth login" >&2; exit 1; }

identity=$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application: .*\)"/\1/p' | head -n 1)
if [ -z "$identity" ]; then
  echo "No \"Developer ID Application\" certificate in your keychain (see step 1 at the top of this script)." >&2
  exit 1
fi
key_id=$(basename "$p8" | sed -n 's/^AuthKey_\([A-Z0-9]\{10\}\)\.p8$/\1/p')
if [ -z "$key_id" ]; then
  read -rp "Key ID (10 characters, shown next to the key in App Store Connect): " key_id
fi
echo "Certificate: $identity"
echo "API key ID:  $key_id"

read -rsp "Password for $(basename "$p12"): " p12_password; echo
read -rp  "Issuer ID (shown above the key list in App Store Connect): " issuer

echo "Checking the API key with Apple's notary service…"
if ! xcrun notarytool history --key "$p8" --key-id "$key_id" --issuer "$issuer" >/dev/null; then
  echo "Apple rejected the API key. Check the Issuer ID and that the key has Developer access." >&2
  exit 1
fi

set_secret() { printf '%s' "$2" | gh secret set "$1" >/dev/null && echo "  ✓ $1"; }
echo "Saving GitHub secrets:"
set_secret APPLE_CERTIFICATE "$(base64 < "$p12" | tr -d '\n')"
set_secret APPLE_CERTIFICATE_PASSWORD "$p12_password"
set_secret APPLE_SIGNING_IDENTITY "$identity"
set_secret APPLE_API_ISSUER "$issuer"
set_secret APPLE_API_KEY "$key_id"
set_secret APPLE_API_KEY_CONTENT "$(cat "$p8")"

echo "Done. The next version tag you push builds a signed, notarized Lacuna.dmg."
