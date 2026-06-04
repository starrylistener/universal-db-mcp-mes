# SQLite 使用指南

## 配置示例

### Claude Desktop 配置

```json
{
  "mcpServers": {
    "sqlite-local": {
      "command": "npx",
      "args": [
        "universal-db-mcp-mes",
        "--type", "sqlite",
        "--file", "/path/to/your/database.db"
      ]
    }
  }
}
```

### Windows 路径示例

```json
{
  "mcpServers": {
    "sqlite-app": {
      "command": "npx",
      "args": [
        "universal-db-mcp-mes",
        "--type", "sqlite",
        "--file", "C:\\Users\\YourName\\Documents\\myapp.db"
      ]
    }
  }
}
```

注意：Windows 路径中的反斜杠需要转义（使用 `\\`）。

### macOS/Linux 路径示例

```json
{
  "mcpServers": {
    "sqlite-notes": {
      "command": "npx",
      "args": [
        "universal-db-mcp-mes",
        "--type", "sqlite",
        "--file", "/Users/YourName/Documents/notes.db"
      ]
    }
  }
}
```

## 连接参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--file` | 数据库文件路径（必需） | - |

注意：SQLite 不需要 `--host`、`--port`、`--user`、`--password` 参数。

## 使用示例

### 查看表结构

```
用户: 查看数据库中有哪些表

Claude 会自动:
1. 调用 get_schema 工具
2. 执行 SELECT name FROM sqlite_master WHERE type='table'
3. 返回表列表
```

### 执行查询

```
用户: 统计每个分类的文章数量

Claude 会自动:
1. 生成 SQL: SELECT category, COUNT(*) as count FROM articles GROUP BY category
2. 执行并返回结果
```

## 常见使用场景

### 分析本地应用数据库

许多桌面应用使用 SQLite 存储数据：

- Chrome 浏览器历史记录
- Firefox 书签
- 各种笔记应用
- 移动应用备份

### 开发和测试

SQLite 非常适合本地开发和测试环境。

## 支持的特性

- ✅ 标准 SQL 查询
- ✅ 事务支持
- ✅ 索引和主键
- ✅ 外键约束
- ✅ PRAGMA 命令
- ✅ 全文搜索（FTS）
- ✅ JSON 扩展（SQLite 3.38+）

## 注意事项

1. **文件路径** - 必须使用绝对路径
2. **文件权限** - 确保有读取/写入权限
3. **并发访问** - SQLite 支持多读单写
4. **数据库锁** - 如果被其他程序占用可能遇到锁定错误
5. **自动创建** - 如果文件不存在会自动创建

## 驱动依赖

SQLite 驱动 `better-sqlite3` 需要编译。

**Windows:**
需要安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)。

**macOS:**
```bash
xcode-select --install
```

**Linux:**
```bash
sudo apt install build-essential
```

## 常见问题

### 数据库被锁定

确保没有其他程序正在使用该数据库文件。

### 文件不存在

检查文件路径是否正确，使用绝对路径。

### 编译错误

确保已安装编译工具（见驱动依赖部分）。
