# insert_exception_data 功能设计文档

## 概述

在 `universal-db-mcp` 项目中新增一个定制化 MCP 工具 `insert_exception_data`，用于向配置好的**错误信息表**插入 AI 生成的数据。

## 背景与目标

### 背景
- `universal-db-mcp` 是一个通用数据库 MCP 连接器，支持 17 种数据库。
- 现有 `execute_query` 工具已支持 INSERT，但需要 AI 手写 SQL，且对特定业务场景不够友好。
- 用户需要一个**语义明确、配置化、参数化**的专用插入工具。

### 目标
1. 新增 MCP 工具 `insert_exception_data`，AI 只需传入结构化数据，无需手写 SQL。
2. 表名通过 CLI 参数 `--error-table` 或环境变量 `ERROR_TABLE` 配置，实现业务解耦。
3. 内置字段白名单校验，防止插入不存在的字段。
4. 支持批量插入，提升性能。
5. 同步提供 REST API 端点，供 HTTP 模式使用。

## 设计细节

### 1. 配置方式

复用现有配置机制，通过 CLI 参数或环境变量指定目标表：

- **CLI 参数**：`--error-table <tableName>`
- **环境变量**：`ERROR_TABLE=<tableName>`

**加载优先级**（与现有机制保持一致）：
`CLI 参数 > 环境变量 > 默认值`

若未配置目标表，工具调用时返回明确错误提示。

### 2. MCP 工具定义

```json
{
  "name": "insert_exception_data",
  "description": "向配置的错误信息表插入数据。AI 必须严格按以下字段类型传入数据，字段名大小写敏感。系统会自动填充 INITIAL_FLAG='N' 以及默认的时间戳和审计字段。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "data": {
        "type": "array",
        "description": "要插入的错误信息数据行，每行是一个对象。必填字段：MESSAGE_ID(bigint), MESSAGE_CODE(varchar(255)), MESSAGE(varchar(1000)), CID(bigint)。可选字段：TENANT_ID(bigint, 默认0)。系统固定填充：INITIAL_FLAG='N'；数据库默认填充：OBJECT_VERSION_NUMBER=1, CREATED_BY=-1, CREATION_DATE=NOW(), LAST_UPDATED_BY=-1, LAST_UPDATE_DATE=NOW()。",
        "items": {
          "type": "object",
          "properties": {
            "MESSAGE_ID": { "type": "integer", "description": "主键，bigint，必须唯一且非空" },
            "TENANT_ID": { "type": "integer", "description": "租户ID，bigint，默认 0" },
            "MESSAGE_CODE": { "type": "string", "description": "消息编码，varchar(255)，非空" },
            "MESSAGE": { "type": "string", "description": "消息内容，varchar(1000)" },
            "CID": { "type": "integer", "description": "CID，bigint，非空" }
          },
          "required": ["MESSAGE_ID", "MESSAGE_CODE", "MESSAGE", "CID"]
        }
      }
    },
    "required": ["data"]
  }
}
```

### 3. 核心逻辑（`DatabaseService.insertExceptionData`）

```typescript
async insertExceptionData(
  data: Record<string, unknown>[]
): Promise<{ affectedRows: number; insertId?: number | string }>
```

**执行流程**：
1. 校验 `targetErrorTable` 是否已配置，未配置则抛错。
2. 校验当前权限是否包含 `insert`，无权限则抛错。
3. 校验 `data` 非空且为数组。
4. 获取目标表的 Schema 信息（复用 `getTableInfo`）。
5. 校验传入的字段名是否都存在于目标表的列中，不存在的字段列出并抛错。
6. 根据数据库类型生成参数化 INSERT SQL（复用 `quoteIdentifier`）。
7. 执行插入，返回受影响的行数。
8. 若数据库支持，返回自增 ID（`insertId`）。

**批量插入优化**：
- 单条 SQL 插入多行：`INSERT INTO table (col1, col2) VALUES (?, ?), (?, ?), ...`
- 复用现有 `executeQuery` 的参数化查询机制。

### 4. REST API

新增端点：

```
POST /api/insert-exception-data
```

**请求体**：
```json
{
  "sessionId": "xxx",
  "data": [
    { "MESSAGE_ID": 1, "MESSAGE_CODE": "TIMEOUT", "MESSAGE": "连接超时", "CID": 100 }
  ]
}
```

**响应体**：
```json
{
  "success": true,
  "data": {
    "affectedRows": 1,
    "insertId": 42
  },
  "metadata": {
    "timestamp": "2026-06-02T10:00:00Z",
    "requestId": "req-123"
  }
}
```

### 5. 错误处理

| 场景 | 错误码/提示 |
|------|-----------|
| 未配置目标表 | `❌ 未配置目标错误信息表。请通过 --error-table CLI 参数或 ERROR_TABLE 环境变量指定` |
| 无 `insert` 权限 | `❌ 当前权限模式不允许插入操作，需要 insert 权限` |
| `data` 为空或不是数组 | `❌ data 必须是非空数组` |
| 字段不存在于目标表 | `❌ 字段 "xxx" 不存在于表 "mt_error_message"。有效字段: MESSAGE_ID, MESSAGE_CODE, MESSAGE, CID, TENANT_ID, ...` |
| 数据库约束失败（NOT NULL 等） | 透传数据库原始错误信息 |
| 插入失败 | 透传数据库原始错误信息 |

### 6. 安全考虑

- **参数化查询**：所有值通过 `params` 数组传递，禁止字符串拼接，防止 SQL 注入。
- **字段白名单**：只允许插入目标表中真实存在的字段，拒绝未知字段。
- **权限校验**：复用现有 `validateQuery` 的权限系统，要求 `insert` 权限。
- **批量限制**：单次插入最多 1000 行，防止超大请求拖垮数据库。

### 7. 适配的数据库

复用现有的 `quoteIdentifier` 和 `appendLimit` 逻辑，支持全部 17 种数据库：
- MySQL 系（反引号）：MySQL、TiDB、OceanBase、PolarDB、GoldenDB
- PostgreSQL 系（双引号）：PostgreSQL、Kingbase、GaussDB、Vastbase、HighGo
- SQL Server（方括号）
- Oracle / 达梦（FETCH FIRST）
- SQLite、ClickHouse、MongoDB、Redis

### 8. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/types/adapter.ts` | 修改 | 新增 `InsertExceptionDataResult` 接口 |
| `src/types/http.ts` | 修改 | 新增 `InsertExceptionDataRequest`、`InsertExceptionDataResponse` 接口 |
| `src/utils/config-loader.ts` | 修改 | 新增 `ERROR_TABLE` 环境变量加载逻辑 |
| `src/mcp/mcp-index.ts` | 修改 | 新增 `--error-table` CLI 参数解析 |
| `src/core/database-service.ts` | 修改 | 新增 `insertExceptionData` 方法 |
| `src/mcp/mcp-server.ts` | 修改 | 新增 `insert_exception_data` 工具定义和调用处理 |
| `src/http/routes/query.ts` | 修改 | 新增 `/api/insert-exception-data` 端点 |

## 数据流

```
AI 调用 insert_exception_data
        │
        ▼
┌─────────────────┐
│  MCP 协议层      │  解析参数 (data: Record[])
│  / REST API     │
└────────┬────────┘
         ▼
┌─────────────────┐
│  DatabaseService│  1. 检查 targetErrorTable 配置
│                 │  2. 检查 insert 权限
│                 │  3. 获取表 Schema，校验字段白名单
│                 │  4. 生成参数化 INSERT SQL
└────────┬────────┘
         ▼
┌─────────────────┐
│  数据库适配器     │  执行参数化查询
│  (17种数据库)   │
└────────┬────────┘
         ▼
    返回 { affectedRows, insertId }
```

## 测试策略

1. **单元测试**：`DatabaseService.insertExceptionData`
   - 配置缺失场景
   - 权限不足场景
   - 字段白名单校验（合法字段、非法字段）
   - 批量插入（单行、多行）
   - 不同数据库的引号风格

2. **集成测试**：MCP 工具端到端
   - 通过 MCP Inspector 调用 `insert_exception_data`
   - 验证数据是否正确写入数据库

3. **REST API 测试**：
   - `POST /api/insert-exception-data` 成功与失败场景

## 非目标（YAGNI）

- 不实现通用的 `insert_data`（任意表插入）
- 不实现 `update_exception_data` 或 `delete_exception_data`
- 不实现数据转换/映射（如 AI 传字符串，数据库要求整数）
- 不实现复杂的数据校验（如正则、范围检查）

---

*设计确认后，进入 implementation plan 阶段。*
