import * as vscode from 'vscode';
import { getConfig } from './config';
import { searchZoekt } from './zoekt';
import { ZoektResultProvider } from './resultsProvider';

export function activate(context: vscode.ExtensionContext) {
	const provider = new ZoektResultProvider();

	// Register the content provider for 'zoekt' scheme
	const providerRegistration = vscode.workspace.registerTextDocumentContentProvider('zoekt', provider);

	// Register the document link provider for 'zoekt' scheme to enable file links
	const linkProviderRegistration = vscode.languages.registerDocumentLinkProvider({ scheme: 'zoekt' }, provider);

	const commandRegistration = vscode.commands.registerCommand('zoekt-vscode.search', async () => {
		const config = getConfig();

		// Show input box
		const query = await vscode.window.showInputBox({
			placeHolder: 'Search query (e.g. "foo bar" or "r:repo")',
			prompt: 'Enter Zoekt search query'
		});

		if (!query) {
			return;
		}

		const fullQuery = config.prefix ? `${config.prefix} ${query}` : query;

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

	context.subscriptions.push(providerRegistration, linkProviderRegistration, commandRegistration);
}

export function deactivate() { }
