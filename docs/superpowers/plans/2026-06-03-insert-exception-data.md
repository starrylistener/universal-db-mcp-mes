# insert_exception_data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a custom MCP tool `insert_exception_data` that inserts error codes and messages into a configured main table and its multilingual tl table, with MESSAGE_ID generated from a sequence table.

**Architecture:** Extend `DatabaseService` with `insertExceptionData()` method that generates MESSAGE_ID via sequence table lookup, then inserts into both main and tl tables. Configuration flows from CLI args/env vars through `DatabaseMCPServer` to `DatabaseService`. REST API endpoint mirrors MCP tool.

**Tech Stack:** TypeScript, mysql2/promise, Fastify, MCP SDK

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/adapter.ts` | Modify | Add `ErrorTableConfig` and `InsertExceptionDataResult` interfaces |
| `src/types/http.ts` | Modify | Add `InsertExceptionDataRequest` and `InsertExceptionDataResponse` interfaces |
| `src/utils/config-loader.ts` | Modify | Load `ERROR_DATABASE`, `ERROR_TABLE`, `ERROR_SEQ_NAME`, `ERROR_TL_TABLE`, `ERROR_MULTILANG`, `ERROR_LOCALES` from env vars |
| `src/mcp/mcp-index.ts` | Modify | Parse `--error-database`, `--error-table`, `--error-seq-name`, `--error-tl-table`, `--error-multilang`, `--error-locales` CLI args |
| `src/mcp/mcp-server.ts` | Modify | Accept `ErrorTableConfig` in constructor; register `insert_exception_data` tool |
| `src/core/database-service.ts` | Modify | Accept `ErrorTableConfig`; add `insertExceptionData()`, `generateMessageId()`, `buildInsertSql()`, `hasInsertPermission()` |
| `src/http/routes/query.ts` | Modify | Add `POST /api/insert-exception-data` endpoint |

---

### Task 1: Add Type Definitions

**Files:**
- Modify: `src/types/adapter.ts`
- Modify: `src/types/http.ts`

- [ ] **Step 1: Add `ErrorTableConfig` and `InsertExceptionDataResult` to adapter.ts**

Append to `src/types/adapter.ts` after the `SampleDataResult` interface:

```typescript
/**
 * 错误信息表配置
 */
export interface ErrorTableConfig {
  /** 错误信息表所在数据库 / schema */
  errorDatabase?: string;
  /** 错误信息表名 */
  errorTable?: string;
  /** 序列表 NAME 值 */
  errorSeqName?: string;
  /** 多语言表名 */
  errorTlTable?: string;
  /** 多语言开关 */
  errorMultilang?: boolean;
  /** 语言列表 */
  errorLocales?: string[];
}

/**
 * insert_exception_data 结果
 */
export interface InsertExceptionDataResult {
  /** 主表受影响的行数 */
  affectedRows: number;
}
```

- [ ] **Step 2: Add HTTP request/response types to http.ts**

Append to `src/types/http.ts` after the `Session` interface:

```typescript
/**
 * Insert Exception Data Request
 */
export interface InsertExceptionDataRequest {
  sessionId: string;
  data: Array<{
    MESSAGE_CODE: string;
    MESSAGE: string;
  }>;
}

/**
 * Insert Exception Data Response
 */
export interface InsertExceptionDataResponse {
  affectedRows: number;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types/adapter.ts src/types/http.ts
git commit -m "types: add ErrorTableConfig and insert_exception_data types"
```

---

### Task 2: Update Config Loader

**Files:**
- Modify: `src/utils/config-loader.ts`

- [ ] **Step 1: Import ErrorTableConfig and update loadFromEnv**

At the top of `src/utils/config-loader.ts`, add import:

```typescript
import type { ErrorTableConfig } from '../types/adapter.js';
```

In `loadFromEnv()`, after the `// Database configuration` block, add:

```typescript
  // Error table configuration
  if (process.env.ERROR_TABLE || process.env.ERROR_DATABASE) {
    config.errorTable = {
      errorDatabase: process.env.ERROR_DATABASE,
      errorTable: process.env.ERROR_TABLE,
      errorSeqName: process.env.ERROR_SEQ_NAME || 'mt_error_message_s',
      errorTlTable: process.env.ERROR_TL_TABLE,
      errorMultilang: process.env.ERROR_MULTILANG === 'true',
      errorLocales: process.env.ERROR_LOCALES
        ? process.env.ERROR_LOCALES.split(',').map(s => s.trim())
        : ['zh_CN', 'en_US'],
    };
  }
```

- [ ] **Step 2: Update AppConfig interface**

Add `errorTable` to `AppConfig` in `src/types/http.ts` (also update it in `src/utils/config-loader.ts` if it has a local copy — it imports from `http.ts`):

In `src/types/http.ts`, update `AppConfig`:

```typescript
import type { DbConfig, ErrorTableConfig } from './adapter.js';

export interface AppConfig {
  mode: 'mcp' | 'http';
  database?: DbConfig;
  http?: HttpConfig;
  errorTable?: ErrorTableConfig;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/config-loader.ts src/types/http.ts
git commit -m "config: load error table configuration from env vars"
```

---

### Task 3: Update MCP Entry CLI Arguments

**Files:**
- Modify: `src/mcp/mcp-index.ts`

- [ ] **Step 1: Add CLI options and pass to DatabaseMCPServer**

In `src/mcp/mcp-index.ts`, add new options to the `.option()` chain (before `.action()`):

```typescript
    .option('--error-database <db>', '错误信息表所在数据库 / schema')
    .option('--error-table <table>', '错误信息表名')
    .option('--error-seq-name <name>', '序列表 NAME 值', 'mt_error_message_s')
    .option('--error-tl-table <table>', '错误信息多语言表名')
    .option('--error-multilang', '启用多语言模式', false)
    .option('--error-locales <list>', '多语言列表，逗号分隔', 'zh_CN,en_US')
```

Inside the `.action(async (options) => { ... })` block, where `config` is built, add:

```typescript
          // Build error table configuration
          const errorTableConfig: ErrorTableConfig = {
            errorDatabase: options.errorDatabase,
            errorTable: options.errorTable,
            errorSeqName: options.errorSeqName,
            errorTlTable: options.errorTlTable,
            errorMultilang: options.errorMultilang,
            errorLocales: options.errorLocales.split(',').map((s: string) => s.trim()),
          };
```

Pass it to `DatabaseMCPServer`:

```typescript
          // Create server
          const server = new DatabaseMCPServer(config, {}, errorTableConfig);
```

And also in the else branch (no initial config):

```typescript
          const server = new DatabaseMCPServer(undefined, {}, errorTableConfig);
```

- [ ] **Step 2: Commit**

```bash
git add src/mcp/mcp-index.ts
git commit -m "mcp: add error table CLI arguments"
```

---

### Task 4: Update DatabaseMCPServer to Accept ErrorTableConfig

**Files:**
- Modify: `src/mcp/mcp-server.ts`

- [ ] **Step 1: Update constructor, fields, and setAdapter**

Add import:

```typescript
import type { ErrorTableConfig, InsertExceptionDataResult } from '../types/adapter.js';
```

Update class fields:

```typescript
  private server: Server;
  private adapter: DbAdapter | null = null;
  private config: DbConfig | null;
  private databaseService: DatabaseService | null = null;
  private cacheConfig: Partial<SchemaCacheConfig>;
  private errorTableConfig: ErrorTableConfig | undefined;
```

Update constructor:

```typescript
  constructor(config?: DbConfig, cacheConfig?: Partial<SchemaCacheConfig>, errorTableConfig?: ErrorTableConfig) {
    this.config = config || null;
    this.cacheConfig = cacheConfig || {};
    this.errorTableConfig = errorTableConfig;
    this.server = new Server(
      {
        name: 'universal-db-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }
```

Update `setAdapter`:

```typescript
  setAdapter(adapter: DbAdapter): void {
    this.adapter = adapter;
    if (this.config) {
      this.databaseService = new DatabaseService(adapter, this.config, this.cacheConfig, undefined, this.errorTableConfig);
    }
  }
```

- [ ] **Step 2: Update connect_database handler to pass errorTableConfig**

In the `connect_database` case inside `CallToolRequestSchema`, where `new DatabaseService` is created:

```typescript
            this.databaseService = new DatabaseService(newAdapter, newConfig, this.cacheConfig, undefined, this.errorTableConfig);
```

- [ ] **Step 3: Commit**

```bash
git add src/mcp/mcp-server.ts
git commit -m "mcp: pass ErrorTableConfig through DatabaseMCPServer"
```

---

### Task 5: Implement Core Logic in DatabaseService

**Files:**
- Modify: `src/core/database-service.ts`

- [ ] **Step 1: Update imports and constructor**

Update imports:

```typescript
import type { DbAdapter, DbConfig, QueryResult, SchemaInfo, TableInfo, EnumValuesResult, SampleDataResult, ErrorTableConfig, InsertExceptionDataResult } from '../types/adapter.js';
import { validateQuery, resolvePermissions } from '../utils/safety.js';
```

Update class fields (add after `private dataMasker: DataMasker;`):

```typescript
  // 错误信息表配置
  private errorTableConfig: ErrorTableConfig | undefined;
```

Update constructor signature and body:

```typescript
  constructor(
    adapter: DbAdapter,
    config: DbConfig,
    cacheConfig?: Partial<SchemaCacheConfig>,
    enhancerConfig?: Partial<SchemaEnhancerConfig>,
    errorTableConfig?: ErrorTableConfig
  ) {
    this.adapter = adapter;
    this.config = config;
    this.cacheConfig = { ...DEFAULT_CACHE_CONFIG, ...cacheConfig };
    this.schemaEnhancer = new SchemaEnhancer(enhancerConfig);
    this.dataMasker = createDataMasker(true);
    this.errorTableConfig = errorTableConfig;
  }
```

- [ ] **Step 2: Add insertExceptionData method**

Add after the `getConfig()` method:

```typescript
  /**
   * 检查是否有插入权限
   */
  private hasInsertPermission(): boolean {
    const permissions = resolvePermissions(this.config);
    return permissions.includes('insert');
  }

  /**
   * 生成 MESSAGE_ID
   * 从 mt_sys_sequence 取 CURRENT_VALUE，与 message 表 MAX(MESSAGE_ID) 比较取大
   */
  private async generateMessageId(): Promise<number> {
    const cfg = this.errorTableConfig;
    if (!cfg?.errorTable || !cfg?.errorSeqName) {
      throw new Error('未配置目标错误信息表或序列表');
    }

    const mainTableRef = cfg.errorDatabase
      ? `${cfg.errorDatabase}.${cfg.errorTable}`
      : cfg.errorTable;

    // 1. 查询 message 表最大值
    const maxQuery = `SELECT MAX(MESSAGE_ID) as max_id FROM ${this.quoteIdentifier(mainTableRef)}`;
    const maxResult = await this.adapter.executeQuery(maxQuery);
    const maxId = (maxResult.rows[0]?.max_id as number) || 0;
    const maxBase = Math.floor(maxId / 1000);

    // 2. 查询序列表
    const seqQuery = `SELECT CURRENT_VALUE FROM ${this.quoteIdentifier('mt_sys_sequence')} WHERE NAME = ?`;
    const seqResult = await this.adapter.executeQuery(seqQuery, [cfg.errorSeqName]);
    const seqValue = (seqResult.rows[0]?.CURRENT_VALUE as number) || 0;

    // 3. 比较取大
    let base: number;
    if (maxBase >= seqValue) {
      base = maxBase + 1;
      const updateSeq = `UPDATE ${this.quoteIdentifier('mt_sys_sequence')} SET CURRENT_VALUE = ? WHERE NAME = ?`;
      await this.adapter.executeQuery(updateSeq, [base, cfg.errorSeqName]);
    } else {
      base = seqValue;
      const updateSeq = `UPDATE ${this.quoteIdentifier('mt_sys_sequence')} SET CURRENT_VALUE = ? WHERE NAME = ?`;
      await this.adapter.executeQuery(updateSeq, [seqValue + 1, cfg.errorSeqName]);
    }

    return base * 1000 + 1;
  }

  /**
   * 构建 INSERT SQL
   */
  private buildInsertSql(table: string, columns: string[]): string {
    const quotedTable = this.quoteIdentifier(table);
    const quotedColumns = columns.map(c => this.quoteIdentifier(c)).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    return `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${placeholders})`;
  }

  /**
   * 向错误信息表插入数据
   */
  async insertExceptionData(
    data: Array<{ MESSAGE_CODE: string; MESSAGE: string }>
  ): Promise<InsertExceptionDataResult> {
    const cfg = this.errorTableConfig;
    if (!cfg?.errorTable || !cfg?.errorTlTable) {
      throw new Error('未配置目标错误信息表或多语言表。请通过 --error-table 和 --error-tl-table 参数指定');
    }

    if (!this.hasInsertPermission()) {
      throw new Error('❌ 当前权限模式不允许插入操作，需要 insert 权限');
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('❌ data 必须是非空数组');
    }

    if (data.length > 1000) {
      throw new Error('❌ 单次插入最多 1000 行');
    }

    const mainTableRef = cfg.errorDatabase
      ? `${cfg.errorDatabase}.${cfg.errorTable}`
      : cfg.errorTable;
    const tlTableRef = cfg.errorDatabase
      ? `${cfg.errorDatabase}.${cfg.errorTlTable}`
      : cfg.errorTlTable;
    const locales = cfg.errorLocales || ['zh_CN', 'en_US'];

    let totalAffectedRows = 0;

    for (const row of data) {
      const messageId = await this.generateMessageId();

      // 插入主表
      const mainColumns = [
        'MESSAGE_ID', 'TENANT_ID', 'MESSAGE_CODE', 'MESSAGE',
        'INITIAL_FLAG', 'CID', 'OBJECT_VERSION_NUMBER',
        'CREATED_BY', 'CREATION_DATE', 'LAST_UPDATED_BY', 'LAST_UPDATE_DATE',
      ];
      const mainValues = [
        messageId, 2, row.MESSAGE_CODE, row.MESSAGE,
        'N', null, 1,
        null, null, null, null,
      ];
      const mainSql = this.buildInsertSql(mainTableRef, mainColumns);
      const mainResult = await this.adapter.executeQuery(mainSql, mainValues);
      totalAffectedRows += mainResult.affectedRows || 0;

      // 插入 tl 表（批量每种语言）
      const tlColumns = ['MESSAGE_ID', 'LANG', 'MESSAGE'];
      const tlValues: unknown[] = [];
      const tlPlaceholders: string[] = [];

      for (const locale of locales) {
        tlValues.push(messageId, locale, row.MESSAGE);
        tlPlaceholders.push(`(${tlColumns.map(() => '?').join(', ')})`);
      }

      const tlQuotedTable = this.quoteIdentifier(tlTableRef);
      const tlQuotedColumns = tlColumns.map(c => this.quoteIdentifier(c)).join(', ');
      const tlSql = `INSERT INTO ${tlQuotedTable} (${tlQuotedColumns}) VALUES ${tlPlaceholders.join(', ')}`;
      await this.adapter.executeQuery(tlSql, tlValues);
    }

    return { affectedRows: totalAffectedRows };
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/core/database-service.ts
git commit -m "feat: add insertExceptionData with MESSAGE_ID sequence generation"
```

---

### Task 6: Register MCP Tool

**Files:**
- Modify: `src/mcp/mcp-server.ts`

- [ ] **Step 1: Add tool definition to ListToolsRequestSchema**

In `setupHandlers()`, within the `ListToolsRequestSchema` handler, add this tool object to the `tools` array (after `get_connection_status`):

```typescript
          {
            name: 'insert_exception_data',
            description: '向配置的错误信息表及其多语言表插入数据。AI 只需传入 MESSAGE_CODE 和 MESSAGE，系统会自动填充租户ID、审计字段、初始标识，并从序列表生成 MESSAGE_ID。',
            inputSchema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  description: '要插入的错误信息数据行',
                  items: {
                    type: 'object',
                    properties: {
                      MESSAGE_CODE: { type: 'string', description: '消息编码，varchar(255)，必填' },
                      MESSAGE: { type: 'string', description: '消息内容，varchar(1000)，必填' },
                    },
                    required: ['MESSAGE_CODE', 'MESSAGE'],
                  },
                },
              },
              required: ['data'],
            },
          },
```

- [ ] **Step 2: Add handler to CallToolRequestSchema**

In the `CallToolRequestSchema` handler, within the `default:` case's `try` block but before the `// 以下 tool 需要数据库已连接` check, add a new `case` (after `get_connection_status`):

```typescript
          case 'insert_exception_data': {
            const { data } = args as { data: Array<{ MESSAGE_CODE: string; MESSAGE: string }> };

            console.error(`📝 插入错误信息数据: ${data.length} 行`);

            const result = await this.databaseService.insertExceptionData(data);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    affectedRows: result.affectedRows,
                    message: `成功插入 ${result.affectedRows} 条错误信息`,
                  }, null, 2),
                },
              ],
            };
          }
```

- [ ] **Step 3: Commit**

```bash
git add src/mcp/mcp-server.ts
git commit -m "mcp: register insert_exception_data tool"
```

---

### Task 7: Add REST API Endpoint

**Files:**
- Modify: `src/http/routes/query.ts`

- [ ] **Step 1: Add import and endpoint**

Update imports:

```typescript
import type { QueryRequest, ExecuteRequest, ApiResponse, HttpQueryResult, InsertExceptionDataRequest, InsertExceptionDataResponse } from '../../types/http.js';
```

Append to `setupQueryRoutes` function (after the `/api/execute` route):

```typescript
  /**
   * POST /api/insert-exception-data
   * Insert exception data into configured error table and tl table
   */
  fastify.post<{
    Body: InsertExceptionDataRequest;
    Reply: ApiResponse<InsertExceptionDataResponse>;
  }>('/api/insert-exception-data', {
    schema: {
      body: {
        type: 'object',
        required: ['sessionId', 'data'],
        properties: {
          sessionId: { type: 'string' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              required: ['MESSAGE_CODE', 'MESSAGE'],
              properties: {
                MESSAGE_CODE: { type: 'string' },
                MESSAGE: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { sessionId, data } = request.body;

      const service = connectionManager.getService(sessionId);
      const result = await service.insertExceptionData(data);

      return {
        success: true,
        data: {
          affectedRows: result.affectedRows,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: {
          code: 'INSERT_EXCEPTION_DATA_FAILED',
          message: error instanceof Error ? error.message : 'Failed to insert exception data',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    }
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/http/routes/query.ts
git commit -m "http: add POST /api/insert-exception-data endpoint"
```

---

### Task 8: Compile and Test

**Files:**
- N/A (verification only)

- [ ] **Step 1: TypeScript compilation check**

Run:

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run existing unit tests**

Run:

```bash
npm run test:unit
```

Expected: All existing tests pass (no regressions).

- [ ] **Step 3: Commit (if any fixes needed)**

If compilation or tests reveal issues, fix them and commit:

```bash
git add -A
git commit -m "fix: resolve compilation and test issues"
```

---

## Self-Review

**1. Spec coverage:**

| Spec Requirement | Implementation Task |
|-----------------|---------------------|
| AI exposes only MESSAGE_CODE and MESSAGE | Task 6 (tool schema), Task 5 (method signature) |
| System fills TENANT_ID=2, INITIAL_FLAG='N', etc. | Task 5 (insertExceptionData method) |
| MESSAGE_ID from mt_sys_sequence | Task 5 (generateMessageId method) |
| Compare message table MAX vs sequence | Task 5 (generateMessageId method) |
| Insert failure does not rollback sequence | Task 5 (no rollback in catch) |
| tl table always inserted | Task 5 (insertExceptionData loop) |
| Same MESSAGE for all locales (phase 1) | Task 5 (tlValues uses row.MESSAGE) |
| Configuration via CLI/env | Task 2, Task 3 |
| Batch limit 1000 | Task 5 (length check) |
| Parameterized queries | Task 5 (buildInsertSql with ? placeholders) |
| REST API endpoint | Task 7 |
| Permission check | Task 5 (hasInsertPermission) |

**2. Placeholder scan:** No TBD, TODO, or vague descriptions found. All steps contain actual code.

**3. Type consistency:**
- `ErrorTableConfig` defined in Task 1, used consistently in Task 2, 3, 4, 5
- `InsertExceptionDataResult` defined in Task 1, used in Task 5, 6, 7
- `InsertExceptionDataRequest`/`Response` defined in Task 1, used in Task 7
- Method signatures match between `DatabaseService` (Task 5) and MCP/HTTP callers (Task 6, 7)

---

*Plan complete. Ready for execution.*
