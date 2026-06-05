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

| 配置项 | CLI 参数 | 环境变量 | 说明 | 默认值 |
|--------|----------|----------|------|--------|
| 错误信息表库 | `--error-database` | `ERROR_DATABASE` | 数据库名 / schema | - |
| 错误信息表 | `--error-table` | `ERROR_TABLE` | 表名 | - |
| 错误信息序列表 | `--error-seq-name` | `ERROR_SEQ_NAME` | `mt_sys_sequence` 中的 NAME 值 | `mt_error_message_s` |
| 错误信息多语言表 | `--error-tl-table` | `ERROR_TL_TABLE` | 如 `mt_error_message_tl` | - |
| 多语言开关 | `--error-multilang` | `ERROR_MULTILANG` | `true` / `false` | `false` |
| 多语言列表 | `--error-locales` | `ERROR_LOCALES` | 逗号分隔 | `zh_CN,en_US` |
| 序列表 ID 后缀 | `--error-seq-suffix` | `ERROR_SEQ_SUFFIX` | 用于字符串拼接生成 MESSAGE_ID | `001` |

**加载优先级**（与现有机制保持一致）：
`CLI 参数 > 环境变量 > 默认值`

若未配置目标表，工具调用时返回明确错误提示。

### 2. MCP 工具定义

```json
{
  "name": "insert_exception_data",
  "description": "向 Hzero 平台注册新的错误码及其多语言提示信息...（动态生成，包含 MESSAGE_CODE 规则、多语言传入规则、执行前确认要求）",
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
            "MESSAGE": {
              "anyOf": [
                { "type": "string", "description": "单语言：所有语言使用相同内容" },
                {
                  "type": "array",
                  "items": { "type": "string" },
                  "description": "多语言翻译：必须严格按当前配置语言顺序传入，数组长度必须等于语言数量"
                }
              ],
              "description": "消息内容，varchar(1000)，必填"
            }
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

**主表（如 `mt_error_message`）：**

| 数据库字段 | 来源 | 值 |
|-----------|------|-----|
| `MESSAGE_ID` | 系统生成 | 从 `mt_sys_sequence` 批量取号，字符串拼接 `${base}${suffix}` |
| `TENANT_ID` | 系统固定 | `2` |
| `MESSAGE_CODE` | AI 传入 | 必填 |
| `MESSAGE` | AI 传入 | 必填（单语言取原值，多语言取数组第一项） |
| `INITIAL_FLAG` | 系统固定 | `'N'` |
| `CID` | 系统固定 | `1` |
| `OBJECT_VERSION_NUMBER` | 系统固定 | `1` |

**多语言表（如 `mt_error_message_tl`）：**

| 数据库字段 | 来源 | 值 |
|-----------|------|-----|
| `MESSAGE_ID` | 同主表 | 与主表对应行相同 |
| `LANG` | 系统固定 | 按 `--error-locales` 配置（默认 `zh_CN`, `en_US`） |
| `MESSAGE` | AI 传入 | 单语言时全部相同；多语言数组时取对应索引，缺失回退第一项 |

### 4. 核心逻辑（`DatabaseService.insertExceptionData`）

```typescript
async insertExceptionData(
  data: Array<{ MESSAGE_CODE: string; MESSAGE: string | string[] }>
): Promise<InsertExceptionDataResult>
```

**执行流程**：
1. 校验 `ERROR_TABLE` 和 `ERROR_TL_TABLE` 是否已配置，未配置则抛错。
2. 校验当前权限是否包含 `insert`，无权限则抛错。
3. 校验 `data` 非空且为数组，且单次不超过 1000 行。
4. 若 `MESSAGE` 传入数组，校验数组长度与配置语言数量是否匹配。
5. **开启事务**（如果数据库适配器支持 `beginTransaction`）。
6. **批量生成 `MESSAGE_ID`**（`generateMessageIds(count)`）：
   - 查询 message 表最大值：`SELECT MAX(MESSAGE_ID) as max_id FROM <error_table>`，计算 `maxBase = floor(max_id / divisor)`（`divisor = 10 ^ suffix.length`，表为空时 `maxBase = 0`）。
   - 查询序列表（加 `FOR UPDATE` 锁）：`SELECT CURRENT_VALUE FROM mt_sys_sequence WHERE NAME = ? FOR UPDATE`。
   - **比较取大，统一 +1**：
     - `startBase = max(maxBase, seqValue) + 1`
     - `endBase = startBase + count - 1`
   - 更新序列表：`UPDATE mt_sys_sequence SET CURRENT_VALUE = ? WHERE NAME = ?`（值为 `endBase`）。
   - 若 `affectedRows = 0`，则 `INSERT INTO mt_sys_sequence (NAME, CURRENT_VALUE) VALUES (?, ?)`。
   - 生成连续 ID 列表：`parseInt(`${startBase + i}${suffix}`, 10)`，其中 `i = 0..count-1`。
7. **构建主表批量 INSERT**：
   - 列：`MESSAGE_ID`, `TENANT_ID`, `MESSAGE_CODE`, `MESSAGE`, `INITIAL_FLAG`, `CID`, `OBJECT_VERSION_NUMBER`
   - 单条 SQL 插入所有行：`INSERT INTO ... VALUES (?,...), (?,...), ...`
8. **构建 tl 表批量 INSERT**：
   - 列：`MESSAGE_ID`, `LANG`, `MESSAGE`
   - 每行主数据 × 语言数量：单条 SQL 插入所有行
   - 多语言时取数组对应索引，缺失回退第一项；单语言时全部相同
9. **提交事务**；若任何步骤失败则**回滚事务**（包括序列表更新）。
10. 返回主表受影响的行数。

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
| 未配置目标表 | `❌ 未配置目标错误信息表或多语言表。请通过 --error-table 和 --error-tl-table 参数指定` |
| 无 `insert` 权限 | `❌ 当前权限模式不允许插入操作，需要 insert 权限` |
| `data` 为空或不是数组 | `❌ data 必须是非空数组` |
| `data` 超过 1000 行 | `❌ 单次插入最多 1000 行` |
| `MESSAGE` 数组长度不匹配 | `❌ MESSAGE 数组长度 (x) 与配置语言数量 (y) 不匹配。当前语言顺序：...` |
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
| `src/types/adapter.ts` | 修改 | 新增 `InsertExceptionDataResult` 接口；`MESSAGE` 类型改为 `string \| string[]`；`ErrorTableConfig` 增加 `errorSeqSuffix` |
| `src/types/http.ts` | 修改 | 新增 `InsertExceptionDataRequest`、`InsertExceptionDataResponse` 接口 |
| `src/utils/config-loader.ts` | 修改 | 新增 `ERROR_DATABASE`、`ERROR_TABLE`、`ERROR_SEQ_NAME`、`ERROR_TL_TABLE`、`ERROR_MULTILANG`、`ERROR_LOCALES`、`ERROR_SEQ_SUFFIX` 环境变量加载逻辑 |
| `src/mcp/mcp-index.ts` | 修改 | 新增 `--error-database`、`--error-table`、`--error-seq-name`、`--error-tl-table`、`--error-multilang`、`--error-locales`、`--error-seq-suffix` CLI 参数解析 |
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
│                 │  3. 校验 data 非空且不超过 1000 行
│                 │  4. 校验 MESSAGE 数组长度（多语言时）
│                 │  5. 开启事务（如适配器支持）
│                 │  6. 批量从 mt_sys_sequence 生成 MESSAGE_ID（FOR UPDATE 锁）
│                 │  7. 为每行数据补充系统字段
│                 │  8. 生成主表和 tl 表的参数化 INSERT SQL
└────────┬────────┘
         ▼
┌─────────────────┐
│  数据库适配器     │  同一事务内插入主表 + tl 表
│  (17种数据库)   │
└────────┬────────┘
         ▼
    提交事务 / 失败回滚
         ▼
    返回 { affectedRows }
```

## 测试策略

1. **单元测试**：`DatabaseService.insertExceptionData`
   - 配置缺失场景
   - 权限不足场景
   - 空 data 数组校验
   - 超过 1000 行限制校验
   - MESSAGE 数组长度与语言数量不匹配校验
   - 批量插入（单行、多行）
   - 系统字段是否正确填充
   - MESSAGE_ID 批量生成逻辑（序列表 vs message 表最大值、FOR UPDATE 锁、连续 ID）
   - 事务回滚（序列表更新失败时是否回滚）
   - tl 表是否正确插入（按配置语言数量 × data 行数、多语言数组回退）
   - 不同数据库的引号风格

2. **集成测试**：MCP 工具端到端
   - 通过 MCP Inspector 调用 `insert_exception_data`
   - 验证主表数据是否正确写入
   - 验证 tl 表各语言记录是否正确写入
   - 验证系统字段是否自动填充

3. **REST API 测试**：
   - `POST /api/insert-exception-data` 成功与失败场景

## 非目标（YAGNI）

- 不实现通用的 `insert_data`（任意表插入）。
- 不实现 `update_exception_data` 或 `delete_exception_data`。
- 不实现数据转换/映射（如 AI 传字符串，数据库要求整数）。
- 不实现复杂的数据校验（如正则、范围检查）。

---

*设计确认后，进入 implementation plan 阶段。*
