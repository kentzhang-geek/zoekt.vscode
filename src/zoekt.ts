import { ZoektConfig } from './config';

export interface SearchOptions {
    num?: number;
}

export interface ZoektSearchResult {
    Result: {
        Files: FileMatch[];
        // Stats fields are flattened into Result
        MatchCount: number;
        FileCount: number;
        [key: string]: any;
    };
}

export interface FileMatch {
    FileName: string;
    Repository: string;
    LineMatches: LineMatch[];
}

export interface LineMatch {
    Line: string;
    LineNumber: number;
    Before?: string;
    After?: string;
    FileName?: boolean;
}

export async function searchZoekt(query: string, config: ZoektConfig, options: SearchOptions = {}): Promise<ZoektSearchResult> {
    const body = {
        q: query,
        num: options.num ?? 50,
        Restrict: []
    };

    console.log(`[Zoekt] Searching: ${query} on ${config.url}`);

    try {
        const fetchUrl = `${config.url.replace(/\/$/, '')}/api/search`;
        console.log(`[Zoekt] Fetching ${fetchUrl} with body:`, JSON.stringify(body));

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
            console.log(`[Zoekt] Result keys: ${Object.keys(data.Result).join(', ')}`);
            if (data.Result.Files) {
                console.log(`[Zoekt] Found ${data.Result.Files.length} files`);
            } else {
                console.log(`[Zoekt] 'Files' array not found in Result!`);
            }
        }
        return data;
    } catch (error) {
        console.error('[Zoekt] Search exception:', error);
        throw error;
    }
}
