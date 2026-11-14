/**
 * @brief Represents a user-configured search prefix shortcut.
 */
export interface PrefixItem {
	name: string;
	prefix: string;
}

/**
 * @brief Extension configuration loaded from VS Code settings.
 */
export interface ZoektConfig {
	url: string;
	prefixes: PrefixItem[];
	maxResults: number;
	contextLines: number;
}

/**
 * @brief Segment of matching text within a matched line.
 */
export interface LineFragmentMatch {
	LineOffset: number;
	Offset?: number;
	MatchLength: number;
}

/**
 * @brief Represents a single line match returned by Zoekt.
 */
export interface LineMatch {
	Line: string;
	LineNumber: number;
	Before?: string;
	After?: string;
	FileName?: boolean;
	LineFragments?: LineFragmentMatch[];
}

/**
 * @brief Represents all matches within a single file.
 */
export interface FileMatch {
	FileName: string;
	Repository: string;
	LineMatches: LineMatch[];
	Branches?: string[];
	Language?: string;
}

/**
 * @brief Top-level search response returned by Zoekt /api/search.
 */
export interface ZoektSearchResult {
	Result: {
		Files: FileMatch[];
		MatchCount: number;
		FileCount: number;
		FilesSkipped?: number;
		ShardsScanned?: number;
		Duration?: number;
		[key: string]: unknown;
	};
}

/**
 * @brief Per-request search options overriding configuration defaults.
 */
export interface SearchOptions {
	maxResults?: number;
	contextLines?: number;
}
