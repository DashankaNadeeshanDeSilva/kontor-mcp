#!/usr/bin/env sh
# Compile the four precompiled Schematron XSLTs (from the KoSIT validator configuration) to Saxon-JS SEF.
# Build-time only. Output: fixtures/_downloads/sef/*.sef.json (gitignored until Task 1.4 bundles them into @kontor-mcp/rules).
set -eu
R=fixtures/_downloads/xrechnung-validator-configuration/resources
OUT=fixtures/_downloads/sef
mkdir -p "$OUT"
for x in ubl/2.1/xsl/EN16931-UBL-validation cii/16b/xsl/EN16931-CII-validation xrechnung/3.0.2/xsl/XRechnung-UBL-validation xrechnung/3.0.2/xsl/XRechnung-CII-validation; do
  n=$(basename "$x")
  echo "compiling $n"
  node_modules/.bin/xslt3 -xsl:"$R/$x.xsl" -export:"$OUT/$n.sef.json" -nogo -relocate:on
done
