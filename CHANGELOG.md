# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow semver.

## [Unreleased]

### Added
- `@kontor-mcp/core`: hardened XML loader (`loadXml`: DTD/XXE rejected, size/depth caps, line/col errors) and format detection (`detectFormat`: container, UBL/CII syntax, EN 16931, XRechnung version/variant, Factur-X/ZUGFeRD profile) (Task 1.1).
- `@kontor-mcp/core`: ZUGFeRD/Factur-X PDF extraction (`extractEmbeddedXml`, `detectInvoicePdf`): name-tree + `/AF` lookup, filename fallback scan, XMP conformance level → profile; encrypted / no-attachment / size / decompression-bomb rejected (Task 1.2).
- Monorepo skeleton: `@kontor-mcp/{core,rules,server,client}`, TypeScript strict, vitest, Biome, CI matrix (Task 0.1).
