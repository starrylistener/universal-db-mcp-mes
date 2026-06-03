# insert_exception_data 功能设计文档

## 概述

在 `universal-db-mcp` 项目中新增一个定制化 MCP 工具 `insert_exception_data`，用于向配置好的**错误信息表及其多语言表**插入 AI 生成的数据。当前阶段 tl 表各语言记录使用相同的 message（AI 传入的内容）。

## 背景与目标

### 背景
- `universal-db-mcp` 是一个通用数据库 MCP 连接器，支持 17 种数据库。
- 现有 `execute_query` 工具已支持 INSERT，但需要 AI 手写 SQL，且对特定业务场景不够友好。
- 用户需要一个**语义明确、配置化、参数化**的专用插入工具，自动处理固定字段，AI 只需关心业务内容。

### 目标
1. 新增 MCP 工具 `insert_exception_data`，AI 只需传入 `MESSAGE_CODE` 和 `MESSAGE`。
2. 目标库表通过 CLI 参数或环境变量配置，实现业务解耦。
3. 系统字段（租户ID、审计字段、初始标识等）由工具内部自动填充，AI 无感知。
4. **tl 表无论多语言开关状态都必须插入**，当前阶段各语言使用相同的 message。
5. 同步提供 REST API 端点，供 HTTP 模式使用。

## 设计细节

### 1. 配置方式

复用现有配置机制，通过 CLI 参数或环境变量指定目标库表：

| 配置项 | CLI 参数 | 环境变量 | 说明 |
|--------|----------|----------|------|
| 错误信息表库 | `--error-database` | `ERROR_DATABASE` | 数据库名 / schema |
| 错误信息表 | `--error-table` | `ERROR_TABLE` | 表名 |
| 错误信息序列表 | `--error-seq-name` | `ERROR_SEQ_NAME` | `mt_sys_sequence` 中的 NAME 值，默认 `mt_error_message_s` |
| 错误信息多语言表 | `--error-tl-table` | `ERROR_TL_TABLE` | 如 `mt_error_message_tl`，预留 |
| 多语言开关 | `--error-multilang` | `ERROR_MULTILANG` | `true` / `false`，默认 `false`，预留 |
| 多语言列表 | `--error-locales` | `ERROR_LOCALES` | 逗号分隔，默认 `zh_CN,en_US`，预留 |

**加载优先级**（与现有机制保持一致）：
`CLI 参数 > 环境变量 > 默认值`

若未配置目标表，工具调用时返回明确错误提示。

### 2. MCP 工具定义

```json
{
  "name": "insert_exception_data",
  "description": "向配置的错误信息表插入数据。AI 只需传入 MESSAGE_CODE 和 MESSAGE，系统会自动填充租户ID、审计字段、初始标识等其余字段。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "data": {
        "type": "array",
        "description": "要插入的错误信息数据行",
        "items": {
          "type": "object",
          "properties": {
            "MESSAGE_CODE": { "type": "string", "description": "消息编码，varchar(255)，必填" },
            "MESSAGE": { "type": "string", "description": "消息内容，varchar(1000)，必填" }
          },
          "required": ["MESSAGE_CODE", "MESSAGE"]
        }
      }
    },
    "required": ["data"]
  }
}
```

### 3. 字段映射规则

| 数据库字段 | 来源 | 值 |
|-----------|------|-----|
| `MESSAGE_ID` | 系统生成 | 从 `mt_sys_sequence` 取 `CURRENT_VALUE × 1000 + 1`，并更新 `CURRENT_VALUE + 1` |
| `TENANT_ID` | 系统固定 | `2` |
| `MESSAGE_CODE` | AI 传入 | 必填 |
| `MESSAGE` | AI 传入 | 必填 |
| `INITIAL_FLAG` | 系统固定 | `'N'` |
| `CID` | 系统固定 | `null` |
| `OBJECT_VERSION_NUMBER` | 系统固定 | `1` |
| `CREATED_BY` | 系统固定 | `null` |
| `CREATION_DATE` | 系统固定 | `null` |
| `LAST_UPDATED_BY` | 系统固定 | `null` |
| `LAST_UPDATE_DATE` | 系统固定 | `null` |

### 4. 核心逻辑（`DatabaseService.insertExceptionData`）

```typescript
async insertExceptionData(
  data: Array<{ MESSAGE_CODE: string; MESSAGE: string }>
): Promise<{ affectedRows: number; insertId?: number | string }>
```

**执行流程**：
1. 校验 `ERROR_TABLE` 是否已配置，未配置则抛错。
2. 校验当前权限是否包含 `insert`，无权限则抛错。
3. 校验 `data` 非空且为数组。
4. 获取目标表的 Schema 信息（复用 `getTableInfo`），校验目标表是否存在。
5. **生成 `MESSAGE_ID`**：
   - 查询 message 表最大值：`SELECT MAX(MESSAGE_ID) FROM <error_table>`，计算 `max_base = floor(max_id / 1000)`（表为空时 `max_base = 0`）。
   - 查询序列表：`SELECT CURRENT_VALUE FROM mt_sys_sequence WHERE NAME = ?`（`?` 为配置的序列表 NAME，默认 `mt_error_message_s`）。
   - **比较取大**：
     - 若 `max_base >= seq_value`：说明 message 表领先，使用 `base = max_base + 1`；`MESSAGE_ID = base × 1000 + 1`；回写 `UPDATE mt_sys_sequence SET CURRENT_VALUE = base WHERE NAME = ?`。
     - 否则：使用 `MESSAGE_ID = seq_value × 1000 + 1`；更新 `UPDATE mt_sys_sequence SET CURRENT_VALUE = seq_value + 1 WHERE NAME = ?`。
   - 查询与更新在同一个事务中执行，保证原子性。
   - **插入失败不回滚**：即使后续 INSERT 失败，`mt_sys_sequence` 的 `CURRENT_VALUE` 不回退，允许跳号。
6. 为每行数据组装完整字段：`MESSAGE_ID`（步骤 5 生成）、`TENANT_ID=2`、`MESSAGE_CODE`、`MESSAGE`、`INITIAL_FLAG='N'`、`CID=null`、`OBJECT_VERSION_NUMBER=1`、`CREATED_BY=null`、`CREATION_DATE=null`、`LAST_UPDATED_BY=null`、`LAST_UPDATE_DATE=null`。
7. 根据数据库类型生成参数化 INSERT SQL（复用 `quoteIdentifier`），**同时生成主表和 tl 表的插入 SQL**。
8. **主表与 tl 表在同一个事务中插入**：
   - 先插入主表 `mt_error_message`。
   - 再为 `ERROR_LOCALES` 配置的每种语言（默认 `zh_CN,en_US`）插入 tl 表 `mt_error_message_tl`：
     - `MESSAGE_ID` = 同主表
     - `LANG` = 语言代码
     - `MESSAGE` = AI 传入的 message（当前阶段所有语言相同）。
9. 提交事务，返回主表受影响的行数。

**批量插入优化**：
- 单条 SQL 插入多行：`INSERT INTO table (col1, col2) VALUES (?, ?), (?, ?), ...`
- 复用现有 `executeQuery` 的参数化查询机制。

**跨库处理**：
- 若配置了 `ERROR_DATABASE`，SQL 中使用 `database.table` 格式（不同数据库的引号风格由 `quoteIdentifier` 统一处理）。
- 若未配置 `ERROR_DATABASE`，则使用当前连接的默认库。

### 5. REST API

新增端点：

```
POST /api/insert-exception-data
```

**请求体**：
```json
{
  "sessionId": "xxx",
  "data": [
    { "MESSAGE_CODE": "TIMEOUT", "MESSAGE": "连接超时" }
  ]
}
```

**响应体**：
```json
{
  "success": true,
  "data": {
    "affectedRows": 1
  },
  "metadata": {
    "timestamp": "2026-06-02T10:00:00Z",
    "requestId": "req-123"
  }
}
```

### 6. 错误处理

| 场景 | 错误提示 |
|------|---------|
| 未配置目标表 | `❌ 未配置目标错误信息表。请通过 --error-table CLI 参数或 ERROR_TABLE 环境变量指定` |
| 未配置 tl 表 | `❌ 未配置目标多语言表。请通过 --error-tl-table CLI 参数或 ERROR_TL_TABLE 环境变量指定` |
| 无 `insert` 权限 | `❌ 当前权限模式不允许插入操作，需要 insert 权限` |
| `data` 为空或不是数组 | `❌ data 必须是非空数组` |
| 目标表不存在 | `❌ 目标表 "xxx" 不存在` |
| tl 表不存在 | `❌ 多语言表 "xxx" 不存在` |
| 数据库约束失败 | 透传数据库原始错误信息 |
| 插入失败 | 透传数据库原始错误信息 |

### 7. 安全考虑

- **参数化查询**：所有值通过 `params` 数组传递，禁止字符串拼接，防止 SQL 注入。
- **权限校验**：复用现有 `validateQuery` 的权限系统，要求 `insert` 权限。
- **批量限制**：单次插入最多 1000 行，防止超大请求拖垮数据库。

### 8. 适配的数据库

复用现有的 `quoteIdentifier` 逻辑，支持全部 17 种数据库：
- MySQL 系（反引号）：MySQL、TiDB、OceanBase、PolarDB、GoldenDB
- PostgreSQL 系（双引号）：PostgreSQL、Kingbase、GaussDB、Vastbase、HighGo
- SQL Server（方括号）
- Oracle / 达梦
- SQLite、ClickHouse、MongoDB、Redis

### 9. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/types/adapter.ts` | 修改 | 新增 `InsertExceptionDataResult` 接口 |
| `src/types/http.ts` | 修改 | 新增 `InsertExceptionDataRequest`、`InsertExceptionDataResponse` 接口 |
| `src/utils/config-loader.ts` | 修改 | 新增 `ERROR_DATABASE`、`ERROR_TABLE`、`ERROR_SEQ_NAME`、`ERROR_TL_TABLE`、`ERROR_MULTILANG`、`ERROR_LOCALES` 环境变量加载逻辑 |
| `src/mcp/mcp-index.ts` | 修改 | 新增 `--error-database`、`--error-table`、`--error-seq-name`、`--error-tl-table`、`--error-multilang`、`--error-locales` CLI 参数解析 |
| `src/core/database-service.ts` | 修改 | 新增 `insertExceptionData` 方法 |
| `src/mcp/mcp-server.ts` | 修改 | 新增 `insert_exception_data` 工具定义和调用处理 |
| `src/http/routes/query.ts` | 修改 | 新增 `/api/insert-exception-data` 端点 |

## 数据流

```
AI 调用 insert_exception_data
        │
        ▼
┌─────────────────┐
│  MCP 协议层      │  解析参数 (data: { MESSAGE_CODE, MESSAGE }[])
│  / REST API     │
└────────┬────────┘
         ▼
┌─────────────────┐
│  DatabaseService│  1. 检查 ERROR_TABLE / ERROR_TL_TABLE 配置
│                 │  2. 检查 insert 权限
│                 │  3. 获取表 Schema，确认主表和 tl 表存在
│                 │  4. 从 mt_sys_sequence 生成 MESSAGE_ID
│                 │  5. 为每行数据补充系统字段
│                 │  6. 生成主表和 tl 表的参数化 INSERT SQL
└────────┬────────┘
         ▼
┌─────────────────┐
│  数据库适配器     │  同一事务内插入主表 + tl 表
│  (17种数据库)   │
└────────┬────────┘
         ▼
    返回 { affectedRows }
```

## 测试策略

1. **单元测试**：`DatabaseService.insertExceptionData`
   - 配置缺失场景
   - 权限不足场景
   - 空 data 数组校验
   - 批量插入（单行、多行）
   - 系统字段是否正确填充
   - MESSAGE_ID 生成逻辑（序列表 vs message 表最大值）
   - tl 表是否正确插入（按配置语言数量 × data 行数）
   - 不同数据库的引号风格

2. **集成测试**：MCP 工具端到端
   - 通过 MCP Inspector 调用 `insert_exception_data`
   - 验证主表数据是否正确写入
   - 验证 tl 表各语言记录是否正确写入
   - 验证系统字段是否自动填充

3. **REST API 测试**：
   - `POST /api/insert-exception-data` 成功与失败场景

## 非目标（YAGNI）

- 不实现多语言开关为"开"的场景（tl 表各语言插入不同 message，待第二阶段）。
- 不实现通用的 `insert_data`（任意表插入）。
- 不实现 `update_exception_data` 或 `delete_exception_data`。
- 不实现数据转换/映射（如 AI 传字符串，数据库要求整数）。
- 不实现复杂的数据校验（如正则、范围检查）。

---

*设计确认后，进入 implementation plan 阶段。*
