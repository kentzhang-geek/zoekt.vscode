export interface PrefixItem {
    name: string;
    prefix: string;
}

export interface ZoektConfig {
    url: string;
    prefixes: PrefixItem[];
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

export interface SearchOptions {
    num?: number;
}
