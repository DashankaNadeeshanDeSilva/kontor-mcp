#!/usr/bin/env sh
# Mustang CLI ZUGFeRD/Factur-X validation (CI/dev only; Java 17+). Usage: pnpm mustang <file.pdf|file.xml>
set -eu
JAVA="${KONTOR_JAVA:-$( [ -x /opt/homebrew/opt/openjdk@21/bin/java ] && echo /opt/homebrew/opt/openjdk@21/bin/java || echo java )}"
JAR=fixtures/_downloads/Mustang-CLI-2.26.0.jar
[ -f "$JAR" ] || { echo "missing $JAR — run: pnpm artifacts --only mustang-cli" >&2; exit 2; }
exec "$JAVA" -jar "$JAR" --action validate --no-notices --source "$1"
