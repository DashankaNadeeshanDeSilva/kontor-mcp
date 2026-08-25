#!/usr/bin/env sh
# Compile the four precompiled Schematron XSLTs (from the KoSIT validator configuration) to Saxon-JS SEF.
# Build-time only. Output: fixtures/_downloads/sef/*.sef.json (gitignored until Task 1.4 bundles them into @kontor-mcp/rules).
#
# PATCH (documented in docs/spikes/2026-08-25-saxon-js-schematron-spike.md, D-019):
#   Saxon-JS 2.7 evaluates `xs:integer(<30-digit string>) mod 97` with double precision (wrong result),
#   while `xs:decimal(...) mod 97` is exact. The XRechnung IBAN rule BR-DE-19 relies on that expression.
#   We rewrite exactly that IBAN sub-expression to xs:decimal before compiling. Semantics are identical
#   under a correct XPath engine; only the numeric type used for the mod-97 changes.
set -eu
R=fixtures/_downloads/xrechnung-validator-configuration/resources
OUT=fixtures/_downloads/sef
PATCHED=fixtures/_downloads/sef/patched-xsl
mkdir -p "$OUT" "$PATCHED"
for x in ubl/2.1/xsl/EN16931-UBL-validation cii/16b/xsl/EN16931-CII-validation xrechnung/3.0.2/xsl/XRechnung-UBL-validation xrechnung/3.0.2/xsl/XRechnung-CII-validation; do
  n=$(basename "$x")
  sed 's/xs:integer(string-join(for \$cp in string-to-codepoints(/xs:decimal(string-join(for $cp in string-to-codepoints(/g' "$R/$x.xsl" > "$PATCHED/$n.xsl"
  patched=$(grep -c 'xs:decimal(string-join(for \$cp in string-to-codepoints(' "$PATCHED/$n.xsl" || true)
  echo "compiling $n (IBAN mod-97 patches applied: $patched)"
  node_modules/.bin/xslt3 -xsl:"$PATCHED/$n.xsl" -export:"$OUT/$n.sef.json" -nogo -relocate:on
done
