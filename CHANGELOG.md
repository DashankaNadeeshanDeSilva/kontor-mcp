# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow semver.

## [Unreleased]

### Added
- `@kontor-mcp/core`: hardened XML loader (`loadXml`: DTD/XXE rejected, size/depth caps, line/col errors) and format detection (`detectFormat`: container, UBL/CII syntax, EN 16931, XRechnung version/variant, Factur-X/ZUGFeRD profile) (Task 1.1).
- Monorepo skeleton: `@kontor-mcp/{core,rules,server,client}`, TypeScript strict, vitest, Biome, CI matrix (Task 0.1).
