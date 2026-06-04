# MCP stdio 模式动态数据库连接方案 — 完整实施计划

## 一、问题描述

当前 MCP stdio 模式下，数据库连接参数必须在 Claude Desktop 的 `claude_desktop_config.json` 中写死。用户每次需要连接不同的数据库时，必须手动修改配置文件并重启 MCP 服务，无法在对话中动态切换。

**Issue 来源**: 用户反馈"数据库的连接方式能否通过自然语言指定而不是在配置 MCP 时写死"

**用户痛点**:
1. dev 环境下需要对接多种多样的数据库，每次切换都要改配置、重启
2. 一个 MCP 实例只能绑定一个数据库，无法在对话中灵活切换
3. 希望 AI 能自己读取用户提供的连接信息，动态连接数据库

---

## 二、问题分析

### 2.1 现状梳理

项目有两种运行模式，连接方式完全不同：

| 模式 | 连接方式 | 是否支持动态连接 |
|------|---------|---------------|
| MCP stdio | CLI 参数写死，`--type`为必填项 | 不支持 |
| HTTP REST API | `POST /api/connect` body 传参 | 支持 |
| HTTP SSE | `GET /sse?type=mysql&host=...` URL 传参 | 支持 |
| HTTP Streamable | `POST /mcp` 请求头 `X-DB-*` 传参 | 支持 |

### 2.2 问题根因

问题集中在 **2 个文件**：

#### 根因 1：`src/mcp/mcp-index.ts` — `--type` 是 requiredOption

```typescript
program
  .requiredOption('--type <type>', '数据库类型 (mysql|postgres|...)')
```

不传 `--type` 就无法启动 MCP server，强制要求启动时就确定数据库。

#### 根因 2：`src/mcp/mcp-server.ts` — 没有动态连接的 tool

`DatabaseMCPServer` 类：
- 构造函数 `constructor(config: DbConfig, ...)` 要求必传 `DbConfig`
- `setupHandlers()` 中只注册了 6 个 tool（execute_query、get_schema、get_table_info、clear_cache、get_enum_values、get_sample_data），没有连接/断开/状态查询相关的 tool
- 现有 tool 在未连接时的错误提示是"请检查配置并重启服务"，没有引导 AI 调用连接 tool

### 2.3 为什么 HTTP 模式不受影响

HTTP 模式通过 `ConnectionManager`（`src/core/connection-manager.ts`）管理多会话，每个请求可以携带不同的数据库配置。而 MCP stdio 是单进程单客户端模型，没有这层动态管理能力。

### 2.4 影响范围

- 所有 17 种数据库适配器均受影响（它们本身没有问题，问题在上层入口）
- 仅影响 MCP stdio 模式，HTTP/SSE/Streamable 模式不受影响
- 适配器列表：mysql、postgres、redis、oracle、dm、sqlserver、mongodb、sqlite、kingbase、gaussdb、oceanbase、tidb、clickhouse、polardb、vastbase、highgo、goldendb

---

## 三、解决了什么问题

1. MCP stdio 模式下可以不写死数据库连接，启动时不需要指定 `--type`
2. AI 可以在对话中通过 tool call 动态连接任意数据库
3. 支持在对话中随时切换到不同的数据库（自动断开旧连接）
4. 向后兼容：传了 `--type` 参数的用户行为完全不变

---

## 四、用户层面使用差异

### 4.1 改动前（当前行为）

用户必须在 `claude_desktop_config.json` 中写死数据库参数：

```json
{
  "mcpServers": {
    "universal-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp-mes",
        "--type", "mysql",
        "--host", "192.168.1.100",
        "--port", "3306",
        "--user", "root",
        "--password", "123456",
        "--database", "order_db"
      ]
    }
  }
}
```

想查另一个数据库？改配置，重启 Claude Desktop。

### 4.2 改动后（新行为）

**方式 A：零配置启动（新增能力）**

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

然后在对话中直接说：
- "帮我连接 192.168.1.100 的 MySQL，用户名 root，密码 123456，数据库 order_db"
- "切换到 10.0.0.5 的 PostgreSQL，端口 5432，数据库 analytics"
- "断开当前数据库连接"
- "当前连的是哪个数据库？"

AI 会自动调用 `connect_database`、`disconnect_database`、`get_connection_status` tool。

**方式 B：带默认连接启动（向后兼容，行为不变）**

```json
{
  "mcpServers": {
    "universal-db": {
      "command": "npx",
      "args": ["universal-db-mcp-mes", "--type", "mysql", "--host", "localhost", ...]
    }
  }
}
```

启动时自动连接指定数据库，对话中仍可通过 `connect_database` 切换到其他数据库。

---

## 五、用户使用指南

### 5.1 MCP stdio 模式（Claude Desktop / Codex CLI）

**场景 1：不知道要连哪个库，对话中再决定**

配置：
```json
{ "command": "npx", "args": ["universal-db-mcp-mes"] }
```

对话示例：
```
用户：帮我查一下测试环境 MySQL 里 orders 表最近 7 天的订单量
AI：我需要先连接数据库，请提供连接信息（地址、端口、用户名、密码、数据库名）
用户：192.168.1.100:3306，root/123456，数据库 test_db
AI：[调用 connect_database] → 连接成功
AI：[调用 get_schema] → 获取表结构
AI：[调用 execute_query] → SELECT COUNT(*) FROM orders WHERE ...
```

**场景 2：对话中切换数据库**

```
用户：现在帮我看看生产环境 PostgreSQL 的 users 表
AI：[调用 connect_database 切换到新数据库] → 已断开 MySQL，连接 PostgreSQL 成功
AI：[调用 execute_query] → ...
```

**场景 3：查看当前连接状态**

```
用户：我现在连的是哪个库？
AI：[调用 get_connection_status] → 当前连接：MySQL 192.168.1.100:3306/test_db，只读模式
```

### 5.2 HTTP / SSE / Streamable 模式

这些模式不受本次改动影响，使用方式不变。

---

## 六、最佳最优解决方案

### 6.1 改动文件清单

| 文件 | 改动类型 | 改动说明 |
|------|---------|---------|
| `src/mcp/mcp-server.ts` | 修改 | 核心改动：新增 3 个 tool，构造函数支持无 config 启动 |
| `src/mcp/mcp-index.ts` | 修改 | `--type` 从 requiredOption 改为 option，支持无参启动 |

仅改 2 个文件，不涉及适配器层、HTTP 层、类型定义层的任何改动。

### 6.2 详细改动方案

#### 改动 1：`src/mcp/mcp-server.ts`

**1a) 新增 import**

```typescript
import { createAdapter, normalizeDbType } from '../utils/adapter-factory.js';
```

**1b) 构造函数 — config 改为可选**

```typescript
// 改前
constructor(config: DbConfig, cacheConfig?: Partial<SchemaCacheConfig>) {
  this.config = config;
  // ...
}

// 改后
constructor(config?: DbConfig, cacheConfig?: Partial<SchemaCacheConfig>) {
  this.config = config || null;  // null 表示未配置，等待动态连接
  // ...
}
```

对应 `private config: DbConfig` 改为 `private config: DbConfig | null`。

**1c) ListToolsRequestSchema — 新增 3 个 tool 定义**

在现有 tools 数组中追加：

```typescript
{
  name: 'connect_database',
  description: '连接到数据库。支持动态指定数据库类型和连接参数，无需重启服务。' +
    '如果当前已有连接，会自动断开旧连接再建立新连接。' +
    '支持的数据库类型：mysql, postgres, redis, oracle, dm, sqlserver, mongodb, sqlite, ' +
    'kingbase, gaussdb, oceanbase, tidb, clickhouse, polardb, vastbase, highgo, goldendb。',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: '数据库类型',
        enum: [
          'mysql', 'postgres', 'redis', 'oracle', 'dm', 'sqlserver',
          'mongodb', 'sqlite', 'kingbase', 'gaussdb', 'oceanbase',
          'tidb', 'clickhouse', 'polardb', 'vastbase', 'highgo', 'goldendb'
        ],
      },
      host: { type: 'string', description: '数据库主机地址' },
      port: { type: 'number', description: '数据库端口' },
      user: { type: 'string', description: '用户名' },
      password: { type: 'string', description: '密码' },
      database: { type: 'string', description: '数据库名称' },
      filePath: { type: 'string', description: 'SQLite 数据库文件路径' },
      allowWrite: { type: 'boolean', description: '是否允许写操作（默认 false）' },
      permissionMode: {
        type: 'string',
        description: '权限模式: safe(只读) | readwrite(读写不删) | full(完全控制)',
        enum: ['safe', 'readwrite', 'full'],
      },
      authSource: { type: 'string', description: 'MongoDB 认证数据库（默认 admin）' },
      oracleClientPath: { type: 'string', description: 'Oracle Instant Client 路径' },
    },
    required: ['type'],
  },
},
{
  name: 'disconnect_database',
  description: '断开当前数据库连接。断开后需要重新调用 connect_database 才能执行查询。',
  inputSchema: {
    type: 'object',
    properties: {},
  },
},
{
  name: 'get_connection_status',
  description: '获取当前数据库连接状态。返回是否已连接、数据库类型、地址、数据库名、权限模式等信息。',
  inputSchema: {
    type: 'object',
    properties: {},
  },
},
```

**1d) CallToolRequestSchema — 新增 3 个 case 实现**

```typescript
case 'connect_database': {
  const {
    type, host, port, user, password, database,
    filePath, allowWrite, permissionMode, authSource, oracleClientPath,
  } = args as Record<string, any>;

  // 构建新配置
  const newConfig: DbConfig = {
    type: normalizeDbType(type),
    host,
    port,
    user,
    password,
    database,
    filePath,
    allowWrite: allowWrite || false,
    permissionMode: permissionMode || 'safe',
  };

  // MongoDB 特殊配置
  if (newConfig.type === 'mongodb' && authSource) {
    (newConfig as any).authSource = authSource;
  }

  // Oracle 特殊配置
  if (newConfig.type === 'oracle' && oracleClientPath) {
    newConfig.oracleClientPath = oracleClientPath;
  }

  // 断开旧连接
  if (this.adapter) {
    console.error('🔄 断开旧数据库连接...');
    if (this.databaseService) {
      this.databaseService.clearSchemaCache();
    }
    await this.adapter.disconnect();
    this.adapter = null;
    this.databaseService = null;
  }

  // 建立新连接
  console.error(`🔌 正在连接 ${newConfig.type} 数据库...`);
  const adapter = createAdapter(newConfig);
  await adapter.connect();

  this.adapter = adapter;
  this.config = newConfig;
  this.databaseService = new DatabaseService(adapter, newConfig, this.cacheConfig);

  const connInfo = newConfig.type === 'sqlite'
    ? `SQLite: ${newConfig.filePath}`
    : `${newConfig.type}: ${newConfig.host}:${newConfig.port}/${newConfig.database || '(default)'}`;

  console.error(`✅ 数据库连接成功: ${connInfo}`);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        message: `已成功连接到 ${connInfo}`,
        connection: {
          type: newConfig.type,
          host: newConfig.host,
          port: newConfig.port,
          database: newConfig.database,
          permissionMode: newConfig.permissionMode || 'safe',
        },
      }, null, 2),
    }],
  };
}

case 'disconnect_database': {
  if (!this.adapter) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, message: '当前没有活跃的数据库连接' }, null, 2),
      }],
    };
  }

  if (this.databaseService) {
    this.databaseService.clearSchemaCache();
  }
  await this.adapter.disconnect();

  const oldType = this.config?.type;
  this.adapter = null;
  this.config = null;
  this.databaseService = null;

  console.error('👋 数据库连接已断开');

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        message: `已断开 ${oldType || ''} 数据库连接`,
      }, null, 2),
    }],
  };
}

case 'get_connection_status': {
  if (!this.adapter || !this.config) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          connected: false,
          message: '当前未连接任何数据库。请使用 connect_database 工具连接。',
        }, null, 2),
      }],
    };
  }

  const status: Record<string, any> = {
    connected: true,
    type: this.config.type,
    permissionMode: this.config.permissionMode || 'safe',
  };

  if (this.config.type === 'sqlite') {
    status.filePath = this.config.filePath;
  } else {
    status.host = this.config.host;
    status.port = this.config.port;
    status.database = this.config.database;
  }

  if (this.databaseService) {
    const cacheStats = this.databaseService.getCacheStats();
    status.schemaCache = {
      cached: cacheStats.isCached,
      hitRate: this.databaseService.getCacheHitRate() + '%',
    };
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(status, null, 2),
    }],
  };
}
```

**1e) 现有 tool 的未连接提示优化**

将现有的未连接判断：

```typescript
// 改前
if (!this.databaseService) {
  throw new Error('数据库未连接。请检查配置并重启服务。');
}

// 改后
if (!this.databaseService) {
  throw new Error('数据库未连接。请先使用 connect_database 工具连接数据库。');
}
```

**1f) `start()` 方法 — 初始连接改为可选**

```typescript
// 改前
async start(): Promise<void> {
  await this.connectDatabase();
  const transport = new StdioServerTransport();
  await this.server.connect(transport);
  console.error('🚀 MCP 服务器已启动，等待 Claude Desktop 连接...');
}

// 改后
async start(): Promise<void> {
  // 如果有初始配置和适配器，先连接；否则等待 AI 调用 connect_database
  if (this.adapter) {
    await this.connectDatabase();
  } else {
    console.error('📡 MCP 服务器以无连接模式启动，等待通过 connect_database 工具连接数据库...');
  }
  const transport = new StdioServerTransport();
  await this.server.connect(transport);
  console.error('🚀 MCP 服务器已启动，等待客户端连接...');
}
```

#### 改动 2：`src/mcp/mcp-index.ts`

**2a) `--type` 从 requiredOption 改为 option**

```typescript
// 改前
.requiredOption('--type <type>', '数据库类型 (mysql|postgres|...)')

// 改后
.option('--type <type>', '数据库类型 (mysql|postgres|...)。不指定则以无连接模式启动，可在对话中通过 connect_database 动态连接。')
```

**2b) action 中处理无 type 的情况**

```typescript
.action(async (options) => {
  try {
    if (options.type) {
      // === 有初始配置：和现在完全一样的逻辑 ===
      const dbType = normalizeDbType(options.type);
      const config: DbConfig = {
        type: dbType as any,
        host: options.host,
        port: options.port,
        // ... 其余不变
      };

      const server = new DatabaseMCPServer(config);
      const adapter = createAdapter(config);
      server.setAdapter(adapter);
      await server.start();

      // ... graceful shutdown 逻辑不变
    } else {
      // === 无初始配置：无连接模式启动 ===
      console.error('📡 无连接模式：未指定数据库类型，等待通过 connect_database 工具动态连接...');
      console.error('');

      const server = new DatabaseMCPServer();  // 不传 config
      await server.start();

      // ... graceful shutdown 逻辑同上（复用）
    }
  } catch (error) {
    // ... 不变
  }
});
```

### 6.3 不需要改动的文件

以下文件完全不需要改动：

| 文件/目录 | 原因 |
|----------|------|
| `src/adapters/*.ts`（全部 17 个适配器） | 适配器本身没有问题，`createAdapter()` 已能正确创建所有类型 |
| `src/utils/adapter-factory.ts` | 工厂函数已完善，直接复用 |
| `src/utils/safety.ts` | 权限校验逻辑不变 |
| `src/core/connection-manager.ts` | 仅 HTTP 模式使用，不受影响 |
| `src/core/database-service.ts` | 业务逻辑层不变 |
| `src/http/**` | HTTP/SSE/Streamable 模式不受影响 |
| `src/types/adapter.ts` | 类型定义不需要变更 |

### 6.4 向后兼容性保证

| 场景 | 改动前 | 改动后 |
|------|-------|-------|
| `--type mysql --host ...` 启动 | 正常连接 | 行为完全一致 |
| 不传 `--type` 启动 | 报错退出 | 无连接模式启动，等待动态连接 |
| HTTP 模式 `POST /api/connect` | 正常 | 不受影响 |
| SSE 模式 `GET /sse?type=...` | 正常 | 不受影响 |
| Streamable HTTP `POST /mcp` | 正常 | 不受影响 |

### 6.5 17 种适配器兼容性

所有适配器通过 `createAdapter()` 统一创建，`connect_database` tool 内部调用的就是同一个工厂函数，因此 17 种数据库全部自动支持：

| 适配器 | 动态连接支持 | 说明 |
|--------|------------|------|
| mysql | ✅ | 通过 createAdapter 创建 MySQLAdapter |
| postgres | ✅ | 通过 createAdapter 创建 PostgreSQLAdapter |
| redis | ✅ | 通过 createAdapter 创建 RedisAdapter |
| oracle | ✅ | 支持 oracleClientPath 参数 |
| dm | ✅ | 达梦数据库 |
| sqlserver | ✅ | 支持 mssql 别名 |
| mongodb | ✅ | 支持 authSource 参数 |
| sqlite | ✅ | 通过 filePath 参数指定文件 |
| kingbase | ✅ | 人大金仓 |
| gaussdb | ✅ | 华为 GaussDB，支持 opengauss 别名 |
| oceanbase | ✅ | 蚂蚁 OceanBase |
| tidb | ✅ | PingCAP TiDB |
| clickhouse | ✅ | ClickHouse |
| polardb | ✅ | 阿里云 PolarDB |
| vastbase | ✅ | 海量数据 Vastbase |
| highgo | ✅ | 瀚高数据库 |
| goldendb | ✅ | 中兴 GoldenDB |

### 6.6 四种传输模式兼容性

| 传输模式 | 改动影响 | 动态连接方式 |
|---------|---------|------------|
| stdio（MCP） | 本次改动目标 | 通过 `connect_database` tool |
| REST API（HTTP） | 不受影响 | 通过 `POST /api/connect` |
| SSE | 不受影响 | 通过 URL query 参数 |
| Streamable HTTP | 不受影响 | 通过 `X-DB-*` 请求头 |

---

## 七、实施步骤

### Step 1：修改 `src/mcp/mcp-server.ts`

1. 新增 `createAdapter` 和 `normalizeDbType` 的 import
2. `config` 属性类型改为 `DbConfig | null`，构造函数参数改为可选
3. `setupHandlers()` 中 `ListToolsRequestSchema` 追加 3 个 tool 定义
4. `setupHandlers()` 中 `CallToolRequestSchema` 追加 3 个 case（connect_database、disconnect_database、get_connection_status）
5. 现有 tool 的未连接错误提示改为引导使用 `connect_database`
6. `start()` 方法中初始连接改为条件执行
7. `stop()` 方法兼容 config 为 null 的情况

### Step 2：修改 `src/mcp/mcp-index.ts`

1. `--type` 从 `requiredOption` 改为 `option`
2. action 中增加 `if (options.type)` 分支，无 type 时以无连接模式启动

### Step 3：测试验证

1. 有 `--type` 参数启动 → 行为与改动前一致
2. 无参数启动 → 无连接模式，tool 列表包含 connect_database
3. 调用 connect_database 连接 → 连接成功，后续 execute_query 等正常工作
4. 调用 connect_database 切换 → 旧连接断开，新连接建立
5. 调用 disconnect_database → 连接断开，execute_query 提示需要先连接
6. 调用 get_connection_status → 正确返回当前状态
7. HTTP/SSE/Streamable 模式 → 功能不受影响

---

## 八、改动量总结

| 指标 | 数值 |
|------|------|
| 改动文件数 | 2 |
| 新增代码行数（估算） | ~120 行 |
| 删除代码行数 | ~3 行（requiredOption 改 option、错误提示文案） |
| 涉及适配器改动 | 0（全部 17 种自动兼容） |
| 涉及传输模式改动 | 0（4 种模式全部兼容） |
| 破坏性变更 | 无 |
