import * as vscode from 'vscode';

export interface ZoektConfig {
    url: string;
    prefix: string;
}

export function getConfig(): ZoektConfig {
    const config = vscode.workspace.getConfiguration('zoekt');
    return {
        url: config.get<string>('url', 'http://127.0.0.1:6070'),
        prefix: config.get<string>('prefix', '')
    };
}
