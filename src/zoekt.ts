import { ZoektConfig, SearchOptions, ZoektSearchResult, FileMatch, LineMatch } from './types';

export async function searchZoekt(query: string, config: ZoektConfig, options: SearchOptions = {}): Promise<ZoektSearchResult> {
    const body = {
        q: query,
        num: options.num ?? 50,
        Restrict: []
    };

    console.error(`[Zoekt] Searching: ${query} on ${config.url}`);

    try {
        const fetchUrl = `${config.url.replace(/\/$/, '')}/api/search`;
        console.error(`[Zoekt] Fetching ${fetchUrl} with body:`, JSON.stringify(body));

        const response = await fetch(fetchUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            console.error(`[Zoekt] API error: ${response.status} ${response.statusText}`);
            throw new Error(`Zoekt API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as ZoektSearchResult;
        // Detailed logging for debugging structure
        if (data.Result) {
            console.error(`[Zoekt] Result keys: ${Object.keys(data.Result).join(', ')}`);
            if (data.Result.Files) {
                console.error(`[Zoekt] Found ${data.Result.Files.length} files`);

                // Decode potentially base64 encoded lines
                for (const file of data.Result.Files) {
                    for (const match of file.LineMatches) {
                        try {
                            if (match.Line) {
                                // Attempt to decode base64. Zoekt often returns base64.
                                // We check if it looks like base64 or just try to decode.
                                const decoded = Buffer.from(match.Line, 'base64').toString('utf-8');
                                // Basic validation: if decoded length is smaller than original * 0.75, it's likely base64.
                                // Or simply trust it. 
                                match.Line = decoded;
                            }
                        } catch (e) {
                            // Keep original if decoding fails
                        }
                    }
                }
            } else {
                console.error(`[Zoekt] 'Files' array not found in Result!`);
            }
        }
        return data;
    } catch (error) {
        console.error('[Zoekt] Search exception:', error);
        throw error;
    }
}

export async function listRepositories(config: ZoektConfig): Promise<string[]> {
    const fetchUrl = `${config.url.replace(/\/$/, '')}/api/list`;
    console.error(`[Zoekt] Listing repos from ${fetchUrl}`);

    try {
        const response = await fetch(fetchUrl, {
            method: 'POST', // zoekt /api/list usually accepts POST with optional filters, or GET. Let's try simple POST with empty object or simple filters if needed.
            // Based on generic zoekt, /api/list often takes {q: ...} to filter list.
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ q: "" }) // List all
        });

        if (!response.ok) {
            console.warn(`[Zoekt] List repos failed: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json() as any;
        // Expected structure from zoekt /api/list: { List: { Repos: [...] } } or just { Repos: [...] } depending on version/client.
        // Standard Go zoekt returns:
        // type ListResponse struct { Repos []*RepoListEntry }
        // type RepoListEntry struct { Repository, IndexMetadata... }

        let repos: any[] = [];
        if (data.List && data.List.Repos) {
            repos = data.List.Repos;
        } else if (data.Repos) {
            repos = data.Repos;
        }

        return repos.map((r: any) => r.Repository.Name);

    } catch (error) {
        console.error('[Zoekt] List repositories exception:', error);
        return [];
    }
}
