# universal-db-mcp-mes

基于 [universal-db-mcp](https://github.com/Anarkh-Lee/universal-db-mcp) 的定制版本，在保留原项目全部能力的基础上，新增 **Hzero 平台错误信息维护**等企业级功能。

> **原项目致谢**：Universal DB MCP 由 [Anarkh-Lee](https://github.com/Anarkh-Lee) 创建并开源，提供了强大的 MCP 数据库连接能力。本项目在其基础上进行定制开发，所有核心架构、数据库适配器和安全机制均继承自原项目。

---

## 核心能力概览

| 维度 | 说明 |
|------|------|
| **数据库支持** | 17 种数据库，涵盖 MySQL、PostgreSQL、Redis、Oracle、SQL Server、MongoDB、SQLite 及 10 种国产数据库（达梦、人大金仓、GaussDB、OceanBase、TiDB、ClickHouse、PolarDB、Vastbase、HighGo、GoldenDB） |
| **运行模式** | MCP stdio 模式（Claude Desktop / Cursor 等）、HTTP API 模式（REST / SSE / Streamable HTTP） |
| **MCP 工具** | 10 个内置工具，覆盖查询执行、Schema 获取、连接管理、错误码注册等 |
| **HTTP 端点** | 10+ REST API，支持健康检查、连接管理、查询执行、Schema 操作、示例数据获取 |
| **安全机制** | 默认只读，支持 safe / readwrite / full / custom 四级权限模式，数据自动脱敏 |
| **性能优化** | Schema 缓存（TTL 可配，默认 5 分钟）、批量查询优化、连接池与断线重连 |

---

## 快速开始

### 安装

```bash
npm install -g universal-db-mcp-mes
```

### MCP 模式（Claude Desktop / Cursor）

在 Claude Desktop 配置中添加：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "my-database": {
      "command": "npx",
      "args": [
        "universal-db-mcp-mes",
        "--type", "mysql",
        "--host", "localhost",
        "--port", "3306",
        "--user", "root",
        "--password", "your_password",
        "--database", "your_database"
      ]
    }
  }
}
```

**零配置启动**（动态连接）：

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

然后在对话中让 AI 调用 `connect_database` 工具动态连接任意数据库。

### HTTP API 模式

```bash
# 设置环境变量
export MODE=http
export HTTP_PORT=3000
export API_KEYS=your-secret-key

# 启动服务
npx universal-db-mcp-mes
```

```bash
# 测试 API
curl http://localhost:3000/api/health
```

---

## MCP 工具清单

| 工具名 | 说明 |
|--------|------|
| `execute_query` | 执行 SELECT 查询（仅只读，写操作被硬限制禁止） |
| `get_schema` | 获取数据库完整结构，含表、列、索引、关系（带缓存） |
| `get_table_info` | 获取单表详细信息，支持 `schema.table_name` 格式 |
| `get_enum_values` | 获取指定列的所有唯一值，辅助生成 WHERE 条件 |
| `get_sample_data` | 获取表示例数据（自动脱敏敏感字段） |
| `clear_cache` | 清除 Schema 缓存 |
| `connect_database` | 动态连接/切换数据库，支持全部 17 种类型 |
| `disconnect_database` | 断开当前数据库连接 |
| `get_connection_status` | 查看当前连接状态及缓存命中率 |
| `insert_exception_data` | **（定制）** 向 Hzero 平台注册错误码及多语言提示 |

---

## REST API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/info` | GET | 服务信息 |
| `/api/connect` | POST | 连接数据库 |
| `/api/disconnect` | POST | 断开连接 |
| `/api/query` | POST | 执行查询（仅 SELECT） |
| `/api/execute` | POST | 执行查询（仅 SELECT，与 `/api/query` 行为一致） |
| `/api/tables` | GET | 列出所有表 |
| `/api/schema` | GET | 获取完整 Schema |
| `/api/schema/:table` | GET | 获取单表信息 |
| `/api/cache` | DELETE | 清除 Schema 缓存 |
| `/api/cache/status` | GET | 获取缓存状态 |
| `/api/enum-values` | GET | 获取列的枚举值 |
| `/api/sample-data` | GET | 获取示例数据（已脱敏） |
| `/api/insert-exception-data` | POST | **（定制）** 插入 Hzero 错误信息 |
| `/sse` | GET | SSE 连接（传统 MCP over HTTP） |
| `/sse/message` | POST | 向 SSE 会话发送消息 |
| `/mcp` | POST / GET / DELETE | Streamable HTTP 端点（MCP 2025 规范） |

---

## 定制功能：Hzero 错误信息维护

本版本新增 `insert_exception_data` 工具，用于向 Hzero 平台错误信息表批量注册错误码及其多语言内容。

### 使用场景

当用户描述业务场景并提到以下情境时，AI 应主动调用此工具：
- "xxx 时报错 xxx"
- "需要抛出一个错误"
- "新增错误码"
- "消息维护"

### 工作流程

1. AI 根据业务上下文生成候选 `MESSAGE_CODE`（格式：`模块名.模块描述_递增编号`，全大写）
2. AI 向用户展示候选编码及各语言翻译内容
3. 用户确认后，AI 调用 `insert_exception_data`
4. 工具自动完成：
   - 从 `mt_sys_sequence` 批量生成唯一 `MESSAGE_ID`（带 FOR UPDATE 锁防并发冲突）
   - 向主表（如 `mt_error_message`）批量插入
   - 向多语言表（如 `mt_error_message_tl`）批量插入
   - 自动填充租户 ID、审计字段、初始标识

### CLI 配置参数

```bash
npx universal-db-mcp-mes \
  --type mysql \
  --host localhost \
  --port 3306 \
  --user root \
  --password xxx \
  --database hzero_platform \
  --permission-mode readwrite \
  --error-table mt_error_message \
  --error-tl-table mt_error_message_tl \
  --error-seq-name mt_error_message_s \
  --error-locales zh_CN,en_US \
  --error-seq-suffix 001
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--error-table` | 错误信息主表名 | - |
| `--error-tl-table` | 多语言表名 | - |
| `--error-database` | 表所在数据库 / schema | - |
| `--error-seq-name` | 序列表 `NAME` 值 | `mt_error_message_s` |
| `--error-locales` | 多语言列表（逗号分隔） | `zh_CN,en_US` |
| `--error-seq-suffix` | 序列表 ID 后缀 | `001` |
| `--error-multilang` | 启用多语言模式 | `false` |

### REST API 调用

```bash
curl -X POST http://localhost:3000/api/insert-exception-data \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{
    "sessionId": "your-session-id",
    "data": [
      {
        "MESSAGE_CODE": "HME.WORKING_PART_NEW_044",
        "MESSAGE": ["连接超时", "Connection timeout"]
      }
    ]
  }'
```

---

## 安全与权限

默认只读模式，通过 `--permission-mode` 控制：

| 模式 | 允许操作 | 说明 |
|------|----------|------|
| `safe`（默认） | SELECT | 只读，最安全 |
| `readwrite` | SELECT, INSERT, UPDATE | 读写但不能删除 |
| `full` | 所有操作 | 完全控制（危险！） |
| `custom` | 自定义 | 通过 `--permissions` 指定 |

`insert_exception_data` 需要 `insert` 权限，因此使用此功能时需配置 `--permission-mode readwrite` 或更高。

---

## 架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    universal-db-mcp-mes                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  启动模式：                                                               │
│  ┌────────────────────────────┬────────────────────────────────────┐    │
│  │ MCP stdio 模式             │ HTTP API 模式                      │    │
│  └─────────────┬──────────────┴───────────────┬────────────────────┘    │
│                │                              │                          │
│                ▼                              ▼                          │
│  ┌─────────────────────────┐    ┌───────────────────────────────────┐   │
│  │      MCP 协议层         │    │           HTTP 服务器             │   │
│  │    (stdio 传输)         │    │                                   │   │
│  │                         │    │  ┌─────────────────────────────┐  │   │
│  │  10 个工具：             │    │  │       MCP 协议              │  │   │
│  │  • execute_query        │    │  │  (SSE / Streamable HTTP)    │  │   │
│  │  • get_schema           │    │  │                             │  │   │
│  │  • get_table_info       │    │  │  工具：（与 stdio 相同）    │  │   │
│  │  • clear_cache          │    │  │  • insert_exception_data    │  │   │
│  │  • get_enum_values      │    │  └──────────────┬──────────────┘  │   │
│  │  • get_sample_data      │    │                 │                 │   │
│  │  • connect_database     │    │  ┌──────────────┴──────────────┐  │   │
│  │  • disconnect_database  │    │  │        REST API             │  │   │
│  │  • get_connection_status│    │  │  • /api/query               │  │   │
│  │  • insert_exception_data│    │  │  • /api/schema              │  │   │
│  │                         │    │  │  • /api/insert-exception-data│  │   │
│  └─────────────┬───────────┘    │  │  • ...（10+ 端点）          │  │   │
│                │                │  └──────────────┬──────────────┘  │   │
│                └────────────────┼─────────────────┼─────────────────┘   │
│                                 │                 │                     │
│                                 ▼                 │                     │
│  ┌────────────────────────────────────────────────┴─────────────────┐  │
│  │                       DatabaseService（核心业务层）               │  │
│  │  • 查询执行（SELECT 硬限制）  • Schema 缓存（TTL）               │  │
│  │  • 安全校验（权限模式）        • 数据脱敏                       │  │
│  │  • Schema 增强（关系推断）     • 错误码批量插入（事务）         │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     ▼                                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      数据库适配器层（17 种）                       │  │
│  │  MySQL │ PostgreSQL │ Redis │ Oracle │ MongoDB │ SQLite │ ...    │  │
│  │          （连接池 + TCP Keep-Alive + 断线自动重试）               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 环境变量配置

复制 `.env.example` 为 `.env` 并按需配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MODE` | 运行模式：`mcp` 或 `http` | `mcp` |
| `HTTP_PORT` | HTTP 服务端口 | `3000` |
| `HTTP_HOST` | HTTP 监听地址 | `0.0.0.0` |
| `API_KEYS` | API 密钥（逗号分隔） | - |
| `RATE_LIMIT_MAX` | 限流请求数 | `100` |
| `RATE_LIMIT_WINDOW` | 限流时间窗口 | `1m` |
| `LOG_LEVEL` | 日志级别 | `info` |
| `SESSION_TIMEOUT` | 会话超时（毫秒） | `3600000` |
| `SESSION_CLEANUP_INTERVAL` | 会话清理间隔（毫秒） | `300000` |

---

## 开发

```bash
# 克隆仓库
git clone <this-repo>

# 安装依赖
npm install

# 构建
npm run build

# 开发模式（MCP）
npm run dev:mcp

# 开发模式（HTTP）
npm run dev:http

# 运行测试
npm test
```

---

## 文档索引

- [中文完整文档](./README.zh-CN.md)（继承自原项目，含 55+ 平台集成指南）
- [安装指南](./docs/getting-started/installation.md)
- [配置说明](./docs/getting-started/configuration.md)
- [API 参考](./docs/http-api/API_REFERENCE.md)
- [部署指南](./docs/deployment/)
- [CHANGELOG](./CHANGELOG.md)

---

## 开源协议

本项目采用 [MIT 许可证](./LICENSE)。

原项目 [universal-db-mcp](https://github.com/Anarkh-Lee/universal-db-mcp) 由 Anarkh-Lee 创建并开源，遵循 MIT 许可证。
