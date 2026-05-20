# Mint Personal CRC

A Circles MiniApp that lets a registered Circles v2 human avatar mint the personal CRC they've accrued.

## What it does

- Connects to your Circles wallet via `@aboutcircles/miniapp-sdk`
- Checks the connected address is a registered v2 human (`Hub.isHuman`)
- Reads accrued mintable amount (`Hub.calculateIssuance`) and current personal CRC balance (`Hub.balanceOf`)
- On click, sends a `personalMint()` transaction to the Hub via the host wallet bridge
- Polls the tx receipt and refreshes the balance + mintable display

## Contracts

- Circles Hub V2 (Gnosis Chain): `0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8`
- `personalMint()` — caller-only; transfers accrued issuance to the caller's personal token id
- `calculateIssuance(address)` — `(issuance, startPeriod, endPeriod)`, view
- `isHuman(address)`, `stopped(address)`, `balanceOf(account, id)`, `toTokenId(avatar)` — view/pure

Issuance accrues continuously for registered humans at up to ~24 CRC per day, capped by an internal accrual window.

## Development

```sh
npm install
npm run dev    # serves on localhost:5182 when run via the host package script
npm run build  # emits to dist/
```

When running as an embedded mini-app, the host injects the wallet bridge over `postMessage`. In standalone mode (opened directly in a browser) you'll see a notice — minting requires the host.

## Deployment

Static site. Drop the `dist/` output anywhere that can serve HTTPS and lets the page render in an iframe. Example `vercel.json` already permits framing.

To list this app in the Circles marketplace, add an entry to `static/miniapps.json` of this repo:

```json
{
  "slug": "personal-mint",
  "name": "Mint Personal CRC",
  "logo": "",
  "url": "https://<your-deployment>/",
  "description": "Mint your accrued personal CRC in one click.",
  "tags": ["mint", "tools"],
  "category": "garage"
}
```
