# Circles MiniApps — Claude Code Instructions

## Session Start

Read `.context/miniappDevelopmentGuide.md` — it is the complete technical reference for building miniapps.

## Autonomous Build Mode

If your task is to **build a miniapp autonomously**, follow `AGENT.md` at the repo root. That document is the complete workflow — do not improvise the process.

## Key Conventions

- **Network**: Gnosis Chain only (chain ID 100)
- **Miniapp structure**: `index.html` + `main.js` + `style.css`
- **Wallet bridge**: `@aboutcircles/miniapp-sdk` — install via npm (`npm install @aboutcircles/miniapp-sdk`). Exports: `onWalletChange`, `sendTransactions`, `signMessage`, `onAppData`, `isMiniappMode`
- **SDK split**:
  - `@aboutcircles/miniapp-sdk` = postMessage bridge for wallet ops (transactions, signing) only
  - `@aboutcircles/sdk` + `viem` = read Circles state (profiles, trust, avatars, balances)
- **Deployment**: Vercel (`vercel --name circles-miniapp-<slug> --yes --prod`)
- **PR target**: `master` on `aboutcircles/CirclesMiniapps`
- **Commands**: Custom slash commands (`/scaffold`, `/deploy`, `/open-pr`) are defined in `.claude/commands/` — see `scaffold.md`, `deploy.md`, `open-pr.md`

## Security

Before any commit: no API keys, no hardcoded credentials, no PII. Use env vars.
