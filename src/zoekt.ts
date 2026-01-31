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
                console.log(`[Zoekt] 'Files' array not found in Result!`);
            }
        }
        return data;
    } catch (error) {
        console.error('[Zoekt] Search exception:', error);
        throw error;
    }
}
