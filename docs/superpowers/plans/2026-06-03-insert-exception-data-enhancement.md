# insert_exception_data Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-language translation support, fix MESSAGE_ID sequence generation, make suffix configurable, and hard-restrict execute_query to SELECT only.

**Architecture:** Extend existing types, config, MCP tool schema, DatabaseService core logic, and HTTP routes. All changes are additive or targeted fixes — no restructuring.

**Tech Stack:** TypeScript, mysql2/promise, MCP SDK, Fastify

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/adapter.ts` | Modify | Add `errorSeqSuffix` to `ErrorTableConfig` |
| `src/types/http.ts` | Modify | Change `InsertExceptionDataRequest.MESSAGE` to `string \| string[]` |
| `src/utils/config-loader.ts` | Modify | Load `ERROR_SEQ_SUFFIX` from env vars |
| `src/mcp/mcp-index.ts` | Modify | Add `--error-seq-suffix` CLI argument |
| `src/mcp/mcp-server.ts` | Modify | Dynamic description generation for `insert_exception_data` |
| `src/core/database-service.ts` | Modify | Fix `generateMessageId()`, support `MESSAGE` array, restrict `executeQuery()` |
| `src/http/routes/query.ts` | Modify | Restrict `/api/execute` to SELECT, update `/api/insert-exception-data` schema |

---

### Task 1: Update Type Definitions

**Files:**
- Modify: `src/types/adapter.ts`
- Modify: `src/types/http.ts`

- [ ] **Step 1: Add `errorSeqSuffix` to `ErrorTableConfig`**

In `src/types/adapter.ts`, add the field after `errorLocales?: string[];`:

```typescript
  /** 序列表 ID 后缀 */
  errorSeqSuffix?: string;
```

- [ ] **Step 2: Change `MESSAGE` type to `string | string[]`**

In `src/types/http.ts`, update `InsertExceptionDataRequest`:

```typescript
export interface InsertExceptionDataRequest {
  sessionId: string;
  data: Array<{
    MESSAGE_CODE: string;
    MESSAGE: string | string[];
  }>;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types/adapter.ts src/types/http.ts
git commit -m "types: add errorSeqSuffix and MESSAGE array support"
```

---

### Task 2: Update Config Loader and MCP CLI

**Files:**
- Modify: `src/utils/config-loader.ts`
- Modify: `src/mcp/mcp-index.ts`

- [ ] **Step 1: Load `ERROR_SEQ_SUFFIX` from environment**

In `src/utils/config-loader.ts`, inside the `config.errorTable = { ... }` block (around line 91), add:

```typescript
      errorSeqSuffix: process.env.ERROR_SEQ_SUFFIX || '001',
```

- [ ] **Step 2: Add CLI argument for `--error-seq-suffix`**

In `src/mcp/mcp-index.ts`, add the option after `--error-locales` (around line 40):

```typescript
    .option('--error-seq-suffix <suffix>', '序列表 ID 后缀', '001')
```

Then in the `errorTableConfig` object (around line 80), add:

```typescript
          errorSeqSuffix: options.errorSeqSuffix,
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/config-loader.ts src/mcp/mcp-index.ts
git commit -m "config: add errorSeqSuffix CLI and env support"
```

---

### Task 3: Dynamic MCP Tool Description

**Files:**
- Modify: `src/mcp/mcp-server.ts`

- [ ] **Step 1: Build dynamic description for `insert_exception_data`**

In `src/mcp/mcp-server.ts`, inside the `ListToolsRequestSchema` handler, replace the static `insert_exception_data` tool object with dynamically generated description.

Find the tool object around line 215. Replace:

```typescript
          {
            name: 'insert_exception_data',
            description: '向 Hzero 平台错误信息表及其多语言表插入数据，以便在代码中通过错误码获取提示信息。当用户描述业务场景并提到"xxx时，报错xxx"、"需要抛出一个错误"、"新增错误码"等情境时，AI 应主动生成合适的 MESSAGE_CODE 和 MESSAGE，并调用此工具插入。系统会自动填充租户ID、审计字段、初始标识，并从序列表生成 MESSAGE_ID。',
```

With:

```typescript
          {
            name: 'insert_exception_data',
            description: (() => {
              const locales = this.errorTableConfig?.errorLocales || ['zh_CN', 'en_US'];
              const localesStr = locales.join(', ');
              return `向 Hzero 平台错误信息表及其多语言表插入数据，以便在代码中通过错误码获取提示信息。当用户描述业务场景并提到"xxx时，报错xxx"、"需要抛出一个错误"、"新增错误码"等情境时，AI 应主动生成合适的 MESSAGE_CODE 和 MESSAGE，并调用此工具插入。系统会自动填充租户ID、审计字段、初始标识，并从序列表生成 MESSAGE_ID。MESSAGE 可以是字符串（所有语言使用相同内容）或字符串数组（按顺序分别对应：${localesStr}）。`;
            })(),
```

Also update the `MESSAGE` schema in `inputSchema` to support array:

Replace the `MESSAGE` property:

```typescript
                      MESSAGE: { type: 'string', description: '消息内容，varchar(1000)，必填' },
```

With:

```typescript
                      MESSAGE: {
                        anyOf: [
                          { type: 'string', description: '单语言：所有语言使用相同内容' },
                          { type: 'array', items: { type: 'string' }, description: `多语言翻译：按配置语言顺序传入` },
                        ],
                        description: '消息内容，varchar(1000)，必填',
                      },
```

- [ ] **Step 2: Commit**

```bash
git add src/mcp/mcp-server.ts
git commit -m "mcp: dynamic description and MESSAGE array schema"
```

---

### Task 4: Fix generateMessageId and Support MESSAGE Array

**Files:**
- Modify: `src/core/database-service.ts`

- [ ] **Step 1: Fix `generateMessageId()` logic**

Replace the entire `generateMessageId()` method (around line 333-367) with:

```typescript
  private async generateMessageId(): Promise<number> {
    const cfg = this.errorTableConfig;
    if (!cfg?.errorTable || !cfg?.errorSeqName) {
      throw new Error('未配置目标错误信息表或序列表');
    }

    const mainTableRef = cfg.errorDatabase
      ? `${cfg.errorDatabase}.${cfg.errorTable}`
      : cfg.errorTable;
    const suffix = cfg.errorSeqSuffix || '001';
    const divisor = Math.pow(10, suffix.length);

    // 1. 查询 message 表最大值
    const maxQuery = `SELECT MAX(MESSAGE_ID) as max_id FROM ${this.quoteIdentifier(mainTableRef)}`;
    const maxResult = await this.adapter.executeQuery(maxQuery);
    const maxId = (maxResult.rows[0]?.max_id as number) || 0;
    const maxBase = Math.floor(maxId / divisor);

    // 2. 查询序列表
    const seqQuery = `SELECT CURRENT_VALUE FROM ${this.quoteIdentifier('mt_sys_sequence')} WHERE NAME = ?`;
    const seqResult = await this.adapter.executeQuery(seqQuery, [cfg.errorSeqName]);
    const seqValue = (seqResult.rows[0]?.CURRENT_VALUE as number) || 0;

    // 3. 比较取大，统一先 +1
    let base: number;
    if (maxBase >= seqValue) {
      base = maxBase + 1;
    } else {
      base = seqValue + 1;
    }

    // 4. 更新序列表
    const updateSeq = `UPDATE ${this.quoteIdentifier('mt_sys_sequence')} SET CURRENT_VALUE = ? WHERE NAME = ?`;
    const updateResult = await this.adapter.executeQuery(updateSeq, [base, cfg.errorSeqName]);

    // 5. 检查更新是否生效，为 0 则插入新记录
    if ((updateResult.affectedRows || 0) === 0) {
      const insertSeq = `INSERT INTO ${this.quoteIdentifier('mt_sys_sequence')} (NAME, CURRENT_VALUE) VALUES (?, ?)`;
      await this.adapter.executeQuery(insertSeq, [cfg.errorSeqName, base]);
    }

    // 6. 字符串拼接生成 MESSAGE_ID
    return parseInt(`${base}${suffix}`, 10);
  }
```

- [ ] **Step 2: Support `MESSAGE` array in `insertExceptionData()`**

In `insertExceptionData()`, find the tl table insertion loop (around line 433-436). Replace:

```typescript
      for (const locale of locales) {
        tlValues.push(messageId, locale, row.MESSAGE);
        tlPlaceholders.push(`(${tlColumns.map(() => '?').join(', ')})`);
      }
```

With:

```typescript
      for (const [index, locale] of locales.entries()) {
        const message = Array.isArray(row.MESSAGE)
          ? (row.MESSAGE[index] ?? row.MESSAGE[0])
          : row.MESSAGE;
        tlValues.push(messageId, locale, message);
        tlPlaceholders.push(`(${tlColumns.map(() => '?').join(', ')})`);
      }
```

Also update the method signature (around line 382):

```typescript
  async insertExceptionData(
    data: Array<{ MESSAGE_CODE: string; MESSAGE: string | string[] }>
  ): Promise<InsertExceptionDataResult> {
```

- [ ] **Step 3: Commit**

```bash
git add src/core/database-service.ts
git commit -m "feat: fix generateMessageId and support MESSAGE array"
```

---

### Task 5: Hard-Restrict executeQuery to SELECT

**Files:**
- Modify: `src/core/database-service.ts`
- Modify: `src/http/routes/query.ts`

- [ ] **Step 1: Add SELECT-only guard in `executeQuery()`**

In `src/core/database-service.ts`, add after `this.validateQuery(query);` (line 95):

```typescript
    // Hard restriction: execute_query only allows SELECT
    const trimmedQuery = query.trim();
    if (!/^\s*SELECT\b/i.test(trimmedQuery)) {
      throw new Error('❌ execute_query 仅支持 SELECT 查询');
    }
```

- [ ] **Step 2: Add SELECT-only guard in HTTP `/api/execute`**

In `src/http/routes/query.ts`, inside the `/api/execute` handler (around line 96), add before `const result = await service.executeQuery(query, params);`:

```typescript
      // Hard restriction: /api/execute only allows SELECT
      if (!/^\s*SELECT\b/i.test(query.trim())) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: 'INVALID_QUERY',
            message: '❌ /api/execute 仅支持 SELECT 查询',
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: request.id,
          },
        };
      }
```

- [ ] **Step 3: Update HTTP `/api/insert-exception-data` schema**

In `src/http/routes/query.ts`, find the `data` schema in `/api/insert-exception-data` (around line 145-156). Replace the `MESSAGE` property:

```typescript
                MESSAGE: { type: 'string' },
```

With:

```typescript
                MESSAGE: {
                  anyOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } },
                  ],
                },
```

- [ ] **Step 4: Commit**

```bash
git add src/core/database-service.ts src/http/routes/query.ts
git commit -m "feat: hard-restrict execute_query to SELECT, update HTTP schema"
```

---

### Task 6: Compile and Verify

**Files:**
- N/A (verification only)

- [ ] **Step 1: TypeScript compilation check**

Run:

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Check for type consistency**

Verify:
- `ErrorTableConfig.errorSeqSuffix` is used consistently across all files
- `InsertExceptionDataRequest.MESSAGE` is `string | string[]` everywhere
- `generateMessageId()` return type remains `Promise<number>`

- [ ] **Step 3: Commit (if any fixes needed)**

If compilation reveals issues, fix them and commit:

```bash
git add -A
git commit -m "fix: resolve compilation issues"
```

---

## Self-Review

**1. Spec coverage:**

| Spec Requirement | Plan Task |
|-----------------|-----------|
| MESSAGE 支持 `string \| string[]` | Task 1, Task 4 |
| Description 动态注入 errorLocales | Task 3 |
| maxBase 用 suffix 长度动态计算 | Task 4 |
| else 分支 base = seqValue + 1 | Task 4 |
| UPDATE 后检查 affectedRows + INSERT | Task 4 |
| 后缀配置 errorSeqSuffix | Task 2, Task 4 |
| 字符串拼接生成 MESSAGE_ID | Task 4 |
| execute_query 硬限制 SELECT | Task 5 |
| /api/execute 硬限制 SELECT | Task 5 |

**2. Placeholder scan:** No TBD, TODO, or vague descriptions. All steps contain actual code.

**3. Type consistency:**
- `errorSeqSuffix?: string` defined in Task 1, used in Task 2 (config), Task 4 (logic)
- `MESSAGE: string | string[]` defined in Task 1, used in Task 4 (logic), Task 5 (HTTP schema)
- `generateMessageId` returns `Promise<number>` consistently

---

*Plan complete. Ready for execution.*
