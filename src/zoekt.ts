import { ZoektConfig } from './config';

export interface SearchOptions {
    num?: number;
}

export interface ZoektSearchResult {
    Result: {
        FileMatches: FileMatch[];
        Stats: {
            MatchCount: number;
            FileCount: number;
        };
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

    try {
        const response = await fetch(`${config.url.replace(/\/$/, '')}/api/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Zoekt API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as ZoektSearchResult;
        return data;
    } catch (error) {
        console.error('Zoekt search failed:', error);
        throw error;
    }
}
