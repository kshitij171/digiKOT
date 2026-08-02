# Production bug-fix workflow

## 1. Collect from restaurant

- digiKOT version: `GET /api/health` → `version`
- Steps to reproduce
- Expected vs actual
- Attach `data/logs/digikot-*.log` (last 24h)
- Optional: `data/digikot.db` copy via secure transfer (never commit)

Use `docs/BUG_REPORT_TEMPLATE.md` when filing issues.

## 2. Reproduce locally

```bash
git checkout vX.Y.Z              # tag running in restaurant
# Place their digikot.db in data/
npm run start
```

## 3. Fix

```bash
git checkout -b hotfix/vX.Y.Z-short-description main
# fix, test
npm run build
npm run smoke
# manual parity subset: login + KOT + bill
```

## 4. Ship

```bash
git tag vX.Y.Z+1
```

On restaurant laptop:

```bash
git pull
npm install
npm run build
cp data/digikot.db data/backups/pre-upgrade-$(date +%Y%m%d).db
npm run start
```

## 5. Rollback

```bash
git checkout vX.Y.Z
npm install && npm run build
# restore data/digikot.db from backup if needed
npm run start
```
