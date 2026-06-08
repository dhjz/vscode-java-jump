# Java Jump

一个用于 VS Code 的轻量级 Java 代码跳转插件，支持在 `.java` 和 `.xml` 文件中快速跳转到类定义、方法定义以及 Spring Bean 声明。

## 功能

- **类名跳转**：点击类名（如 `TableDataInfo`）跳转到类定义
- **方法名跳转**：点击方法调用（如 `selectInspirationWordList()`）跳转到方法定义
- **XML 映射跳转**：支持 MyBatis Mapper XML 中的 `id="方法名"` 跳转
- **Spring Bean 跳转**：点击 Bean 名称（如 `inspirationWordService`）跳转到 `@Service`/`@Component` 等声明类
- **多结果支持**：多个匹配时显示 VS Code 自带的 Peek 视图供选择

## 安装

### 本地安装

1. 克隆或下载本仓库
2. 运行 `npm install`
3. 运行 `npm run build` 生成 `dist/java-jump-0.0.1.vsix`
4. 在 VS Code 中按 `Ctrl+Shift+P`，输入 `Extensions: Install from VSIX...`
5. 选择生成的 `.vsix` 文件

### 命令行安装

```bash
code --install-extension dist/java-jump-0.0.1.vsix
```

## 使用

在 `.java` 或 `.xml` 文件中，按住 `Ctrl` 点击目标符号即可跳转：

```java
@Operation(summary = "查询灵感词配置分页列表")
@GetMapping("/inspiration/list")
public TableDataInfo list(InspirationWordQuery query) {
    startPage();
    List<InspirationWordVo> list = inspirationWordService.selectInspirationWordList(query);
    return getDataTable(list);
}
```

- 点击 `TableDataInfo` → 跳转到类定义
- 点击 `selectInspirationWordList` → 跳转到方法定义（支持 Java 和 XML）
- 点击 `inspirationWordService` → 跳转到 Spring Bean 声明

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 调试
按 F5 启动 Extension Development Host

# 打包
npm run build
```

## 排除目录

默认排除以下目录：

- `node_modules/`
- `.git/`
- `out/`
- `dist/`
- `build/`
- `target/`

## 要求

- VS Code >= 1.85.0

## License

MIT
