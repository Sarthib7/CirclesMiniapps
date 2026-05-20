/**
 * Mint Personal CRC — main.js
 *
 * Lets a registered Circles v2 human avatar mint their accrued personal CRC
 * by calling hubV2.personalMint() through the host wallet bridge.
 */

// @ts-nocheck
import { onWalletChange, sendTransactions, isMiniappMode } from '@aboutcircles/miniapp-sdk';
import { Sdk } from '@aboutcircles/sdk';
import { getAddress, encodeFunctionData, createPublicClient, http, formatUnits } from 'viem';
import { gnosis } from 'viem/chains';

// ─── Constants ──────────────────────────────────────────────
const HUB_V2_ADDRESS = '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8';
const RPC_FALLBACKS = [
  'https://rpc.aboutcircles.com/',
  'https://rpc.gnosischain.com',
  'https://1rpc.io/gnosis',
];

const HUB_ABI = [
  { type: 'function', name: 'personalMint', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'isHuman', inputs: [{ name: '_human', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'stopped', inputs: [{ name: '_human', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  {
    type: 'function',
    name: 'calculateIssuance',
    inputs: [{ name: '_human', type: 'address' }],
    outputs: [
      { name: 'issuance', type: 'uint256' },
      { name: 'startPeriod', type: 'uint256' },
      { name: 'endPeriod', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  { type: 'function', name: 'balanceOf', inputs: [{ name: '_account', type: 'address' }, { name: '_id', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'toTokenId', inputs: [{ name: '_avatar', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'pure' },
];

// ─── DOM refs ───────────────────────────────────────────────
const badge = document.getElementById('badge');
const disconnectedView = document.getElementById('disconnected-view');
const loadingView = document.getElementById('loading-view');
const notHumanView = document.getElementById('not-human-view');
const stoppedView = document.getElementById('stopped-view');
const mintView = document.getElementById('mint-view');
const notHumanAddress = document.getElementById('not-human-address');
const stoppedAddress = document.getElementById('stopped-address');
const profileAvatar = document.getElementById('profile-avatar');
const profileName = document.getElementById('profile-name');
const profileAddress = document.getElementById('profile-address');
const balanceAmount = document.getElementById('balance-amount');
const mintableAmount = document.getElementById('mintable-amount');
const mintablePeriod = document.getElementById('mintable-period');
const mintBtn = document.getElementById('mint-btn');
const refreshBtn = document.getElementById('refresh-btn');
const btnText = mintBtn.querySelector('.btn-text');
const btnSpinner = mintBtn.querySelector('.btn-spinner');
const resultBox = document.getElementById('result-box');
const resultIcon = document.getElementById('result-icon');
const resultMessage = document.getElementById('result-message');

// ─── State ──────────────────────────────────────────────────
let connectedAddress = null;
let currentMintable = 0n;
let isBusy = false;
let refreshTimer = null;

// ─── Read client (RPC fallbacks) ────────────────────────────
const publicClients = RPC_FALLBACKS.map(url =>
  createPublicClient({ chain: gnosis, transport: http(url) })
);

async function readContract(args) {
  let lastErr;
  for (const client of publicClients) {
    try {
      return await client.readContract(args);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function waitForReceipt(hash) {
  const POLL_MS = 3000;
  const TIMEOUT_MS = 2 * 60 * 1000;
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    for (const client of publicClients) {
      try {
        const r = await client.getTransactionReceipt({ hash });
        if (r) return r;
      } catch { /* next RPC */ }
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  throw new Error(`Timed out waiting for tx ${hash}`);
}

// ─── Helpers ────────────────────────────────────────────────
function decodeError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.shortMessage) return err.shortMessage;
  if (err.message) return err.message;
  return String(err);
}

function shortAddress(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatCrc(wei) {
  const str = formatUnits(wei, 18);
  const num = Number(str);
  if (!Number.isFinite(num)) return str;
  if (num === 0) return '0';
  if (num < 0.0001) return num.toExponential(2);
  if (num < 1) return num.toFixed(4);
  return num.toFixed(num < 100 ? 3 : 2);
}

function showToast(message, type = 'info', durationMs = 4000) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), durationMs);
}

function showView(id) {
  [disconnectedView, loadingView, notHumanView, stoppedView, mintView].forEach(v => v.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

function setBusy(busy) {
  isBusy = busy;
  mintBtn.disabled = busy || currentMintable === 0n;
  refreshBtn.disabled = busy;
  btnText.textContent = busy ? 'Minting…' : 'Mint Personal CRC';
  btnSpinner.classList.toggle('hidden', !busy);
}

function formatPeriod(start, end) {
  if (!start || !end) return '';
  // Hub V2 calculateIssuance returns period bounds as Unix seconds. Be defensive:
  // only render as a date when the value is plausibly a Unix timestamp.
  const s = Number(start);
  const e = Number(end);
  const looksLikeSeconds = s > 1_600_000_000 && e > 1_600_000_000 && e < 4_000_000_000;
  if (!looksLikeSeconds) return '';
  const startDate = new Date(s * 1000);
  const endDate = new Date(e * 1000);
  return `Accrued ${startDate.toLocaleString()} → ${endDate.toLocaleString()}`;
}

// ─── Profile (best-effort, optional) ────────────────────────
let _readSdk = null;
function getReadSdk() {
  if (!_readSdk) {
    try {
      _readSdk = new Sdk();
    } catch (e) {
      console.warn('[mint] Could not init read SDK:', decodeError(e));
    }
  }
  return _readSdk;
}

async function loadProfileBestEffort(address) {
  const sdk = getReadSdk();
  if (!sdk?.rpc?.profile) return null;
  try {
    let profile = await sdk.rpc.profile.getProfileByAddress(address);
    if (!profile) {
      profile = await sdk.rpc.profile.getProfileByAddress(address.toLowerCase());
    }
    return profile || null;
  } catch (e) {
    console.warn('[mint] Profile lookup failed:', decodeError(e));
    return null;
  }
}

function renderProfile(profile, address) {
  const name = profile?.name || profile?.registeredName || 'Circles Avatar';
  profileName.textContent = name;
  profileAddress.textContent = address;

  profileAvatar.innerHTML = '';
  if (profile?.previewImageUrl || profile?.imageUrl) {
    const img = document.createElement('img');
    img.src = profile.previewImageUrl || profile.imageUrl;
    img.alt = name;
    img.onerror = () => {
      profileAvatar.innerHTML = '';
      profileAvatar.textContent = name.charAt(0).toUpperCase();
    };
    profileAvatar.appendChild(img);
  } else {
    profileAvatar.textContent = name.charAt(0).toUpperCase();
  }
}

// ─── Core: load avatar state ───────────────────────────────
async function loadAvatarState() {
  if (!connectedAddress) return;

  badge.textContent = 'Connected';
  badge.className = 'badge badge-connected';

  // 1. Confirm the address is a registered v2 human
  let isHuman;
  try {
    isHuman = await readContract({
      address: HUB_V2_ADDRESS,
      abi: HUB_ABI,
      functionName: 'isHuman',
      args: [connectedAddress],
    });
  } catch (e) {
    console.error('[mint] isHuman failed:', e);
    showToast(`Failed to read avatar: ${decodeError(e)}`, 'error');
    showView('not-human-view');
    notHumanAddress.textContent = connectedAddress;
    return;
  }

  if (!isHuman) {
    notHumanAddress.textContent = connectedAddress;
    showView('not-human-view');
    return;
  }

  // 2. Check stopped
  const isStopped = await readContract({
    address: HUB_V2_ADDRESS,
    abi: HUB_ABI,
    functionName: 'stopped',
    args: [connectedAddress],
  }).catch(() => false);

  if (isStopped) {
    stoppedAddress.textContent = connectedAddress;
    showView('stopped-view');
    return;
  }

  // 3. Show mint view, then populate
  showView('mint-view');
  const profile = await loadProfileBestEffort(connectedAddress);
  renderProfile(profile, connectedAddress);

  await refreshAmounts();
}

async function refreshAmounts() {
  if (!connectedAddress) return;

  // Personal token id = toTokenId(avatar) — for human avatars this is uint160(avatar).
  let tokenId;
  try {
    tokenId = await readContract({
      address: HUB_V2_ADDRESS,
      abi: HUB_ABI,
      functionName: 'toTokenId',
      args: [connectedAddress],
    });
  } catch (e) {
    console.warn('[mint] toTokenId failed:', e);
  }

  // Balance
  if (tokenId !== undefined) {
    try {
      const bal = await readContract({
        address: HUB_V2_ADDRESS,
        abi: HUB_ABI,
        functionName: 'balanceOf',
        args: [connectedAddress, tokenId],
      });
      balanceAmount.textContent = formatCrc(bal);
    } catch (e) {
      console.warn('[mint] balanceOf failed:', e);
      balanceAmount.textContent = '—';
    }
  }

  // Mintable
  try {
    const [issuance, startPeriod, endPeriod] = await readContract({
      address: HUB_V2_ADDRESS,
      abi: HUB_ABI,
      functionName: 'calculateIssuance',
      args: [connectedAddress],
    });
    currentMintable = issuance;
    mintableAmount.textContent = formatCrc(issuance);
    if (issuance > 0n) {
      const period = formatPeriod(startPeriod, endPeriod);
      mintablePeriod.textContent = period || 'Ready to claim. CRC accrues continuously, up to ~24 CRC per day.';
    } else {
      mintablePeriod.textContent = 'Nothing to mint yet — check back later as CRC accrues over time.';
    }
    mintBtn.disabled = isBusy || issuance === 0n;
  } catch (e) {
    console.warn('[mint] calculateIssuance failed:', e);
    currentMintable = 0n;
    mintableAmount.textContent = '—';
    mintBtn.disabled = true;
  }
}

// ─── Core: send personalMint transaction ───────────────────
async function doMint() {
  if (!connectedAddress) throw new Error('Not connected');

  const data = encodeFunctionData({
    abi: HUB_ABI,
    functionName: 'personalMint',
    args: [],
  });

  const tx = {
    to: HUB_V2_ADDRESS,
    data,
    value: '0x0',
  };

  console.log('[mint] Sending personalMint tx:', tx);
  const hashes = await sendTransactions([tx]);
  console.log('[mint] TX hashes:', hashes);

  const receipt = await waitForReceipt(hashes[0]);
  console.log('[mint] Receipt status:', receipt.status);

  if (receipt.status === 'reverted') {
    throw new Error('Transaction reverted on-chain');
  }

  return hashes[0];
}

// ─── Event handlers ────────────────────────────────────────
mintBtn.addEventListener('click', async () => {
  if (isBusy || currentMintable === 0n) return;

  setBusy(true);
  resultBox.classList.add('hidden');
  const mintedDisplay = formatCrc(currentMintable);

  try {
    const hash = await doMint();
    resultIcon.textContent = '✨';
    resultMessage.textContent = `Minted ${mintedDisplay} personal CRC. Tx ${shortAddress(hash)}`;
    resultBox.className = 'result-box';
    resultBox.classList.remove('hidden');
    showToast(`Minted ${mintedDisplay} CRC`, 'success');

    // Wait a moment for indexers / RPC to catch up, then refresh.
    await new Promise(r => setTimeout(r, 2000));
    await refreshAmounts();
  } catch (err) {
    console.error('[mint] Mint failed:', err);
    resultIcon.textContent = '❌';
    resultMessage.textContent = `Failed: ${decodeError(err)}`;
    resultBox.className = 'result-box result-error';
    resultBox.classList.remove('hidden');
    showToast(`Mint failed: ${decodeError(err)}`, 'error');
  } finally {
    setBusy(false);
  }
});

refreshBtn.addEventListener('click', async () => {
  if (isBusy) return;
  refreshBtn.disabled = true;
  try {
    await refreshAmounts();
  } finally {
    refreshBtn.disabled = false;
  }
});

// ─── Wallet connection ─────────────────────────────────────
onWalletChange(async (address) => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  if (!address) {
    connectedAddress = null;
    currentMintable = 0n;
    badge.textContent = 'Not connected';
    badge.className = 'badge badge-disconnected';
    showView('disconnected-view');
    return;
  }

  connectedAddress = getAddress(address);
  console.log('[mint] Connected:', connectedAddress);
  showView('loading-view');
  await loadAvatarState();

  // Re-poll mintable amount every 30s while the mint view is open.
  refreshTimer = setInterval(() => {
    if (!isBusy && !mintView.classList.contains('hidden')) {
      refreshAmounts().catch(e => console.warn('[mint] auto-refresh failed:', e));
    }
  }, 30_000);
});

// ─── Standalone mode warning ───────────────────────────────
if (!isMiniappMode()) {
  console.warn('[mint] Not running inside the Circles MiniApp host.');
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<div style="background:#fff9ea;padding:8px 16px;font-size:12px;text-align:center;border-bottom:1px solid #eee7e2">' +
    '⚠️ Standalone mode — minting requires the Circles host. ' +
    'Load via <a href="https://circles.gnosis.io/miniapps" target="_blank">circles.gnosis.io/miniapps</a> to mint.</div>'
  );
}
