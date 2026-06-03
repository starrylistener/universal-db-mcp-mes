# insert_exception_data 增强设计文档

## 概述

在 `universal-db-mcp-mes` 的 `insert_exception_data` 功能基础上，进行以下增强：

1. **多语言翻译支持** — `MESSAGE` 支持传入翻译数组
2. **MESSAGE_ID 生成策略修复** — 修正序列表更新逻辑，避免静默失败和分支不一致
3. **后缀配置化** — 后缀从硬编码计算改为配置项，字符串拼接生成
4. **屏蔽通用写入入口** — `execute_query` 和 `POST /api/execute` 硬限制只允许 SELECT

---

## 1. 多语言翻译支持

### 背景

当前 `insert_exception_data` 的 `MESSAGE` 只支持单字符串，插入 tl 表时所有语言使用相同内容。需要支持 AI 自动翻译后传入多语言版本。

### 设计

#### 1.1 Schema 变更

`MESSAGE` 从 `type: 'string'` 扩展为 `anyOf`：

```json
{
  "MESSAGE": {
    "anyOf": [
      { "type": "string", "description": "单语言：所有语言使用相同内容" },
      { 
        "type": "array", 
        "items": { "type": "string" },
        "description": "多语言翻译：按配置语言顺序传入"
      }
    ]
  }
}
```

#### 1.2 Description 动态生成

`ListToolsRequestSchema` 返回 tools 时，从 `this.errorTableConfig.errorLocales` 读取当前配置的语言列表，实时拼入 description。

示例（配置为 `zh_CN,en_US,vi_VN`）：

> "... MESSAGE 可以是字符串（所有语言相同）或字符串数组（按顺序分别对应：zh_CN, en_US, vi_VN）..."

#### 1.3 插入逻辑

```typescript
for (const [index, locale] of locales.entries()) {
  const message = Array.isArray(row.MESSAGE)
    ? row.MESSAGE[index] ?? row.MESSAGE[0]  // 数组取对应索引，缺失回退第一项
    : row.MESSAGE;                           // 字符串全部相同
  tlValues.push(messageId, locale, message);
}
```

### 类型变更

- `src/types/adapter.ts`：`InsertExceptionDataRequest` 中 `MESSAGE: string | string[]`
- `src/core/database-service.ts`：`insertExceptionData` 参数类型同步更新
- `src/http/routes/query.ts`：`InsertExceptionDataRequest` 的 JSON Schema 同步更新

---

## 2. MESSAGE_ID 生成策略修复

### 背景

当前 `generateMessageId()` 存在两个问题：

1. **分支逻辑不一致**：`if` 分支 `base = maxBase + 1`，但 `else` 分支 `base = seqValue`（没有 +1），导致两边生成的 ID 规律不统一
2. **序列表更新静默失败**：如果 `mt_sys_sequence` 里没有对应 NAME 的记录，`UPDATE` 的 `affectedRows = 0`，代码未检查，下次再调用时生成重复 ID

### 设计

#### 2.1 maxBase 计算改为动态后缀长度

```typescript
const suffix = cfg.errorSeqSuffix || '001';
const divisor = Math.pow(10, suffix.length);
const maxBase = Math.floor(maxId / divisor);
```

#### 2.2 分支逻辑统一

两边都遵循"先 +1，再用新值"：

```typescript
let base: number;
if (maxBase >= seqValue) {
  base = maxBase + 1;
} else {
  base = seqValue + 1;  // 修正：之前这里漏了 +1
}

// 统一用 base（新值）更新序列表
const updateSeq = `UPDATE mt_sys_sequence SET CURRENT_VALUE = ? WHERE NAME = ?`;
const updateResult = await this.adapter.executeQuery(updateSeq, [base, cfg.errorSeqName]);

// 检查更新是否生效，为 0 则插入新记录
if ((updateResult.affectedRows || 0) === 0) {
  const insertSeq = `INSERT INTO mt_sys_sequence (NAME, CURRENT_VALUE) VALUES (?, ?)`;
  await this.adapter.executeQuery(insertSeq, [cfg.errorSeqName, base]);
}
```

#### 2.3 字符串拼接生成 MESSAGE_ID

```typescript
return parseInt(`${base}${suffix}`, 10);  // '1002' + '001' = 1002001
```

返回类型保持 `number`（数据库字段为 BIGINT）。

---

## 3. 后缀配置化

### 背景

当前后缀 `001` 通过 `base * 1000 + 1` 数学计算得到，不灵活且与 Hzero 实际语义（字符串拼接）不符。

### 设计

#### 3.1 新增配置项

| 配置项 | CLI 参数 | 环境变量 | 默认值 |
|--------|----------|----------|--------|
| 序列表后缀 | `--error-seq-suffix` | `ERROR_SEQ_SUFFIX` | `001` |

#### 3.2 配置加载

- `src/utils/config-loader.ts`：加载 `ERROR_SEQ_SUFFIX`
- `src/types/adapter.ts`：`ErrorTableConfig` 增加 `errorSeqSuffix?: string`
- `src/mcp/mcp-index.ts`：增加 `--error-seq-suffix` CLI 参数

#### 3.3 使用位置

- `src/core/database-service.ts`：`generateMessageId()` 中读取 `cfg.errorSeqSuffix`
- `divisor` 根据 `suffix.length` 动态计算

---

## 4. 屏蔽通用写入入口

### 背景

`insert_exception_data` 需要 `insert` 权限，但 `--permission-mode readwrite` 同时会放开 `execute_query` 的 INSERT/UPDATE/DELETE。需要让 `execute_query` 硬限制只允许 SELECT，与权限模式解耦。

### 设计

#### 4.1 MCP 工具 execute_query

在 `DatabaseService.executeQuery()` 中增加一层前置校验（`validateQuery` 之后）：

```typescript
// 只允许 SELECT，禁止 INSERT/UPDATE/DELETE/CREATE/DROP 等
if (!query.trim().match(/^\s*SELECT\b/i)) {
  throw new Error('❌ execute_query 仅支持 SELECT 查询');
}
```

> `insert_exception_data` 不走 `executeQuery()`，不受影响。

#### 4.2 HTTP POST /api/execute

`src/http/routes/query.ts` 的 `/api/execute` 端点同步增加相同校验。

#### 4.3 影响范围

| 入口 | 修改前 | 修改后 |
|------|--------|--------|
| `execute_query` (MCP) | 按 `--permission-mode` 控制 | 硬限制只读 |
| `POST /api/execute` (HTTP) | 按 `--permission-mode` 控制 | 硬限制只读 |
| `insert_exception_data` (MCP) | 需 `insert` 权限 | 不变 |
| `POST /api/insert-exception-data` (HTTP) | 需 `insert` 权限 | 不变 |

---

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/types/adapter.ts` | 修改 | `ErrorTableConfig` 增加 `errorSeqSuffix`；`InsertExceptionDataRequest` 中 `MESSAGE` 改为 `string \| string[]` |
| `src/utils/config-loader.ts` | 修改 | 加载 `ERROR_SEQ_SUFFIX` |
| `src/mcp/mcp-index.ts` | 修改 | 新增 `--error-seq-suffix` CLI 参数 |
| `src/mcp/mcp-server.ts` | 修改 | `insert_exception_data` description 动态生成 |
| `src/core/database-service.ts` | 修改 | `generateMessageId()` 修复序列表逻辑 + 后缀配置化；`insertExceptionData()` 支持 `MESSAGE` 数组 |
| `src/http/routes/query.ts` | 修改 | `/api/execute` 硬限制 SELECT；`/api/insert-exception-data` schema 更新 |

---

*设计确认后，进入 implementation plan 阶段。*
