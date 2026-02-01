import * as vscode from 'vscode';
import { searchZoekt } from './zoekt';
import { getConfig } from './config';
import { ZoektConfig } from './types';

export function registerLmTool(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        // @ts-ignore
        vscode.lm.registerTool('zoekt-search', new ZoektSearchTool())
    );
}

// @ts-ignore
class ZoektSearchTool {
    async invoke(toolInvocation: any, token: vscode.CancellationToken): Promise<any> {
        const params = toolInvocation.input as { query: string; prefix?: string };
        const query = params.query;
        const prefix = params.prefix || "";

        // Get extension config (url, etc)
        const extConfig = getConfig();
        const config: ZoektConfig = {
            url: extConfig.url,
            prefixes: []
        };

        const fullQuery = prefix ? `${prefix} ${query}` : query;
        console.log(`[Zoekt Tool] Executing Search: "${fullQuery}"`);

        try {
            const results = await searchZoekt(fullQuery, config);

            if (!results.Result || !results.Result.Files || results.Result.Files.length === 0) {
                // @ts-ignore
                return new vscode.LanguageModelToolResult([
                    // @ts-ignore
                    new vscode.LanguageModelTextPart(`No results found for query: "${fullQuery}". Try a broader regex or check the prefix.`)
                ]);
            }

            const matchCount = results.Result.MatchCount;
            const fileCount = results.Result.FileCount;

            let markdown = `### Found ${matchCount} matches in ${fileCount} files\n\n`;

            // Limit output to prevent token overflow, maybe top 20 files?
            const files = results.Result.Files.slice(0, 20);

            for (const file of files) {
                markdown += `#### [${file.Repository}] ${file.FileName}\n`;
                markdown += "```\n";
                for (const match of file.LineMatches) {
                    markdown += `${match.LineNumber}: ${match.Line}\n`;
                }
                markdown += "```\n\n";
            }

            if (results.Result.Files.length > 20) {
                markdown += `\n*(...and ${results.Result.Files.length - 20} more files)*`;
            }

            // @ts-ignore
            return new vscode.LanguageModelToolResult([
                // @ts-ignore
                new vscode.LanguageModelTextPart(markdown)
            ]);

        } catch (err: any) {
            // @ts-ignore
            return new vscode.LanguageModelToolResult([
                // @ts-ignore
                new vscode.LanguageModelTextPart(`Error executing Zoekt search: ${err.message}`)
            ]);
        }
    }
}
