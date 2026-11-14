import * as vscode from 'vscode';
import { ZoektConfig, PrefixItem } from './types';

/**
 * @brief Reads Zoekt extension configuration from VS Code workspace settings.
 * @return Normalized ZoektConfig object with defaults applied.
 */
export function getConfig(): ZoektConfig {
	const config = vscode.workspace.getConfiguration('zoekt');
	const rawPrefixes = config.get('prefix');

	let prefixes: PrefixItem[] = [];
	if (Array.isArray(rawPrefixes)) {
		prefixes = rawPrefixes;
	} else if (typeof rawPrefixes === 'string' && rawPrefixes.length > 0) {
		prefixes = [{ name: 'Default', prefix: rawPrefixes }];
	}

	const maxResults = Math.max(1, config.get<number>('maxResults', 50));
	const contextLines = Math.min(10, Math.max(0, config.get<number>('contextLines', 2)));

	return {
		url: config.get<string>('url', 'http://127.0.0.1:6070'),
		prefixes,
		maxResults,
		contextLines
	};
}
