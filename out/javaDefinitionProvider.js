"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JavaDefinitionProvider = void 0;
const vscode = require("vscode");
const child_process_1 = require("child_process");
const ripgrep_1 = require("@vscode/ripgrep");
const EXCLUDE_DIRS = ['node_modules', '.git', 'out', 'dist', 'build', 'target'];
class JavaDefinitionProvider {
    async provideDefinition(document, position, token) {
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
        let locations;
        if (isMethodCall) {
            locations = await this.findMethodDefinition(word, document);
        }
        else if (isClassUsage || /^[A-Z]/.test(word)) {
            locations = await this.findClassDefinition(word, document);
        }
        else if (isFullClassName && document.languageId === 'xml') {
            locations = await this.findClassDefinition(word.substring(word.lastIndexOf('.') + 1), document);
        }
        else if (isBeanName) {
            locations = await this.findBeanDefinition(word, document);
        }
        if (!locations || locations.length === 0) {
            return undefined;
        }
        const seen = new Set();
        const uniqueLocations = locations.filter(loc => {
            const key = `${loc.uri.fsPath}#${loc.range.start.line}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
        if (uniqueLocations.length === 1) {
            return new vscode.Location(uniqueLocations[0].uri, new vscode.Range(uniqueLocations[0].range.start, uniqueLocations[0].range.start));
        }
        return uniqueLocations.map(loc => new vscode.Location(loc.uri, new vscode.Range(loc.range.start, loc.range.start)));
    }
    async findClassDefinition(className, originDocument) {
        const pattern = `\\b(class|interface|enum|record)\\s+${this.escapeRegExp(className)}\\b[\\s{]`;
        const results = await this.rgSearch(pattern, ['-g', '*.java']);
        return this.toLocations(results, originDocument);
    }
    async findMethodDefinition(methodName, originDocument) {
        // 匹配方法定义行：包含修饰符和方法名(
        const javaPattern = `^\\s*(?!.*\\breturn\\b)(?!.*=).*?\\b(public|private|protected|static|abstract|void|synchronized|native|strictfp)\\b.*?\\b${this.escapeRegExp(methodName)}\\s*\\(`;
        const javaResults = await this.rgSearch(javaPattern, ['-g', '*.java']);
        const xmlPattern = `id=["']${this.escapeRegExp(methodName)}["']`;
        const xmlResults = await this.rgSearch(xmlPattern, ['-g', '*.xml']);
        const locations = this.toLocations([...xmlResults], originDocument);
        // Java 方法定义需要从匹配行中精确定位方法名的列号
        for (const r of javaResults) {
            if (r.path.text === originDocument.uri.fsPath) {
                continue;
            }
            const lineText = r.lines.text;
            const idx = lineText.indexOf(methodName);
            if (idx >= 0) {
                locations.push(new vscode.Location(vscode.Uri.file(r.path.text), new vscode.Position(r.line_number - 1, idx)));
            }
        }
        return locations;
    }
    async provideReferences(document, position, context, token) {
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
        let locations;
        if (isMethodCall) {
            locations = await this.findMethodReferences(word, document);
        }
        if (!locations || locations.length === 0) {
            return undefined;
        }
        const seen = new Set();
        const uniqueLocations = locations.filter(loc => {
            const key = `${loc.uri.fsPath}#${loc.range.start.line}#${loc.range.start.character}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
        return uniqueLocations;
    }
    async findMethodReferences(methodName, originDocument) {
        const pattern = `\\b${this.escapeRegExp(methodName)}\\s*\\(`;
        const results = await this.rgSearch(pattern, ['-g', '*.java']);
        const locations = [];
        for (const r of results) {
            if (r.path.text === originDocument.uri.fsPath) {
                continue;
            }
            const lineText = r.lines.text;
            // 跳过方法定义行：包含修饰符且在同一行有 methodName(
            const isDefinition = /\b(public|private|protected|static|abstract|void|synchronized|native|strictfp)\b/.test(lineText) &&
                lineText.includes(methodName + '(');
            if (isDefinition) {
                continue;
            }
            for (const sub of r.submatches) {
                locations.push(new vscode.Location(vscode.Uri.file(r.path.text), new vscode.Position(r.line_number - 1, sub.start)));
            }
        }
        return locations;
    }
    async findBeanDefinition(beanName, originDocument) {
        const derivedClassName = beanName.charAt(0).toUpperCase() + beanName.slice(1);
        const locations = [];
        // 1. 类定义
        const classPattern = `\\b(class|interface|enum|record)\\s+${this.escapeRegExp(derivedClassName)}\\b[\\s{]`;
        const classResults = await this.rgSearch(classPattern, ['-g', '*.java']);
        locations.push(...this.toLocations(classResults, originDocument));
        // 2. Spring 注解类
        const springPattern = `@(Service|Component|Repository|Controller|RestController)\\b[\\s\\S]{0,200}\\b(class|interface)\\s+${this.escapeRegExp(derivedClassName)}\\b[\\s{]`;
        const springResults = await this.rgSearch(springPattern, ['-g', '*.java', '--multiline']);
        locations.push(...this.toLocations(springResults, originDocument));
        // 3. @Bean 方法
        const beanPattern = `@Bean\\b[\\s\\S]{0,100}?\\s${this.escapeRegExp(beanName)}\\s*\\(`;
        const beanResults = await this.rgSearch(beanPattern, ['-g', '*.java', '--multiline']);
        for (const r of beanResults) {
            if (r.path.text === originDocument.uri.fsPath) {
                continue;
            }
            const lineText = r.lines.text;
            const idx = lineText.indexOf(beanName);
            if (idx >= 0) {
                locations.push(new vscode.Location(vscode.Uri.file(r.path.text), new vscode.Position(r.line_number - 1, idx)));
            }
        }
        return locations;
    }
    toLocations(results, originDocument) {
        const locations = [];
        for (const r of results) {
            if (r.path.text === originDocument.uri.fsPath) {
                continue;
            }
            for (const sub of r.submatches) {
                const line = r.line_number - 1;
                const char = sub.start;
                locations.push(new vscode.Location(vscode.Uri.file(r.path.text), new vscode.Position(line, char)));
            }
        }
        return locations;
    }
    rgSearch(pattern, extraArgs) {
        return new Promise((resolve, reject) => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                resolve([]);
                return;
            }
            const args = [
                '--json',
                '--pcre2',
                '-n',
                '-o',
                ...EXCLUDE_DIRS.flatMap(d => ['-g', `!${d}`]),
                ...extraArgs,
                pattern,
                workspaceFolders[0].uri.fsPath
            ];
            const proc = (0, child_process_1.spawn)(ripgrep_1.rgPath, args, { windowsHide: true });
            const stdout = [];
            const stderr = [];
            proc.stdout.on('data', (data) => stdout.push(data));
            proc.stderr.on('data', (data) => stderr.push(data));
            proc.on('close', (code) => {
                if (code !== 0 && code !== 1) {
                    // code 1 means no matches, which is fine
                    const err = Buffer.concat(stderr).toString('utf-8');
                    reject(new Error(`ripgrep exited with ${code}: ${err}`));
                    return;
                }
                const output = Buffer.concat(stdout).toString('utf-8');
                const matches = [];
                for (const line of output.split(/\r?\n/)) {
                    if (!line.trim()) {
                        continue;
                    }
                    try {
                        const obj = JSON.parse(line);
                        if (obj.type === 'match') {
                            matches.push(obj.data);
                        }
                    }
                    catch {
                        // ignore malformed json lines
                    }
                }
                resolve(matches);
            });
            proc.on('error', (err) => reject(err));
        });
    }
    escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
exports.JavaDefinitionProvider = JavaDefinitionProvider;
//# sourceMappingURL=javaDefinitionProvider.js.map