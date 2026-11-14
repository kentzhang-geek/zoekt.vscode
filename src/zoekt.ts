import { ZoektConfig, SearchOptions, ZoektSearchResult } from './types';

/**
 * @brief Decodes a base64-encoded UTF-8 string returned by Zoekt JSON API.
 * @param raw Base64 string from Zoekt response.
 * @return Decoded UTF-8 string, or original input if decoding fails.
 */
function decodeBase64Utf8(raw: string | undefined): string {
	if (!raw) {
		return '';
	}
	try {
		return Buffer.from(raw, 'base64').toString('utf-8');
	} catch {
		return raw;
	}
}

/**
 * @brief Executes a code search against the Zoekt /api/search endpoint.
 * @param query Native Zoekt query string.
 * @param config Extension configuration containing server URL and defaults.
 * @param options Optional per-call overrides for maxResults and contextLines.
 * @return Parsed and base64-decoded ZoektSearchResult.
 */
export async function searchZoekt(
	query: string,
	config: ZoektConfig,
	options: SearchOptions = {}
): Promise<ZoektSearchResult> {
	const maxResults = options.maxResults ?? config.maxResults;
	const contextLines = options.contextLines ?? config.contextLines;

	const body = {
		Q: query,
		Opts: {
			MaxDocDisplayCount: maxResults,
			NumContextLines: contextLines
		}
	};

	const fetchUrl = `${config.url.replace(/\/$/, '')}/api/search`;

	const response = await fetch(fetchUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		let detail = `${response.status} ${response.statusText}`;
		try {
			const errJson = await response.json() as { Error?: string };
			if (errJson?.Error) {
				detail = errJson.Error;
			}
		} catch {
			// Keep HTTP status detail if error body is not JSON.
		}
		throw new Error(`Zoekt API error: ${detail}`);
	}

	const data = await response.json() as ZoektSearchResult;
	if (data.Result?.Files) {
		for (const file of data.Result.Files) {
			if (!Array.isArray(file.LineMatches)) {
				file.LineMatches = [];
				continue;
			}
			for (const match of file.LineMatches) {
				match.Line = decodeBase64Utf8(match.Line);
				if (match.Before) {
					match.Before = decodeBase64Utf8(match.Before);
				}
				if (match.After) {
					match.After = decodeBase64Utf8(match.After);
				}
			}
		}
	}

	return data;
}

/**
 * @brief Lists all indexed repositories from the Zoekt /api/list endpoint.
 * @param config Extension configuration containing server URL.
 * @return Sorted array of repository names.
 */
export async function listRepositories(config: ZoektConfig): Promise<string[]> {
	const fetchUrl = `${config.url.replace(/\/$/, '')}/api/list`;

	const response = await fetch(fetchUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		},
		body: JSON.stringify({ Q: '' })
	});

	if (!response.ok) {
		throw new Error(`Zoekt list API error: ${response.status} ${response.statusText}`);
	}

	const data = await response.json() as {
		List?: { Repos?: Array<{ Repository?: { Name?: string } }> };
		Repos?: Array<{ Repository?: { Name?: string } }>;
	};

	const repos = data.List?.Repos ?? data.Repos ?? [];
	return repos
		.map(r => r.Repository?.Name ?? '')
		.filter(name => name.length > 0)
		.sort((a, b) => a.localeCompare(b));
}
