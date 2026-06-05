# universal-db-mcp-mes 使用文档

> 本文档描述通过本地 `.tgz` 包安装后的完整使用方式。

---

## 一、安装

### 1.1 下载包

下载最新版本的 `.tgz` 文件：
### 1.2 全局安装

```bash
npm install -g ./universal-db-mcp-mes-mes-0.0.2.tgz
```

### 1.3 验证安装

```bash
# 查看版本
universal-db-mcp-mes --version

# 查看帮助
universal-db-mcp-mes --help
```

安装成功后，系统会注册 `universal-db-mcp-mes` 全局命令。

---

## 二、运行模式

安装后支持两种运行模式：

| 模式 | 启动方式 | 适用场景 |
|------|----------|----------|
| **MCP stdio** | `universal-db-mcp-mes [数据库参数]` | Claude Desktop、Cursor、VS Code 等 |
| **HTTP API** | `MODE=http universal-db-mcp-mes` | Dify、Coze、n8n、自定义客户端 |

---

## 三、MCP stdio 模式（AI 编辑器）

### 3.1 方式 A：带默认数据库启动

安装后直接配置到 Claude Desktop，启动时自动连接指定数据库。

**Claude Desktop 配置**（macOS）：

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`：

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
        "--database", "your_database"
      ]
    }
  }
}
```

**Windows** 配置文件路径：`%APPDATA%\Claude\claude_desktop_config.json`

重启 Claude Desktop 后即可使用。

### 3.2 方式 B：零配置启动（动态连接）

不在配置中写死数据库参数，启动后由 AI 在对话中动态连接任意数据库。

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

### 3.3 可用的 MCP 工具

| 工具名 | 功能 |
|--------|------|
| `execute_query` | 执行 SELECT 查询（只读，写操作被硬限制禁止） |
| `get_schema` | 获取数据库完整结构（表、列、索引、关系），带缓存 |
| `get_table_info` | 获取单表详细信息，支持 `schema.table_name` 格式 |
| `get_enum_values` | 获取某列的所有唯一值，辅助生成 WHERE 条件 |
| `get_sample_data` | 获取表示例数据（自动脱敏敏感字段） |
| `clear_cache` | 清除 Schema 缓存 |
| `connect_database` | 动态连接/切换数据库（支持全部 17 种类型） |
| `disconnect_database` | 断开当前连接 |
| `get_connection_status` | 查看连接状态及缓存命中率 |
| `insert_exception_data` | **定制**：向 Hzero 平台注册错误码及多语言内容 |

---

## 四、HTTP API 模式

### 4.1 启动服务

```bash
MODE=http HTTP_PORT=3000 API_KEYS=your-secret-key universal-db-mcp-mes
```

或使用 `.env` 文件：

```bash
# .env
MODE=http
HTTP_PORT=3000
API_KEYS=your-secret-key
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1m
```

```bash
# 加载 .env 后启动
npx dotenv-cli -- universal-db-mcp-mes
```

### 4.2 核心 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/info` | GET | 服务信息 |
| `/api/connect` | POST | 连接数据库（返回 sessionId） |
| `/api/disconnect` | POST | 断开连接 |
| `/api/query` | POST | 执行 SELECT 查询 |
| `/api/execute` | POST | 执行查询（同 `/api/query`） |
| `/api/tables` | GET | 列出所有表 |
| `/api/schema` | GET | 获取完整 Schema |
| `/api/schema/:table` | GET | 获取单表信息 |
| `/api/cache` | DELETE | 清除 Schema 缓存 |
| `/api/enum-values` | GET | 获取列的枚举值 |
| `/api/sample-data` | GET | 获取示例数据（已脱敏） |
| `/api/insert-exception-data` | POST | **定制**：插入 Hzero 错误信息 |
| `/sse` | GET | SSE 连接（传统 MCP over HTTP） |
| `/mcp` | POST/GET/DELETE | Streamable HTTP（MCP 2025 规范） |

### 4.3 调用示例

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

**执行查询：**

```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{
    "sessionId": "xxx",
    "query": "SELECT * FROM users LIMIT 5"
  }'
```

**获取 Schema：**

```bash
curl "http://localhost:3000/api/schema?sessionId=xxx"
```

---

## 五、定制功能：Hzero 消息维护

### 5.1 使用场景

当业务对话涉及以下情境时，AI 会主动调用 `insert_exception_data`：
- "xxx 时报错 xxx"
- "需要抛出一个错误"
- "新增错误码"
- "消息维护"

### 5.2 MCP stdio 配置

在 Claude Desktop 配置中增加 Hzero 相关参数：

```json
{
  "mcpServers": {
    "hzero-db": {
      "command": "universal-db-mcp-mes",
      "args": [
        "--type", "mysql",
        "--host", "localhost",
        "--port", "3306",
        "--user", "root",
        "--password", "your_password",
        "--database", "hzero_platform",
        "--permission-mode", "readwrite",
        "--error-table", "mt_error_message",
        "--error-tl-table", "mt_error_message_tl",
        "--error-seq-name", "mt_error_message_s",
        "--error-locales", "zh_CN,en_US",
        "--error-seq-suffix", "001"
      ]
    }
  }
}
```

> 注意：`insert_exception_data` 需要 `insert` 权限，因此 `--permission-mode` 不能是默认的 `safe`。

### 5.3 工作流程

1. 用户描述业务报错场景
2. AI 生成候选 `MESSAGE_CODE`（格式：`模块名.模块描述_递增编号`，如 `HME.WORKING_PART_NEW_044`）
3. AI 展示候选编码和各语言翻译，征得用户确认
4. AI 调用 `insert_exception_data`
5. 工具自动完成：
   - 批量从 `mt_sys_sequence` 生成唯一 `MESSAGE_ID`（带 `FOR UPDATE` 锁防并发冲突）
   - 向主表 `mt_error_message` 批量插入
   - 向多语言表 `mt_error_message_tl` 批量插入
   - 自动填充租户 ID、审计字段、初始标识
   - 失败自动回滚事务

### 5.4 HTTP API 调用

```bash
curl -X POST http://localhost:3000/api/insert-exception-data \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{
    "sessionId": "xxx",
    "data": [
      {
        "MESSAGE_CODE": "HME.WORKING_PART_NEW_044",
        "MESSAGE": ["连接超时", "Connection timeout"]
      }
    ]
  }'
```

---

## 六、安全与权限

默认只读模式，通过 `--permission-mode` 控制：

| 模式 | 允许操作 | 说明 |
|------|----------|------|
| `safe`（默认） | SELECT | 只读，最安全 |
| `readwrite` | SELECT, INSERT, UPDATE | 读写但不能删除 |
| `full` | 所有操作 | 完全控制（危险！） |
| `custom` | 自定义 | 通过 `--permissions` 指定 |

**权限类型：**
- `read` - SELECT 查询
- `insert` - INSERT, REPLACE
- `update` - UPDATE
- `delete` - DELETE, TRUNCATE
- `ddl` - CREATE, ALTER, DROP, RENAME

**使用 Hzero 功能时**必须使用 `readwrite` 或更高权限，因为需要 `insert` 权限。

---

## 七、支持的数据库

| 数据库 | 类型参数 | 默认端口 |
|--------|----------|----------|
| MySQL | `mysql` | 3306 |
| PostgreSQL | `postgres` | 5432 |
| Redis | `redis` | 6379 |
| Oracle | `oracle` | 1521 |
| SQL Server | `sqlserver` | 1433 |
| MongoDB | `mongodb` | 27017 |
| SQLite | `sqlite` | - |
| 达梦 | `dm` | 5236 |
| 人大金仓 | `kingbase` | 54321 |
| 华为 GaussDB | `gaussdb` | 5432 |
| 蚂蚁 OceanBase | `oceanbase` | 2881 |
| TiDB | `tidb` | 4000 |
| ClickHouse | `clickhouse` | 8123 |
| 阿里云 PolarDB | `polardb` | 3306 |
| 海量 Vastbase | `vastbase` | 5432 |
| 瀚高 HighGo | `highgo` | 5866 |
| 中兴 GoldenDB | `goldendb` | 3306 |

---

## 八、常见问题

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

### Q3: 如何同时使用多个数据库？

在 `mcpServers` 中定义多个配置：

```json
{
  "mcpServers": {
    "mysql-db": {
      "command": "universal-db-mcp-mes",
      "args": ["--type", "mysql", "--host", "..."]
    },
    "postgres-db": {
      "command": "universal-db-mcp-mes",
      "args": ["--type", "postgres", "--host", "..."]
    }
  }
}
```

### Q4: HTTP 模式下如何更新 Schema 缓存？

```bash
curl -X DELETE "http://localhost:3000/api/cache?sessionId=xxx"
```

---

## 九、卸载

```bash
npm uninstall -g universal-db-mcp-mes
```

---

<p align="center">
  基于 <a href="https://github.com/Anarkh-Lee/universal-db-mcp">universal-db-mcp</a> 定制开发
</p>
