# Release history

Record each production deploy.

| Tag | Date | Site | Notes |
|-----|------|------|-------|
| v0.1.0 | | | First SQLite production ship |

## Deploy steps

1. `npm run build && npm run smoke`
2. Complete `docs/PARITY_SIGNOFF.md` (or waiver)
3. `git tag vX.Y.Z && git push origin vX.Y.Z`
4. On laptop: pull tag, `npm install`, `npm run build`, restart
5. Add row above
