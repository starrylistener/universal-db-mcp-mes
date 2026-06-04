# MCP stdio 模式动态数据库连接 — 已完成

## 问题描述

MCP stdio 模式下，数据库连接参数必须在 `claude_desktop_config.json` 中写死（`--type` 为必填项）。用户每次切换数据库都要改配置、重启服务，无法在对话中动态连接。

**Issue**: "数据库的连接方式能否通过自然语言指定而不是在配置 MCP 时写死"

## 问题根因

1. `src/mcp/mcp-index.ts` — `--type` 是 `requiredOption`，不传就无法启动
2. `src/mcp/mcp-server.ts` — 没有动态连接/断开/状态查询的 MCP tool

## 解决方案

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/mcp/mcp-server.ts` | 新增 3 个 tool，构造函数支持无 config 启动 |
| `src/mcp/mcp-index.ts` | `--type` 改为可选，支持无参启动 |

### 新增 3 个 MCP Tool

| Tool | 说明 |
|------|------|
| `connect_database` | 动态连接数据库，支持全部 17 种类型。已有连接时自动断开旧连接 |
| `disconnect_database` | 断开当前连接 |
| `get_connection_status` | 查看当前连接状态（类型、地址、权限模式、缓存状态） |

### 关键设计

- 构造函数 `config` 参数改为可选，`config` 类型改为 `DbConfig | null`
- `start()` 方法条件执行：有 adapter 则连接，无则以无连接模式启动
- 连接管理 tool（connect/disconnect/status）不检查数据库连接状态
- 数据操作 tool（execute_query 等）在未连接时返回引导信息："请先使用 connect_database 工具连接数据库"
- `connect_database` 内部复用已有的 `createAdapter()` 工厂函数，17 种适配器全部自动支持

## 兼容性

### 向后兼容

| 场景 | 改动前 | 改动后 |
|------|-------|-------|
| `--type mysql --host ...` 启动 | 正常 | 行为完全一致 |
| 不传 `--type` 启动 | 报错退出 | 无连接模式启动 |
| HTTP / SSE / Streamable 模式 | 正常 | 不受影响 |

### 17 种适配器

全部通过 `createAdapter()` 统一创建，`connect_database` 自动支持：mysql、postgres、redis、oracle、dm、sqlserver、mongodb、sqlite、kingbase、gaussdb、oceanbase、tidb、clickhouse、polardb、vastbase、highgo、goldendb。

### 4 种传输模式

| 传输模式 | 动态连接方式 |
|---------|------------|
| stdio（MCP） | `connect_database` tool（本次新增） |
| REST API（HTTP） | `POST /api/connect`（不受影响） |
| SSE | URL query 参数（不受影响） |
| Streamable HTTP | `X-DB-*` 请求头（不受影响） |

## 使用方式

### 零配置启动

```json
{
  "mcpServers": {
    "universal-db": {
      "command": "npx",
      "args": ["universal-db-mcp-mes"]
    }
  }
}
```

对话中说"帮我连接 192.168.1.100 的 MySQL"，AI 自动调用 `connect_database`。

### 带默认连接启动（向后兼容）

```json
{
  "mcpServers": {
    "universal-db": {
      "command": "npx",
      "args": ["universal-db-mcp-mes", "--type", "mysql", "--host", "localhost", "--port", "3306", "--user", "root", "--password", "xxx", "--database", "mydb"]
    }
  }
}
```

## 测试结果

- TypeScript 编译：通过
- 单元测试：88/88 通过，零回归
- MCP 协议集成测试（11 项）：全部通过
  - 无参启动 → 无连接模式正常
  - 有参启动 → 向后兼容正常
  - tool 列表 → 9 个（原 6 + 新增 3）
  - connect_database → 连接成功
  - get_connection_status → 状态正确
  - execute_query → 查询正常
  - get_schema → 结构正确
  - disconnect_database → 断开成功
  - 断开后查询 → 正确拒绝并引导
  - 重新连接 → 切换成功
  - 重连后查询 → 正常
