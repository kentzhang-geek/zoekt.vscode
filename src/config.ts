import * as vscode from 'vscode';

export interface PrefixItem {
    name: string;
    prefix: string;
}

export interface ZoektConfig {
    url: string;
    prefixes: PrefixItem[];
}

export function getConfig(): ZoektConfig {
    const config = vscode.workspace.getConfiguration('zoekt');
    const rawPrefixes = config.get('prefix');

    let prefixes: PrefixItem[] = [];
    if (Array.isArray(rawPrefixes)) {
        prefixes = rawPrefixes;
    } else if (typeof rawPrefixes === 'string' && rawPrefixes.length > 0) {
        // Handle legacy string configuration
        prefixes = [{ name: "Default", prefix: rawPrefixes }];
    }

    return {
        url: config.get<string>('url', 'http://127.0.0.1:6070'),
        prefixes: prefixes
    };
}
