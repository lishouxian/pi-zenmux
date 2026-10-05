/**
 * Minimal ZenMux provider for pi.
 *
 * - OAuth 2.0 PKCE login (`/login zenmux`) with token refresh.
 * - A small, hand-maintained model list with correct metadata, so pi's
 *   prompt-cache warming and adaptive thinking work.
 * - Requests go straight to pi's built-in `anthropic-messages` transport.
 */

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "zenmux";
const OAUTH_ORIGIN = "https://zenmux.ai";
const ANTHROPIC_BASE_URL = "https://zenmux.ai/api/anthropic";
const CLIENT_ID = "zpc_-6SsDHPARf6Rg5TTzbvlOQka";
const SCOPE = "inference:invoke offline_access";
const LOGIN_TIMEOUT_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/** Claude 5.x adaptive-thinking models routed through ZenMux's Anthropic endpoint. */
function claude(id: string, name: string, cost: ProviderModelConfig["cost"]): ProviderModelConfig {
	return {
		id,
		name: `ZenMux · ${name}`,
		api: "anthropic-messages",
		reasoning: true,
		input: ["text", "image"],
		// List prices (USD per million tokens). On a subscription these only feed
		// pi's cost display and cache-warming economics.
		cost,
		contextWindow: 1_000_000,
		maxTokens: 128_000,
		thinkingLevelMap: {
			off: null,
			minimal: null,
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "xhigh",
			max: "max",
		},
		compat: {
			forceAdaptiveThinking: true,
			supportsTemperature: false,
		},
		promptCache: { short: 300, long: 3600 },
	};
}

const MODELS: ProviderModelConfig[] = [
	claude("anthropic/claude-opus-5.5", "Claude Opus 5.5", { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }),
	claude("anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5", { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }),
];

// ---------------------------------------------------------------------------
// OAuth (PKCE + loopback redirect)
// ---------------------------------------------------------------------------

interface TokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
}

async function requestToken(params: Record<string, string>, signal?: AbortSignal): Promise<OAuthCredentials> {
	const response = await fetch(`${OAUTH_ORIGIN}/oauth/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
		signal,
	});
	const body = (await response.json().catch(() => ({}))) as Partial<TokenResponse> & {
		error?: string;
		error_description?: string;
	};
	if (!response.ok) {
		throw new Error(`ZenMux token request failed (${response.status}): ${body.error_description ?? body.error ?? ""}`);
	}
	if (!body.access_token || !body.refresh_token || typeof body.expires_in !== "number") {
		throw new Error("ZenMux token response is missing access_token, refresh_token or expires_in");
	}
	return {
		access: body.access_token,
		refresh: body.refresh_token,
		expires: Date.now() + body.expires_in * 1000,
	};
}

/** Start a loopback server on a random port and wait for the authorization code. */
function waitForCallback(state: string, signal?: AbortSignal) {
	return new Promise<{ redirectUri: string; code: Promise<string> }>((ready, fail) => {
		let resolveCode!: (code: string) => void;
		let rejectCode!: (error: Error) => void;
		const code = new Promise<string>((res, rej) => {
			resolveCode = res;
			rejectCode = rej;
		});

		const finish = (error?: Error, value?: string) => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			server.close();
			if (error) rejectCode(error);
			else resolveCode(value!);
		};
		const onAbort = () => finish(new Error("Login cancelled"));
		const timer = setTimeout(() => finish(new Error("ZenMux login timed out")), LOGIN_TIMEOUT_MS);
		timer.unref();

		const server = createServer((req, res) => {
			const url = new URL(req.url ?? "/", "http://127.0.0.1");
			if (url.pathname !== "/callback") {
				res.writeHead(404).end();
				return;
			}
			const error = url.searchParams.get("error");
			const value = url.searchParams.get("code");
			if (error || !value || url.searchParams.get("state") !== state) {
				res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("ZenMux authorization failed.");
				finish(new Error(`ZenMux authorization failed: ${error ?? "state mismatch"}`));
				return;
			}
			res.writeHead(302, { location: `${OAUTH_ORIGIN}/platform/oauth-completed?client=pi` }).end();
			finish(undefined, value);
		});

		code.catch(() => {});
		signal?.addEventListener("abort", onAbort, { once: true });
		server.once("error", fail);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") return fail(new Error("Callback server failed to bind"));
			ready({ redirectUri: `http://127.0.0.1:${address.port}/callback`, code });
		});
	});
}

async function login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
	const verifier = randomBytes(48).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	const state = randomBytes(32).toString("base64url");

	const { redirectUri, code } = await waitForCallback(state, callbacks.signal);
	const url = new URL(`${OAUTH_ORIGIN}/oauth/authorize`);
	url.search = new URLSearchParams({
		response_type: "code",
		client_id: CLIENT_ID,
		redirect_uri: redirectUri,
		scope: SCOPE,
		state,
		code_challenge: challenge,
		code_challenge_method: "S256",
	}).toString();

	callbacks.onAuth({ url: url.toString() });
	callbacks.onProgress?.("Waiting for ZenMux authorization in your browser…");

	return requestToken(
		{ grant_type: "authorization_code", code: await code, redirect_uri: redirectUri, code_verifier: verifier },
		callbacks.signal,
	);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export default function zenmux(pi: ExtensionAPI) {
	pi.registerProvider(PROVIDER_ID, {
		name: "ZenMux",
		baseUrl: ANTHROPIC_BASE_URL,
		api: "anthropic-messages",
		headers: { "X-Title": "Pi" },
		models: MODELS,
		oauth: {
			name: "ZenMux",
			isSubscription: true,
			login,
			refreshToken: (credentials, signal) =>
				requestToken({ grant_type: "refresh_token", refresh_token: credentials.refresh }, signal),
			getApiKey: (credentials) => credentials.access,
		},
	});
}
