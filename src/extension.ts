import * as vscode from 'vscode';
import { getConfig } from './config';
import { searchZoekt } from './zoekt';
import { ZoektResultProvider } from './resultsProvider';
import { registerLmTool } from './lm-tool';
import { registerChatParticipant } from './participant';

export function activate(context: vscode.ExtensionContext) {
	// Register LM Tool
	registerLmTool(context);

	// Register Chat Participant
	registerChatParticipant(context);

	const provider = new ZoektResultProvider();

	// Register the content provider for 'zoekt' scheme
	const providerRegistration = vscode.workspace.registerTextDocumentContentProvider('zoekt', provider);

	// Register the document link provider for 'zoekt' scheme to enable file links
	const linkProviderRegistration = vscode.languages.registerDocumentLinkProvider({ scheme: 'zoekt' }, provider);

	const selectPrefixCommand = vscode.commands.registerCommand('zoekt-vscode.selectPrefix', async () => {
		const config = getConfig();
		if (!config.prefixes || config.prefixes.length === 0) {
			vscode.window.showInformationMessage("No prefixes configured in 'zoekt.prefix'.");
			return;
		}

		const items = config.prefixes.map(p => ({ label: p.name, description: p.prefix, prefix: p.prefix }));
		items.unshift({ label: "None (All)", description: "", prefix: "" });

		const selection = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select a search scope/prefix'
		});

		if (selection) {
			await context.workspaceState.update('zoekt.activePrefix', selection.prefix);
			await context.workspaceState.update('zoekt.activePrefixName', selection.label);
			vscode.window.showInformationMessage(`Zoekt Prefix set to: ${selection.label}`);
		}
	});

	const searchCommand = vscode.commands.registerCommand('zoekt-vscode.search', async () => {
		const config = getConfig();

		let prefix = context.workspaceState.get<string>('zoekt.activePrefix', '');
		let prefixName = context.workspaceState.get<string>('zoekt.activePrefixName', 'None');

		// Show input box
		const query = await vscode.window.showInputBox({
			placeHolder: 'Search query (e.g. "foo bar" or "r:repo")',
			title: `Zoekt Search (Prefix: ${prefixName})`,
			prompt: `Enter query. Current prefix: ${prefix || '(none)'}`
		});

		if (!query) {
			return;
		}

		const fullQuery = prefix ? `${prefix} ${query}` : query;

		try {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Searching for "${fullQuery}"...`,
				cancellable: false
			}, async () => {
				const results = await searchZoekt(fullQuery, config);

				// Create a unique URI for this search
				const timestamp = new Date().getTime();
				const uri = vscode.Uri.parse(`zoekt:Search: ${query}?id=${timestamp}`);

				// Update the provider with results
				provider.update(uri, results);

				// Open the document
				const doc = await vscode.workspace.openTextDocument(uri);
				await vscode.window.showTextDocument(doc, { preview: false });
			});
		} catch (error: any) {
			vscode.window.showErrorMessage(`Zoekt search failed: ${error.message}`);
		}
	});

	const showMcpConfigCommand = vscode.commands.registerCommand('zoekt-vscode.showMcpConfig', async () => {
		const extensionPath = context.extensionPath;
		// Determine path to mcp-server.js based on production/dev mode.
		// Assuming standard compile puts it in ./dist/mcp-server.js or ./out/mcp-server.js
		// webpack config usually bundles 'main', we might need to adjust webpack to bundle mcp-server separately or just use tsc output.
		// For now, let's assume the user compiles with tsc for direct node usage or we bundle it.
		// If we use webpack, we need a separate entry point.

		// Let's assume it ends up in dist/mcp-server.js if we add it to webpack, or we just rely on the user running it derived from source if in dev.
		// But for a shipped extension, we need it bundled.

		// Ideally, we point to the absolute path of the file.
		const mcpScriptPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'mcp-server.js').fsPath;

		const config = {
			mcpServers: {
				"zoekt-vscode": {
					"command": "node",
					"args": [mcpScriptPath],
					"env": {
					}
				}
			}
		};

		const doc = await vscode.workspace.openTextDocument({
			content: JSON.stringify(config, null, 2),
			language: 'json'
		});
		await vscode.window.showTextDocument(doc);
		vscode.window.showInformationMessage('Copy this config to your MCP client (e.g. Claude Desktop config).');
	});

	context.subscriptions.push(providerRegistration, linkProviderRegistration, selectPrefixCommand, searchCommand, showMcpConfigCommand);
}

export function deactivate() { }
