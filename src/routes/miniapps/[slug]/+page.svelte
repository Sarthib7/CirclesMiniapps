<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import AppNavigation from '$lib/AppNavigation.svelte';

	const baseUrl = import.meta.env.VITE_BASE_URL;
	import { wallet } from '$lib/wallet.svelte.ts';
	import ApprovalPopup from '$lib/ApprovalPopup.svelte';
	import {
		truncateAddr,
		getAvatarInitial as _getAvatarInitial,
		createMessageHandler,
		createApprovalHandlers,
		type PendingRequest
	} from '$lib/iframeHost.ts';

	type MiniApp = { slug?: string; name: string; logo: string; url: string; description?: string; tags: string[]; isHidden?: boolean };

	let app: MiniApp | null = $state(null);
	let notFound = $state(false);
	let iframeSrc = $state('');
	let isOffline = $state(false);
	let showLogout = $state(false);
	let chipEl = $state<HTMLElement>();

	let childSafes = $state<string[]>([]);
	let loadingChildSafes = $state(false);

	function handleWindowClick(e: MouseEvent) {
		if (showLogout && chipEl && !chipEl.contains(e.target as Node)) {
			showLogout = false;
		}
	}

	// pendingSource is kept outside $state to avoid Svelte proxying the cross-origin Window object,
	// which triggers "Blocked a frame from accessing a cross-origin frame".
	let pendingSource: MessageEventSource | null = null;
	let pendingRequest: PendingRequest | null = $state(null);

	let iframeEl: HTMLIFrameElement = $state() as HTMLIFrameElement;

	const getAvatarInitial = () => _getAvatarInitial(wallet.avatarName, wallet.address);

	async function openUserMenu() {
		showLogout = !showLogout;
		if (showLogout && wallet.connected && !loadingChildSafes) {
			loadingChildSafes = true;
			try {
				childSafes = await wallet.fetchOwnedChildSafes();
			} finally {
				loadingChildSafes = false;
			}
		}
	}

	async function switchToChildSafe(addr: string) {
		showLogout = false;
		await wallet.loginAsChildSafe(addr);
	}

	function postToIframe(data: any) {
		try {
			iframeEl?.contentWindow?.postMessage(data, '*');
		} catch {
			// cross-origin access blocked — ignore
		}
	}

	const handleMessage = createMessageHandler({
		getAppData: () => $page.url.searchParams.get('data'),
		setPending: (req) => { pendingRequest = req; },
		setPendingSource: (s) => { pendingSource = s; }
	});

	const { handleApprove, handleReject } = createApprovalHandlers({
		getPending: () => pendingRequest,
		getPendingSource: () => pendingSource,
		setPending: (req) => { pendingRequest = req; },
		setPendingSource: (s) => { pendingSource = s; }
	});

	onMount(() => {
		const syncOnlineState = () => {
			isOffline = !navigator.onLine;
		};

		syncOnlineState();
		window.addEventListener('message', handleMessage);
		window.addEventListener('online', syncOnlineState);
		window.addEventListener('offline', syncOnlineState);

		wallet.autoConnectAndPick();

		fetch('/miniapps.json')
			.then((r) => r.json())
			.then((data: MiniApp[]) => {
				const currentSlug = $page.params.slug;
				const found = data.find((a) => a.slug === currentSlug);
				if (found) {
					app = found;
					iframeSrc = found.url;
				} else {
					notFound = true;
				}
			})
			.catch(() => {
				notFound = true;
			});

		return () => {
			window.removeEventListener('message', handleMessage);
			window.removeEventListener('online', syncOnlineState);
			window.removeEventListener('offline', syncOnlineState);
		};
	});

	// Push wallet status to iframe whenever connection changes
	$effect(() => {
		if (wallet.connected) {
			postToIframe({ type: 'wallet_connected', address: wallet.address });
		} else {
			postToIframe({ type: 'wallet_disconnected' });
		}
	});

	function handleIframeLoad() {
		if (wallet.connected) {
			postToIframe({ type: 'wallet_connected', address: wallet.address });
		}
		const raw = $page.url.searchParams.get('data');
		if (raw) {
			try {
				postToIframe({ type: 'app_data', data: atob(raw) });
			} catch {
				postToIframe({ type: 'app_data', data: raw });
			}
		}
	}

	function goBack() {
		goto('/miniapps');
	}
</script>

<svelte:window onclick={handleWindowClick} />

<svelte:head>
	<title>{app ? app.name : 'Mini App'} - {baseUrl}</title>
</svelte:head>

<div class="page">
	{#if notFound}
		<div class="iframe-topbar">
			<div class="topbar-left">
				<button class="back-btn" onclick={goBack}>&#8592; back</button>
				<AppNavigation />
			</div>
		</div>
		<div class="not-found">
			<p>App not found.</p>
		</div>
	{:else}
		<div class="iframe-topbar">
			<div class="topbar-left">
				<button class="back-btn" onclick={goBack}>&#8592; back</button>
				<AppNavigation />
			</div>
			<div class="header-right">
				{#if wallet.connected}
					<div class="user-chip-wrap">
						<div
							class="user-chip"
							bind:this={chipEl}
							class:open={showLogout}
							onclick={openUserMenu}
							role="button"
							tabindex="0"
							onkeydown={(e) => e.key === 'Enter' && openUserMenu()}
						>
							<div class="avatar-img-wrap">
								{#if wallet.avatarImageUrl}
									<img class="avatar-img" src={wallet.avatarImageUrl} alt="avatar" />
								{:else}
									<span class="avatar-placeholder">{getAvatarInitial()}</span>
								{/if}
							</div>
							<span class="user-name">{wallet.avatarName || truncateAddr(wallet.address)}</span>
						</div>
						{#if wallet.childSafeAddress}
							<div class="child-safe-badge">
								<span>Signing as: {truncateAddr(wallet.primaryAddress)}</span>
								<button class="badge-close" onclick={() => wallet.logoutChildSafe()}>&#215;</button>
							</div>
						{/if}
						{#if showLogout}
							<div class="chip-dropdown" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
								{#if wallet.childSafeAddress}
									<button
										class="dropdown-action"
										onclick={() => { wallet.logoutChildSafe(); showLogout = false; }}
									>
										Back to primary safe
									</button>
									<div class="dropdown-divider"></div>
								{/if}
								<button
									class="dropdown-action logout"
									onclick={(e) => { e.stopPropagation(); wallet.disconnect(); showLogout = false; }}
								>
									Log out
								</button>
								{#if childSafes.length > 0}
									<div class="dropdown-divider"></div>
									<div class="dropdown-section-label">Switch to child account</div>
									{#each childSafes as safe (safe)}
										<button
											class="dropdown-action child-safe-item"
											onclick={() => switchToChildSafe(safe)}
										>
											{truncateAddr(safe)}
											{#if safe === wallet.childSafeAddress}
												<span class="active-dot"></span>
											{/if}
										</button>
									{/each}
								{:else if loadingChildSafes}
									<div class="dropdown-loading">Loading safes...</div>
								{/if}
							</div>
						{/if}
					</div>
				{:else}
					<button
						class="connect-btn"
						onclick={() => wallet.connectAndPick()}
						disabled={wallet.connecting}
					>
						{#if wallet.connecting}
							<span class="btn-spinner"></span>
							Connecting...
						{:else}
							Sign in
						{/if}
					</button>
				{/if}
			</div>
		</div>

		<div class="iframe-card">
			{#if isOffline}
				<div class="offline-frame-state">
					<h2>Mini app unavailable offline</h2>
					<p>
						This mini app is embedded from its own site, so it can&apos;t load until your
						connection returns. The cached Circles shell is still available.
					</p>
				</div>
			{:else if iframeSrc}
				<iframe
					bind:this={iframeEl}
					src={iframeSrc}
					sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-top-navigation-by-user-activation"
					title={app ? app.name : 'Mini App'}
					onload={handleIframeLoad}
				></iframe>
			{/if}
		</div>
	{/if}
</div>


<!-- Approval Popup -->
{#if pendingRequest}
	<ApprovalPopup
		request={pendingRequest}
		onapprove={handleApprove}
		onreject={handleReject}
	/>
{/if}

<style>
	.page {
		height: 100vh;
		display: flex;
		flex-direction: column;
		max-width: 720px;
		margin: 0 auto;
		padding: 12px 8px;
		box-sizing: border-box;
		overflow-x: hidden;
	}

	/* Child safe badge */
	.child-safe-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px 2px 8px;
		border-radius: var(--radius-pill);
		background: var(--accent-soft, rgba(14, 0, 168, 0.08));
		border: 1px solid var(--accent-line, rgba(14, 0, 168, 0.18));
		font-size: 11px;
		font-weight: 500;
		color: var(--accent, #0e00a8);
		white-space: nowrap;
	}

	.badge-close {
		background: none;
		border: none;
		padding: 0 0 0 2px;
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
		color: var(--accent, #0e00a8);
		opacity: 0.6;
		transition: opacity 0.15s;
		display: flex;
		align-items: center;
	}

	.badge-close:hover {
		opacity: 1;
	}

	/* Chip dropdown */
	.chip-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		min-width: 180px;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius-card, 12px);
		box-shadow: var(--shadow-card, 0 4px 16px rgba(0, 0, 0, 0.10));
		z-index: 100;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.dropdown-action {
		background: none;
		border: none;
		width: 100%;
		text-align: left;
		padding: 10px 14px;
		font-size: 13px;
		font-weight: 500;
		color: var(--ink);
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 6px;
		transition: background 0.12s;
	}

	.dropdown-action:hover {
		background: var(--bg-a);
	}

	.dropdown-action.logout {
		color: var(--muted);
	}

	.dropdown-action.logout:hover {
		color: var(--ink);
	}

	.dropdown-action.child-safe-item {
		font-size: 12px;
		font-family: monospace;
		color: var(--muted);
	}

	.dropdown-action.child-safe-item:hover {
		color: var(--ink);
	}

	.dropdown-divider {
		height: 1px;
		background: var(--line);
		margin: 2px 0;
	}

	.dropdown-section-label {
		padding: 6px 14px 4px;
		font-size: 11px;
		font-weight: 600;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.dropdown-loading {
		padding: 10px 14px;
		font-size: 12px;
		color: var(--muted);
	}

	.active-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent, #0e00a8);
		flex-shrink: 0;
		margin-left: auto;
	}

	/* Iframe card fills remaining space */
	.iframe-card {
		flex: 1;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: var(--radius-card);
		overflow: hidden;
		background: var(--card);
		min-height: 0;
		box-shadow: var(--shadow-card);
	}

	.offline-frame-state {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 32px;
		text-align: center;
		background:
			radial-gradient(700px 240px at 50% 0%, rgba(14, 0, 168, 0.05) 0%, transparent 70%),
			linear-gradient(145deg, rgba(250, 245, 241, 0.85), rgba(246, 247, 249, 0.88));
	}

	.offline-frame-state h2 {
		margin: 0 0 10px;
		font-size: 22px;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--ink);
	}

	.offline-frame-state p {
		margin: 0;
		max-width: 420px;
		font-size: 14px;
		line-height: 1.6;
		color: var(--muted);
	}

	iframe {
		flex: 1;
		width: 100%;
		height: 100%;
		border: none;
	}

	/* Not found */
	.not-found {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--muted);
		font-size: 15px;
	}

</style>
