import * as vscode from 'vscode';
import { JavaDefinitionProvider } from './javaDefinitionProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new JavaDefinitionProvider();

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            { scheme: 'file', pattern: '**/*.java' },
            provider
        )
    );

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            { scheme: 'file', pattern: '**/*.xml' },
            provider
        )
    );

    context.subscriptions.push(
        vscode.languages.registerReferenceProvider(
            { scheme: 'file', pattern: '**/*.java' },
            provider
        )
    );

    // 注册命令用于多结果选择跳转
    context.subscriptions.push(
        vscode.commands.registerCommand('javaJump.pickLocation', async (locations: vscode.Location[]) => {
            if (!locations || locations.length === 0) {
                return;
            }
            if (locations.length === 1) {
                const loc = locations[0];
                const doc = await vscode.workspace.openTextDocument(loc.uri);
                const editor = await vscode.window.showTextDocument(doc);
                editor.selection = new vscode.Selection(loc.range.start, loc.range.start);
                editor.revealRange(new vscode.Range(loc.range.start, loc.range.start), vscode.TextEditorRevealType.InCenter);
                return;
            }

            const items = locations.map((loc, index) => {
                const fileName = vscode.workspace.asRelativePath(loc.uri);
                const line = loc.range.start.line + 1;
                return {
                    label: `${fileName}:${line}`,
                    description: loc.uri.fsPath,
                    index
                };
            });

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `找到 ${locations.length} 个定义，请选择要跳转的位置`
            });

            if (selected) {
                const loc = locations[selected.index];
                const doc = await vscode.workspace.openTextDocument(loc.uri);
                const editor = await vscode.window.showTextDocument(doc);
                editor.selection = new vscode.Selection(loc.range.start, loc.range.start);
                editor.revealRange(new vscode.Range(loc.range.start, loc.range.start), vscode.TextEditorRevealType.InCenter);
            }
        })
    );
}

export function deactivate() {}
