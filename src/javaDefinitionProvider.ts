import * as vscode from 'vscode';

const EXCLUDE_PATTERN = '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/build/**,**/target/**}';

export class JavaDefinitionProvider implements vscode.DefinitionProvider, vscode.ReferenceProvider {
    private fileCache = new Map<string, { text: string; mtime: number }>();

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.LocationLink[] | undefined> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }

        const word = document.getText(wordRange);
        if (!word || word.length < 2) {
            return undefined;
        }

        const lineText = document.lineAt(position).text;
        const linePrefix = lineText.substring(0, wordRange.end.character);
        const lineSuffix = lineText.substring(wordRange.end.character);

        const isMethodCall = /^\s*\(/.test(lineSuffix);
        const isClassUsage = /\b(new|extends|implements|class|interface|enum|@)\s+$/.test(linePrefix) ||
                             /[<(,;:=\s]\s*$/.test(linePrefix);
        const isFullClassName = word.includes('.') && /^[a-zA-Z0-9_.]+$/.test(word);
        const isBeanName = /^[a-z][a-zA-Z0-9]*$/.test(word) && !isMethodCall && !isClassUsage && !isFullClassName;

        let locations: vscode.Location[] | undefined;

        if (isMethodCall) {
            locations = await this.findMethodDefinition(word, document);
        } else if (isClassUsage || /^[A-Z]/.test(word)) {
            locations = await this.findClassDefinition(word, document);
        } else if (isFullClassName && document.languageId === 'xml') {
            locations = await this.findClassDefinition(word.substring(word.lastIndexOf('.') + 1), document);
        } else if (isBeanName) {
            locations = await this.findBeanDefinition(word, document);
        }

        if (!locations || locations.length === 0) {
            return undefined;
        }

        // 去重
        const seen = new Set<string>();
        const uniqueLocations = locations.filter(loc => {
            const key = `${loc.uri.fsPath}#${loc.range.start.line}`;
            if (seen.has(key)) { return false; }
            seen.add(key);
            return true;
        });

        if (uniqueLocations.length === 1) {
            return new vscode.Location(uniqueLocations[0].uri, new vscode.Range(uniqueLocations[0].range.start, uniqueLocations[0].range.start));
        }

        // 多结果时返回所有，让 VS Code 自带 peek 视图处理，不弹 QuickPick
        return uniqueLocations.map(loc => new vscode.Location(loc.uri, new vscode.Range(loc.range.start, loc.range.start)));
    }

    private async findClassDefinition(className: string, originDocument: vscode.TextDocument): Promise<vscode.Location[]> {
        const files = await vscode.workspace.findFiles('**/*.java', EXCLUDE_PATTERN, 500);
        const locations: vscode.Location[] = [];

        for (const file of files) {
            if (file.fsPath === originDocument.uri.fsPath) { continue; }
            const text = await this.getFileText(file);
            if (!text) { continue; }

            const regex = new RegExp(`\\b(class|interface|enum|record)\\s+${this.escapeRegExp(className)}\\b[\\s{]`, 'g');
            let match;
            while ((match = regex.exec(text)) !== null) {
                const pos = this.offsetToPosition(text, match.index + match[0].indexOf(className));
                locations.push(new vscode.Location(file, pos));
            }
        }
        return locations;
    }

    private async findMethodDefinition(methodName: string, originDocument: vscode.TextDocument): Promise<vscode.Location[]> {
        const files = await vscode.workspace.findFiles('**/*.{java,xml}', EXCLUDE_PATTERN, 500);
        const locations: vscode.Location[] = [];

        for (const file of files) {
            const text = await this.getFileText(file);
            if (!text) { continue; }

            if (file.fsPath.endsWith('.xml')) {
                // XML 中匹配 id="方法名"
                const xmlRegex = new RegExp(`id=["']${this.escapeRegExp(methodName)}["']`, 'g');
                let match;
                while ((match = xmlRegex.exec(text)) !== null) {
                    const pos = this.offsetToPosition(text, match.index + match[0].indexOf(methodName));
                    locations.push(new vscode.Location(file, pos));
                }
            } else {
                // Java 中匹配方法定义
                const regex = new RegExp(`([\\r\\n]|^)(?!.*=)(?!.*\\breturn\\b).*?\\b(public|private|protected|static|abstract|void|synchronized|native|strictfp)\\b.*?(\\s|~)${this.escapeRegExp(methodName)}\\s*\\(`, 'g');
                let match;
                while ((match = regex.exec(text)) !== null) {
                    const methodPos = match[0].lastIndexOf(methodName);
                    const pos = this.offsetToPosition(text, match.index + methodPos);
                    locations.push(new vscode.Location(file, pos));
                }
            }
        }
        return locations;
    }

    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[] | undefined> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }

        const word = document.getText(wordRange);
        if (!word || word.length < 2) {
            return undefined;
        }

        const lineText = document.lineAt(position).text;
        const lineSuffix = lineText.substring(wordRange.end.character);
        const isMethodCall = /^\s*\(/.test(lineSuffix);

        let locations: vscode.Location[] | undefined;

        if (isMethodCall) {
            locations = await this.findMethodReferences(word, document);
        }

        if (!locations || locations.length === 0) {
            return undefined;
        }

        const seen = new Set<string>();
        const uniqueLocations = locations.filter(loc => {
            const key = `${loc.uri.fsPath}#${loc.range.start.line}#${loc.range.start.character}`;
            if (seen.has(key)) { return false; }
            seen.add(key);
            return true;
        });

        return uniqueLocations;
    }

    private async findMethodReferences(methodName: string, originDocument: vscode.TextDocument): Promise<vscode.Location[]> {
        const files = await vscode.workspace.findFiles('**/*.java', EXCLUDE_PATTERN, 500);
        const locations: vscode.Location[] = [];

        for (const file of files) {
            if (file.fsPath === originDocument.uri.fsPath) { continue; }
            const text = await this.getFileText(file);
            if (!text) { continue; }

            const lines = text.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!line.includes(methodName)) { continue; }

                // 跳过方法定义行（与 findMethodDefinition 的正则匹配相反）
                const isDefinition = /\b(public|private|protected|static|abstract|void|synchronized|native|strictfp)\b.*?\b${this.escapeRegExp(methodName)}\s*\(/.test(line);
                if (isDefinition) { 
                    continue; 
                }

                // 匹配方法调用: methodName(
                const callRegex = new RegExp(`\\b${this.escapeRegExp(methodName)}\\s*\\(`, 'g');
                let callMatch;
                while ((callMatch = callRegex.exec(line)) !== null) {
                    locations.push(new vscode.Location(file, new vscode.Position(i, callMatch.index)));
                }
            }
        }
        return locations;
    }

    private async findBeanDefinition(beanName: string, originDocument: vscode.TextDocument): Promise<vscode.Location[]> {
        const derivedClassName = beanName.charAt(0).toUpperCase() + beanName.slice(1);
        const files = await vscode.workspace.findFiles('**/*.java', EXCLUDE_PATTERN, 500);
        const locations: vscode.Location[] = [];

        for (const file of files) {
            if (file.fsPath === originDocument.uri.fsPath) { continue; }
            const text = await this.getFileText(file);
            if (!text) { continue; }

            const classRegex = new RegExp(`\\b(class|interface|enum|record)\\s+${this.escapeRegExp(derivedClassName)}\\b[\\s{]`, 'g');
            let match;
            while ((match = classRegex.exec(text)) !== null) {
                const pos = this.offsetToPosition(text, match.index + match[0].indexOf(derivedClassName));
                locations.push(new vscode.Location(file, pos));
            }

            const springAnnotationRegex = new RegExp(
                `@(Service|Component|Repository|Controller|RestController)\\b[\\s\\S]{0,200}\\b(class|interface)\\s+${this.escapeRegExp(derivedClassName)}\\b[\\s{]`,
                'g'
            );
            while ((match = springAnnotationRegex.exec(text)) !== null) {
                const pos = this.offsetToPosition(text, match.index + match[0].indexOf(derivedClassName));
                locations.push(new vscode.Location(file, pos));
            }

            const beanMethodRegex = new RegExp(`@Bean\\b[\\s\\S]{0,100}?\\s${this.escapeRegExp(beanName)}\\s*\\(`, 'g');
            while ((match = beanMethodRegex.exec(text)) !== null) {
                const methodPos = match[0].lastIndexOf(beanName);
                const pos = this.offsetToPosition(text, match.index + methodPos);
                locations.push(new vscode.Location(file, pos));
            }
        }
        return locations;
    }

    private async getFileText(uri: vscode.Uri): Promise<string | undefined> {
        const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === uri.fsPath);
        if (openDoc) {
            return openDoc.getText();
        }
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            const cached = this.fileCache.get(uri.fsPath);
            if (cached && cached.mtime === stat.mtime) {
                return cached.text;
            }
            const content = await vscode.workspace.fs.readFile(uri);
            const text = Buffer.from(content).toString('utf-8');
            this.fileCache.set(uri.fsPath, { text, mtime: stat.mtime });
            return text;
        } catch {
            return undefined;
        }
    }

    private offsetToPosition(text: string, offset: number): vscode.Position {
        const lines = text.substring(0, offset).split(/\r?\n/);
        const line = lines.length - 1;
        const character = lines[lines.length - 1].length;
        return new vscode.Position(line, character);
    }

    private escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
