# 60-second demo GIF — recording script (PRD G6)

Setup: Claude Desktop with `{"command":"npx","args":["-y","@kontor-mcp/server"]}` (or the source path), window 1280×800, German UI. Sample: `packages/server/samples/broken-missing-buyer-reference.xml` (or `fixtures/plausibility/broken-leitweg-vat-math.xml` for the VAT-math variant). Screen recording with QuickTime; convert with the command at the bottom.

| t | You type / do | What the viewer sees |
|---|---|---|
| 0:00 | "Prüfe diese Rechnung: /ABS/PATH/broken-missing-buyer-reference.xml" | `audit_invoice` call, verdict **ABLEHNEN**, BR-DE-15 explained in German |
| 0:15 | "Entwirf die Antwort an den Lieferanten" | `draft-supplier-rejection` prompt → German e-mail draft citing BR-DE-15 |
| 0:30 | "Erzeuge die korrigierte XRechnung mit Leitweg-ID 04011000-12345-03 nach /ABS/PATH/out/corrected.xml" | `generate_invoice` → `valid: true`, file written |
| 0:45 | "Prüfe die neue Datei" | `validate_invoice` → **GÜLTIG** |
| 0:55 | (caption) | "100 % lokal. Keine API-Keys. Offizielle KoSIT-Regeln." |

Convert (same settings as the v0.1 GIF):

```sh
ffmpeg -i recording.mov -vf "fps=12,scale=1000:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" -loop 0 docs/media/v1.0-desktop-demo.gif
ffmpeg -i recording.mov -vcodec libx264 -crf 23 -preset slow -movflags +faststart docs/media/v1.0-desktop-demo.mp4
```

Then in `README.md` replace the hero image with `docs/media/v1.0-desktop-demo.gif`.
