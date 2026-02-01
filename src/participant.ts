import * as vscode from 'vscode';
import { searchZoekt } from './zoekt';
import { getConfig } from './config';
import { ZoektConfig } from './types';

export function registerChatParticipant(context: vscode.ExtensionContext) {
    const participant = vscode.chat.createChatParticipant('zoekt-vscode.zoekt-participant', handler);
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'zoekt-icon.png'); // Placeholder if you have one
    context.subscriptions.push(participant);
}

// @ts-ignore
const handler: any = async (request, context, stream, token) => {
    stream.progress('Analyzing query...');

    // 1. Try to use an LM to refine the query into Regex
    let zoektQuery = request.prompt;

    // Simple heuristic: if it looks like natural language, try to convert it
    // Note: In a real implementation we would select a specific model family.
    // For now we will try to just run naive search, OR prompt the user to use regex.
    // To minimize complexity and dependencies, let's treat the prompt as the query directly first,
    // but maybe we can do a quick "smart" check.

    // "Smart" Check: If prompt has spaces and no special chars, assume it needs regexification
    if (zoektQuery.includes(' ') && !/[.*+?^${}()|[\]\\]/.test(zoektQuery)) {
        // Naive conversion: "foo bar" -> "(foo|bar)" or "foo.*bar"?
        // Let's assume user wants connection.
        // For now, let's just search!
    }

    console.log(`[Zoekt Participant] Executing Search: "${zoektQuery}"`);
    stream.progress(`Searching Zoekt for: ${zoektQuery}`);

    const extConfig = getConfig();
    const config: ZoektConfig = {
        url: extConfig.url,
        prefixes: []
    };

    try {
        const results = await searchZoekt(zoektQuery, config);

        if (!results.Result || !results.Result.Files || results.Result.Files.length === 0) {
            stream.markdown(`No results found for **${zoektQuery}**.\n\n*Tip: Try using Regex like \`(init|setup).+context\`*`);
            return;
        }

        const matchCount = results.Result.MatchCount;
        const fileCount = results.Result.FileCount;

        stream.markdown(`### Found ${matchCount} matches in ${fileCount} files\n\n`);

        const files = results.Result.Files.slice(0, 15); // Limit to top 15 for chat UI

        for (const file of files) {
            stream.markdown(`#### [${file.Repository}] ${file.FileName}\n`);
            stream.markdown("```\n");
            for (const match of file.LineMatches) {
                stream.markdown(`${match.LineNumber}: ${match.Line}\n`);
            }
            stream.markdown("```\n\n");
        }

        if (results.Result.Files.length > 15) {
            stream.markdown(`\n*(...and ${results.Result.Files.length - 15} more files)*`);
        }

    } catch (err: any) {
        stream.markdown(`**Error:** ${err.message}`);
    }
};
