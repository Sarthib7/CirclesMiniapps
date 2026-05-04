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

	type MiniApp = { slug?: string; name: string; logo: string; url: string; description?: string; tags: string[]; isHidden?: boolean; category?: string };

	let app: MiniApp | null = $state(null);
	let notFound = $state(false);
	let iframeSrc = $state('');
	let showLogout = $state(false);
	let chipEl = $state<HTMLElement>();

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

	onMount(() => {
		window.addEventListener('message', handleMessage);

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
		goto('/admin');
	}


	const { handleApprove, handleReject } = createApprovalHandlers({
		getPending: () => pendingRequest,
		getPendingSource: () => pendingSource,
		setPending: (req) => { pendingRequest = req; },
		setPendingSource: (s) => { pendingSource = s; }
	});
</script>

<svelte:window onclick={handleWindowClick} />

<svelte:head>
	<title>{app ? app.name : 'Admin App'} - {baseUrl}</title>
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
					<div class="user-chip" bind:this={chipEl} class:open={showLogout} onclick={() => (showLogout = !showLogout)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && (showLogout = !showLogout)}>
						<div class="avatar-img-wrap">
							{#if wallet.avatarImageUrl}
								<img class="avatar-img" src={wallet.avatarImageUrl} alt="avatar" />
							{:else}
								<span class="avatar-placeholder">{getAvatarInitial()}</span>
							{/if}
						</div>
						<span class="user-name">{wallet.avatarName || truncateAddr(wallet.address)}</span>
						{#if showLogout}
							<button class="logout-btn" onclick={(e) => { e.stopPropagation(); wallet.disconnect(); showLogout = false; }}>Log out</button>
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
			{#if iframeSrc}
				<iframe
					bind:this={iframeEl}
					src={iframeSrc}
					sandbox="allow-scripts allow-forms allow-same-origin allow-top-navigation allow-popups"
					title={app ? app.name : 'Admin App'}
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
