我要实现一个vscode插件，用于在vscode中完成java代码的跳转功能
插件的名称为java-jump
只针对后缀名为.java或者.xml的文件(Mapper文件, 里面可能直接有java的类全路径), 点击ctrl+关键字,可以打开对应文件
比如:
```java
@Operation(summary = "查询灵感词配置分页列表")
@GetMapping("/inspiration/list")
public TableDataInfo list(InspirationWordQuery query) {
    startPage();
    List<InspirationWordVo> list = inspirationWordService.selectInspirationWordList(query);
    return getDataTable(list);
}
```
我提供的思路如下: 
- 点击类名: TableDataInfo, InspirationWordQuery InspirationWordVo这种, 全局搜索`class 类名 `, 最后有个空格, 一般只会有一个文件, 点击打开, 如果搜到多个文件, 则弹出选择框选择
- 点击方法名, 一般是.xxxxxx(), 全局搜索` xxxxxx(`, 前面有个空格, 一般只会有一个文件, 点击打开, 如果搜到多个文件, 则弹出选择框选择

还有其他情况我可能没有考虑到
