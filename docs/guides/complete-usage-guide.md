# Universal DB MCP 完整使用指南

> 本指南面向实际使用者，涵盖从安装到生产的全链路配置与最佳实践。

---

## 目录

- [一、简介与适用场景](#一简介与适用场景)
- [二、安装方式](#二安装方式)
- [三、核心概念](#三核心概念)
- [四、MCP stdio 模式（AI 编辑器）](#四mcp-stdio-模式ai-编辑器)
- [五、HTTP API 模式（服务化部署）](#五http-api-模式服务化部署)
- [六、MCP over HTTP（SSE / Streamable HTTP）](#六mcp-over-httpsse--streamable-http)
- [七、权限与安全配置](#七权限与安全配置)
- [八、支持的数据库及连接示例](#八支持的数据库及连接示例)
- [九、环境变量完整参考](#九环境变量完整参考)
- [十、命令行参数完整参考](#十命令行参数完整参考)
- [十一、故障排查](#十一故障排查)
- [十二、卸载与清理](#十二卸载与清理)

---

## 一、简介与适用场景

Universal DB MCP 是一个实现了 **Model Context Protocol (MCP)** 的通用数据库连接器。它让 AI 助手（如 Claude、Cursor 等）能够通过自然语言与你的数据库对话。

**典型场景：**

| 场景 | 推荐模式 | 说明 |
|------|----------|------|
| 个人开发，用 Claude/Cursor 查数据 | MCP stdio | 零配置启动，对话中直接查询 |
| 团队共享，多客户端接入 | HTTP API + API Key | Dify、Coze、n8n、自定义客户端 |
| AI Agent 远程调用 | MCP SSE / Streamable HTTP | Dify、远程 Claude 等 |
| 批处理脚本 | HTTP REST API | curl、Python、Node.js 调用 |

**架构概览：**

```
┌─────────────────┐     ┌─────────────────────────────┐     ┌─────────────┐
│   AI 客户端      │────▶│    Universal DB MCP         │────▶│  数据库      │
│  (Claude/Cursor) │     │  ┌─────────┐  ┌──────────┐  │     │ (17种类型)   │
│  (Dify/Coze)     │     │  │MCP协议  │  │REST API  │  │     │             │
│  (自定义脚本)     │     │  │(stdio)  │  │(HTTP)    │  │     │             │
└─────────────────┘     │  └─────────┘  └──────────┘  │     └─────────────┘
                        └─────────────────────────────┘
```

---

## 二、安装方式

### 方式 A：npm 全局安装（推荐）

```bash
npm install -g universal-db-mcp-mes
```

验证安装：

```bash
universal-db-mcp-mes --version
universal-db-mcp-mes --help
```

### 方式 B：npx 直接运行（无需安装）

```bash
npx universal-db-mcp-mes --type mysql --host localhost ...
```

适合临时使用或 CI/CD 环境。

### 方式 C：本地 .tgz 包安装（内网/离线环境）

```bash
# 1. 获取 .tgz 包
npm pack

# 2. 在目标机器安装
npm install -g ./universal-db-mcp-mes-mes-0.0.3.tgz
```

### 方式 D：源码运行（开发调试）

```bash
git clone https://github.com/starrylistener/universal-db-mcp-mes.git
cd universal-db-mcp-mes
npm install
npm run build
npm run start:mcp   # MCP 模式
npm run start:http  # HTTP 模式
```

---

## 三、核心概念

### 3.1 两种运行模式

| 模式 | 启动命令 | 通信方式 | 适用客户端 |
|------|----------|----------|------------|
| **MCP stdio** | `universal-db-mcp-mes [参数]` | 标准输入输出 | Claude Desktop、Cursor、VS Code |
| **HTTP** | `MODE=http universal-db-mcp-mes` | HTTP / SSE | Dify、Coze、n8n、自定义客户端 |

### 3.2 MCP 工具清单

在 stdio 模式下，AI 客户端可以调用以下工具：

| 工具名 | 功能 | 风险等级 |
|--------|------|----------|
| `execute_query` | 执行 SQL 查询 | 依赖权限模式 |
| `get_schema` | 获取数据库完整结构（带缓存） | 只读 |
| `get_table_info` | 获取单表详细信息 | 只读 |
| `get_enum_values` | 获取某列唯一值列表 | 只读 |
| `get_sample_data` | 获取示例数据（自动脱敏） | 只读 |
| `clear_cache` | 清除 Schema 缓存 | 只读 |
| `connect_database` | 动态连接/切换数据库 | 只读 |
| `disconnect_database` | 断开当前连接 | 只读 |
| `get_connection_status` | 查看连接状态 | 只读 |
| `insert_exception_data` | 插入 Hzero 错误码数据 | 需写入权限 |

### 3.3 权限模式

默认 **safe（只读）**，通过 `--permission-mode` 控制：

| 模式 | 允许操作 | 适用场景 |
|------|----------|----------|
| `safe` | SELECT | 生产环境数据分析 |
| `readwrite` | SELECT, INSERT, UPDATE | 需要写入的业务场景 |
| `full` | 所有操作 | 开发/测试环境（危险） |
| `custom` | 自定义组合 | 精细化控制 |

---

## 四、MCP stdio 模式（AI 编辑器）

### 4.1 配置 Claude Desktop

**macOS 配置文件路径：**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows 配置文件路径：**
```
%APPDATA%\Claude\claude_desktop_config.json
```

### 4.2 方式一：带默认数据库启动

在配置中写死数据库连接参数，启动后自动连接：

```json
{
  "mcpServers": {
    "my-mysql": {
      "command": "universal-db-mcp-mes",
      "args": [
        "--type", "mysql",
        "--host", "localhost",
        "--port", "3306",
        "--user", "root",
        "--password", "your_password",
        "--database", "your_database",
        "--permission-mode", "safe"
      ]
    }
  }
}
```

重启 Claude Desktop 后，直接在对话中说：
- "帮我查看 users 表的结构"
- "统计最近 7 天的订单数量"
- "找出销量最高的 5 个产品"

### 4.3 方式二：零配置启动（动态连接）

不在配置中写死数据库参数，启动后由 AI 在对话中动态连接任意数据库：

```json
{
  "mcpServers": {
    "universal-db": {
      "command": "universal-db-mcp-mes"
    }
  }
}
```

然后在对话中直接说：
- "帮我连接 192.168.1.100 的 MySQL，用户名 root，密码 123456，数据库 order_db"
- "切换到 10.0.0.5 的 PostgreSQL，端口 5432"
- "断开当前数据库连接"

AI 会自动调用 `connect_database` / `disconnect_database` 工具。

### 4.4 多数据库同时配置

在 `mcpServers` 中定义多个配置：

```json
{
  "mcpServers": {
    "mysql-prod": {
      "command": "universal-db-mcp-mes",
      "args": ["--type", "mysql", "--host", "prod.db.com", "--port", "3306", "--user", "reader", "--password", "xxx", "--database", "orders"]
    },
    "postgres-dev": {
      "command": "universal-db-mcp-mes",
      "args": ["--type", "postgres", "--host", "dev.db.com", "--port", "5432", "--user", "postgres", "--password", "xxx", "--database", "dev_db"]
    },
    "redis-cache": {
      "command": "universal-db-mcp-mes",
      "args": ["--type", "redis", "--host", "cache.redis.com", "--port", "6379", "--password", "xxx"]
    }
  }
}
```

---

## 五、HTTP API 模式（服务化部署）

### 5.1 启动服务

**命令行启动：**

```bash
MODE=http HTTP_PORT=3000 API_KEYS=your-secret-key universal-db-mcp-mes
```

**使用 .env 文件启动（推荐）：**

创建 `.env` 文件：

```env
MODE=http
HTTP_PORT=3000
HTTP_HOST=0.0.0.0
API_KEYS=your-secret-key-1,your-secret-key-2
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1m
LOG_LEVEL=info
```

启动：

```bash
npx dotenv-cli -- universal-db-mcp-mes
```

### 5.2 核心 API 端点

| 端点 | 方法 | 说明 | 请求头 |
|------|------|------|--------|
| `/api/health` | GET | 健康检查 | - |
| `/api/info` | GET | 服务信息 | - |
| `/api/connect` | POST | 连接数据库 | `X-API-Key` |
| `/api/disconnect` | POST | 断开连接 | `X-API-Key` |
| `/api/query` | POST | 执行 SELECT 查询 | `X-API-Key` |
| `/api/execute` | POST | 执行查询（同 query） | `X-API-Key` |
| `/api/tables` | GET | 列出所有表 | `X-API-Key` |
| `/api/schema` | GET | 获取完整 Schema | `X-API-Key` |
| `/api/schema/:table` | GET | 获取单表信息 | `X-API-Key` |
| `/api/cache` | DELETE | 清除 Schema 缓存 | `X-API-Key` |
| `/api/enum-values` | GET | 获取列的枚举值 | `X-API-Key` |
| `/api/sample-data` | GET | 获取示例数据（已脱敏） | `X-API-Key` |
| `/api/insert-exception-data` | POST | 插入 Hzero 错误信息 | `X-API-Key` |

### 5.3 调用示例

**连接数据库：**

```bash
curl -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{
    "type": "mysql",
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "your_password",
    "database": "your_database"
  }'
```

返回示例：

```json
{
  "sessionId": "abc123",
  "status": "connected",
  "database": "your_database",
  "type": "mysql"
}
```

**执行查询：**

```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{
    "sessionId": "abc123",
    "query": "SELECT * FROM users LIMIT 5"
  }'
```

**获取 Schema：**

```bash
curl "http://localhost:3000/api/schema?sessionId=abc123" \
  -H "X-API-Key: your-secret-key"
```

**断开连接：**

```bash
curl -X POST http://localhost:3000/api/disconnect \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"sessionId": "abc123"}'
```

---

## 六、MCP over HTTP（SSE / Streamable HTTP）

HTTP 模式下，服务器同时暴露 MCP 协议端点，供 Dify 等远程平台使用。

### 6.1 SSE 端点（传统方式）

```
GET http://localhost:3000/sse?type=mysql&host=localhost&port=3306&user=root&password=xxx&database=mydb
```

适用于：Dify 旧版 MCP 节点、早期 MCP 客户端。

### 6.2 Streamable HTTP 端点（MCP 2025 规范，推荐）

```
POST http://localhost:3000/mcp
```

请求头：

```
X-DB-Type: mysql
X-DB-Host: localhost
X-DB-Port: 3306
X-DB-User: root
X-DB-Password: your_password
X-DB-Database: your_database
X-DB-Permission-Mode: safe
Content-Type: application/json
```

请求体：MCP JSON-RPC 请求。

**端点汇总：**

| 端点 | 方法 | 说明 |
|------|------|------|
| `/sse` | GET | 建立 SSE 连接（传统方式） |
| `/sse/message` | POST | 向 SSE 会话发送消息 |
| `/mcp` | POST | Streamable HTTP 端点（推荐） |
| `/mcp` | GET | Streamable HTTP 的 SSE 流 |
| `/mcp` | DELETE | 关闭会话 |

---

## 七、权限与安全配置

### 7.1 权限模式详解

默认 `safe`（只读），防止意外的数据修改。

| 模式 | 允许操作 | 命令行参数 | SSE Query | HTTP Header |
|------|----------|------------|-----------|-------------|
| `safe` | SELECT | `--permission-mode safe` | `permissionMode=safe` | `X-DB-Permission-Mode: safe` |
| `readwrite` | SELECT, INSERT, UPDATE | `--permission-mode readwrite` | `permissionMode=readwrite` | `X-DB-Permission-Mode: readwrite` |
| `full` | 所有操作 | `--permission-mode full` | `permissionMode=full` | `X-DB-Permission-Mode: full` |
| `custom` | 自定义 | `--permissions read,insert` | `permissions=read,insert` | `X-DB-Permissions: read,insert` |

**权限类型说明：**

- `read` — SELECT 查询（始终包含）
- `insert` — INSERT, REPLACE
- `update` — UPDATE
- `delete` — DELETE, TRUNCATE
- `ddl` — CREATE, ALTER, DROP, RENAME

### 7.2 安全最佳实践

1. **生产环境永远使用 `safe` 模式**，并为数据库创建只读账号
2. **使用强 API Key**，定期轮换
3. **通过 VPN 或跳板机连接**生产数据库
4. **启用速率限制**，防止暴力查询
5. **配置 CORS 白名单**，不要设置为 `*`
6. **定期审计查询日志**

### 7.3 数据脱敏

`get_sample_data` 工具会自动脱敏以下敏感字段：

- 手机号
- 邮箱地址
- 身份证号
- 银行卡号
- 密码/密钥字段

---

## 八、支持的数据库及连接示例

### 8.1 快速参考表

| 数据库 | 类型参数 | 默认端口 | 特殊参数 |
|--------|----------|----------|----------|
| MySQL | `mysql` | 3306 | - |
| PostgreSQL | `postgres` | 5432 | - |
| Redis | `redis` | 6379 | 无 database，可选 db 索引 |
| Oracle | `oracle` | 1521 | - |
| SQL Server | `sqlserver` | 1433 | - |
| MongoDB | `mongodb` | 27017 | `authSource=admin` |
| SQLite | `sqlite` | - | `--db-file-path` |
| 达梦 DM | `dm` | 5236 | 需安装 `dmdb` 驱动 |
| 人大金仓 | `kingbase` | 54321 | - |
| 华为 GaussDB | `gaussdb` | 5432 | - |
| 蚂蚁 OceanBase | `oceanbase` | 2881 | - |
| TiDB | `tidb` | 4000 | - |
| ClickHouse | `clickhouse` | 8123 | - |
| 阿里云 PolarDB | `polardb` | 3306 | 兼容 MySQL 协议 |
| 海量 Vastbase | `vastbase` | 5432 | - |
| 瀚高 HighGo | `highgo` | 5866 | - |
| 中兴 GoldenDB | `goldendb` | 3306 | 兼容 MySQL 协议 |

### 8.2 各数据库连接示例

**MySQL：**

```json
{
  "command": "universal-db-mcp-mes",
  "args": [
    "--type", "mysql",
    "--host", "localhost",
    "--port", "3306",
    "--user", "root",
    "--password", "your_password",
    "--database", "mydb"
  ]
}
```

**PostgreSQL：**

```json
{
  "command": "universal-db-mcp-mes",
  "args": [
    "--type", "postgres",
    "--host", "localhost",
    "--port", "5432",
    "--user", "postgres",
    "--password", "your_password",
    "--database", "mydb"
  ]
}
```

**Redis：**

```json
{
  "command": "universal-db-mcp-mes",
  "args": [
    "--type", "redis",
    "--host", "localhost",
    "--port", "6379",
    "--password", "your_password"
  ]
}
```

**Oracle：**

```json
{
  "command": "universal-db-mcp-mes",
  "args": [
    "--type", "oracle",
    "--host", "localhost",
    "--port", "1521",
    "--user", "system",
    "--password", "your_password",
    "--database", "ORCL"
  ]
}
```

**SQL Server：**

```json
{
  "command": "universal-db-mcp-mes",
  "args": [
    "--type", "sqlserver",
    "--host", "localhost",
    "--port", "1433",
    "--user", "sa",
    "--password", "your_password",
    "--database", "mydb"
  ]
}
```

**MongoDB：**

```json
{
  "command": "universal-db-mcp-mes",
  "args": [
    "--type", "mongodb",
    "--host", "localhost",
    "--port", "27017",
    "--user", "admin",
    "--password", "your_password",
    "--database", "mydb"
  ]
}
```

**SQLite：**

```json
{
  "command": "universal-db-mcp-mes",
  "args": [
    "--type", "sqlite",
    "--db-file-path", "/path/to/database.db"
  ]
}
```

**达梦 DM：**

```json
{
  "command": "universal-db-mcp-mes",
  "args": [
    "--type", "dm",
    "--host", "localhost",
    "--port", "5236",
    "--user", "SYSDBA",
    "--password", "your_password",
    "--database", "DAMENG"
  ]
}
```

> 注意：达梦数据库需要额外安装 `dmdb` 驱动包：`npm install dmdb`

---

## 九、环境变量完整参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MODE` | `mcp` | 运行模式：`mcp` 或 `http` |
| `HTTP_PORT` | `3000` | HTTP 服务端口 |
| `HTTP_HOST` | `0.0.0.0` | HTTP 服务监听地址 |
| `API_KEYS` | - | API Key，多个用逗号分隔 |
| `CORS_ORIGINS` | `*` | CORS 允许来源 |
| `CORS_CREDENTIALS` | `false` | 是否允许 CORS 携带凭证 |
| `RATE_LIMIT_MAX` | `100` | 速率限制最大请求数 |
| `RATE_LIMIT_WINDOW` | `1m` | 速率限制时间窗口 |
| `LOG_LEVEL` | `info` | 日志级别：`debug`, `info`, `warn`, `error` |
| `LOG_PRETTY` | `false` | 是否美化日志输出 |
| `SESSION_TIMEOUT` | `3600000` | Session 超时时间（毫秒） |
| `SESSION_CLEANUP_INTERVAL` | `300000` | Session 清理间隔（毫秒） |
| `DB_TYPE` | - | 默认数据库类型 |
| `DB_HOST` | - | 默认数据库主机 |
| `DB_PORT` | - | 默认数据库端口 |
| `DB_USER` | - | 默认数据库用户名 |
| `DB_PASSWORD` | - | 默认数据库密码 |
| `DB_DATABASE` | - | 默认数据库名 |
| `DB_FILE_PATH` | - | SQLite 数据库文件路径 |
| `DB_AUTH_SOURCE` | `admin` | MongoDB 认证源 |

---

## 十、命令行参数完整参考

| 参数 | 简写 | 说明 | 示例 |
|------|------|------|------|
| `--type` | - | 数据库类型 | `--type mysql` |
| `--host` | - | 数据库主机 | `--host localhost` |
| `--port` | - | 数据库端口 | `--port 3306` |
| `--user` | - | 用户名 | `--user root` |
| `--password` | - | 密码 | `--password xxx` |
| `--database` | - | 数据库名 | `--database mydb` |
| `--db-file-path` | - | SQLite 文件路径 | `--db-file-path ./data.db` |
| `--permission-mode` | - | 权限模式 | `--permission-mode safe` |
| `--permissions` | - | 自定义权限 | `--permissions read,insert` |
| `--version` | `-v` | 显示版本 | `--version` |
| `--help` | `-h` | 显示帮助 | `--help` |

**Hzero 定制参数：**

| 参数 | 说明 |
|------|------|
| `--error-table` | 错误码主表名 |
| `--error-tl-table` | 错误码多语言表名 |
| `--error-seq-name` | 序列名 |
| `--error-locales` | 支持的语言列表 |
| `--error-seq-suffix` | 序列后缀 |

---

## 十一、故障排查

### Q1: 安装后命令找不到？

```bash
# 检查 npm 全局 bin 目录是否在 PATH 中
npm bin -g

# 如果不在 PATH，手动添加到 .zshrc / .bashrc
export PATH="$(npm bin -g):$PATH"
```

### Q2: Claude Desktop 提示 MCP server 启动失败？

1. 确认 `universal-db-mcp-mes` 命令在终端可执行
2. 检查数据库连接参数是否正确
3. 查看 Claude Desktop 日志：`~/Library/Logs/Claude/mcp.log`（macOS）

### Q3: HTTP 模式下连接被拒绝？

1. 确认服务已启动：`curl http://localhost:3000/api/health`
2. 检查防火墙是否放行了对应端口
3. 确认 `HTTP_HOST` 不是 `127.0.0.1`（如果需要外部访问）

### Q4: Schema 获取很慢？

1. 首次获取后会自动缓存，后续查询会快很多
2. 可以手动清除缓存后重试：`curl -X DELETE http://localhost:3000/api/cache?sessionId=xxx`
3. 大型数据库（500+ 表）建议分 Schema 查询

### Q5: 中文显示乱码？

确保数据库连接字符集为 UTF-8：

```json
{
  "args": [
    "--type", "mysql",
    "--host", "localhost",
    "--user", "root",
    "--password", "xxx",
    "--database", "mydb?charset=utf8mb4"
  ]
}
```

---

## 十二、卸载与清理

```bash
# 卸载全局包
npm uninstall -g universal-db-mcp-mes

# 清除 npm 缓存
npm cache clean --force

# 删除本地源码（如果是源码安装）
rm -rf universal-db-mcp-mes
```

---

## 附录：相关文档

- [项目 README（中文）](../README.zh-CN.md)
- [项目 README（英文）](../README.md)
- [USAGE.md（.tgz 包安装专用）](../USAGE.md)
- [贡献指南](../CONTRIBUTING.md)
- [更新日志](../CHANGELOG.md)

---

<p align="center">
  基于 <a href="https://github.com/starrylistener/universal-db-mcp-mes">universal-db-mcp-mes</a> 构建
</p>
