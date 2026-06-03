#!/usr/bin/env node

/**
 * MCP 数据库万能连接器 - 主服务器
 * 通过 Model Context Protocol 让 Claude Desktop 连接数据库
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { DbAdapter, DbConfig, ErrorTableConfig } from '../types/adapter.js';
import { DatabaseService, SchemaCacheConfig } from '../core/database-service.js';
import { createAdapter, normalizeDbType } from '../utils/adapter-factory.js';

/**
 * 数据库 MCP 服务器类
 */
export class DatabaseMCPServer {
  private server: Server;
  private adapter: DbAdapter | null = null;
  private config: DbConfig | null;
  private databaseService: DatabaseService | null = null;
  private cacheConfig: Partial<SchemaCacheConfig>;
  private errorTableConfig: ErrorTableConfig | undefined;

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

  /**
   * 设置 MCP 协议处理器
   */
  private setupHandlers(): void {
    // 列出可用工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'execute_query',
            description: '执行 SQL 查询。仅支持 SELECT、JOIN、聚合等只读查询操作，INSERT/UPDATE/DELETE 已被系统硬限制禁止。',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: '要执行的 SQL 语句或数据库命令',
                },
                params: {
                  type: 'array',
                  description: '查询参数（可选，用于参数化查询防止 SQL 注入）',
                  items: {
                    type: 'string',
                  },
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_schema',
            description: '获取数据库结构信息，包括所有 Schema 中用户可访问的表名、列名、数据类型、主键、索引等元数据。在执行查询前调用此工具可以帮助理解数据库结构。结果会被缓存以提高性能。',
            inputSchema: {
              type: 'object',
              properties: {
                forceRefresh: {
                  type: 'boolean',
                  description: '是否强制刷新缓存（可选，默认 false）。设为 true 可获取最新的数据库结构。',
                },
              },
            },
          },
          {
            name: 'get_table_info',
            description: '获取指定表的详细信息，包括列定义、索引、预估行数等。用于深入了解某个表的结构。',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: '表名。支持 schema.table_name 格式指定 Schema（如 analytics.users）。不指定 Schema 时查询默认 Schema。',
                },
                forceRefresh: {
                  type: 'boolean',
                  description: '是否强制刷新缓存（可选，默认 false）',
                },
              },
              required: ['tableName'],
            },
          },
          {
            name: 'clear_cache',
            description: '清除 Schema 缓存。当数据库结构发生变化（如新增表、修改列）时，可以调用此工具清除缓存。',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_enum_values',
            description: '获取指定列的所有唯一值。用于了解 status、type、category 等枚举类型列的所有可能值，帮助生成准确的 WHERE 条件。例如：获取 orders.status 列的所有状态值（pending, shipped, delivered 等）。',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: '表名。支持 schema.table_name 格式指定 Schema（如 analytics.users）。',
                },
                columnName: {
                  type: 'string',
                  description: '列名（通常是 status、type、category 等枚举类型的列）',
                },
                limit: {
                  type: 'number',
                  description: '最大返回数量（可选，默认 50，最大 100）。如果唯一值超过此数量，说明该列可能不是枚举类型。',
                },
                includeCount: {
                  type: 'boolean',
                  description: '是否包含每个值的出现次数（可选，默认 false）。设为 true 可了解数据分布。',
                },
              },
              required: ['tableName', 'columnName'],
            },
          },
          {
            name: 'get_sample_data',
            description: '获取表的示例数据（已自动脱敏）。用于了解数据格式，如日期格式（2024-01-01 vs 20240101）、ID格式（UUID vs 自增）、金额精度等。敏感数据（手机号、邮箱、身份证等）会自动脱敏保护隐私。',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: '表名。支持 schema.table_name 格式指定 Schema（如 analytics.users）。',
                },
                columns: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '要查看的列（可选，默认全部列）',
                },
                limit: {
                  type: 'number',
                  description: '返回行数（可选，默认 3，最大 10）',
                },
              },
              required: ['tableName'],
            },
          },
          {
            name: 'connect_database',
            description: '连接到数据库。支持动态指定数据库类型和连接参数，无需重启服务。如果当前已有连接，会自动断开旧连接再建立新连接。支持的数据库类型：mysql, postgres, redis, oracle, dm, sqlserver, mongodb, sqlite, kingbase, gaussdb, oceanbase, tidb, clickhouse, polardb, vastbase, highgo, goldendb。',
            inputSchema: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  description: '数据库类型',
                  enum: [
                    'mysql', 'postgres', 'redis', 'oracle', 'dm', 'sqlserver',
                    'mongodb', 'sqlite', 'kingbase', 'gaussdb', 'oceanbase',
                    'tidb', 'clickhouse', 'polardb', 'vastbase', 'highgo', 'goldendb',
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
          {
            name: 'insert_exception_data',
            description: (() => {
              const locales = this.errorTableConfig?.errorLocales || ['zh_CN', 'en_US'];
              const localesStr = locales.join(', ');
              return `向 Hzero 平台注册新的错误码及其多语言提示信息。当用户描述业务场景并提到"xxx时，报错xxx"、"报错xxxx"、"出现错误/异常/失败"、"需要抛出一个错误"、"新增错误码"、"消息维护"等情境时，AI 应主动生成合适的 MESSAGE_CODE 和 MESSAGE，并调用此工具完成注册。

【重要 — 禁止查表】后台表映射、字段映射、ID 生成规则均已预配置完成，AI 完全不需要关心表名、表结构或列定义。禁止在调用本工具前使用 get_schema、get_table_info 或 execute_query 去查看任何相关表结构，也禁止向用户询问"表名是什么"或"需要插入到哪张表"。系统会自动处理后台存储、ID 生成、多语言关联等全部细节，AI 只需提供业务内容。

【MESSAGE_CODE 生成规则】
- 格式：模块名.模块描述_递增编号（全大写）。模块名与模块描述之间用点号分隔，模块描述内部单词用下划线连接，模块描述与3位数字编号之间用下划线分隔。
- 示例：HME.WORKING_PART_NEW_044。其中 HME 是模块名，WORKING_PART_NEW 是模块描述，044 是递增编号。
- AI 应根据业务上下文、类名或历史沿用规则，生成 2-3 个候选编码供用户选择。

【执行前确认 — 必须步骤】
AI 生成候选编码和翻译后，必须向用户完整展示以下内容并征得用户明确同意后再调用本工具：
1. MESSAGE_CODE（候选编码及用户最终选定的一个）
2. MESSAGE 各语言内容（按 ${localesStr} 顺序列出）
禁止未经用户确认直接调用本工具插入。

【多语言传入规则】当前配置的语言顺序为：${localesStr}。
- 默认行为：MESSAGE 应传字符串数组，为每种语言提供对应翻译。数组长度必须等于语言数量（${locales.length}个），且严格按 ${localesStr} 的顺序一一对应。
- 例外：仅当用户明确表示"只用中文"或"所有语言相同"时，MESSAGE 才可传单个字符串。
- 示例：${locales.length === 3 ? '["连接超时", "Connection timeout", "Hết thởi gian chờ"]' : '["连接超时", "Connection timeout"]'}。缺失语言会自动回退到数组第一项。`;
            })(),
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
                      MESSAGE: {
                        anyOf: [
                          { type: 'string', description: '单语言：所有语言使用相同内容' },
                          { type: 'array', items: { type: 'string' }, description: `多语言翻译：必须严格按当前配置语言顺序传入，数组长度必须等于语言数量` },
                        ],
                        description: '消息内容，varchar(1000)，必填',
                      },
                    },
                    required: ['MESSAGE_CODE', 'MESSAGE'],
                  },
                },
              },
              required: ['data'],
            },
          },
        ],
      };
    });

    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // 连接管理类 tool 不需要检查数据库连接
        switch (name) {
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
            const newAdapter = createAdapter(newConfig);
            await newAdapter.connect();

            this.adapter = newAdapter;
            this.config = newConfig;
            this.databaseService = new DatabaseService(newAdapter, newConfig, this.cacheConfig, undefined, this.errorTableConfig);

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

          default:
            break;
        }

        // 以下 tool 需要数据库已连接
        if (!this.databaseService) {
          throw new Error('数据库未连接。请先使用 connect_database 工具连接数据库。');
        }

        switch (name) {
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

          case 'execute_query': {
            const { query, params } = args as { query: string; params?: unknown[] };

            console.error(`📊 执行查询: ${query.substring(0, 100)}...`);

            const result = await this.databaseService.executeQuery(query, params);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_schema': {
            const { forceRefresh } = (args as { forceRefresh?: boolean }) || {};

            console.error('📋 获取数据库结构...');

            const schema = await this.databaseService.getSchema(forceRefresh);

            // 添加缓存状态信息
            const cacheStats = this.databaseService.getCacheStats();
            const response = {
              ...schema,
              _cacheInfo: {
                cached: cacheStats.isCached,
                cachedAt: cacheStats.cachedAt?.toISOString(),
                hitRate: this.databaseService.getCacheHitRate() + '%',
              },
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'get_table_info': {
            const { tableName, forceRefresh } = args as { tableName: string; forceRefresh?: boolean };

            console.error(`📄 获取表信息: ${tableName}`);

            const table = await this.databaseService.getTableInfo(tableName, forceRefresh);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(table, null, 2),
                },
              ],
            };
          }

          case 'clear_cache': {
            console.error('🗑️ 清除 Schema 缓存...');

            this.databaseService.clearSchemaCache();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: 'Schema 缓存已清除',
                  }, null, 2),
                },
              ],
            };
          }

          case 'get_enum_values': {
            const { tableName, columnName, limit, includeCount } = args as {
              tableName: string;
              columnName: string;
              limit?: number;
              includeCount?: boolean;
            };

            console.error(`🔢 获取枚举值: ${tableName}.${columnName}`);

            const result = await this.databaseService.getEnumValues(
              tableName,
              columnName,
              limit,
              includeCount
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_sample_data': {
            const { tableName, columns, limit } = args as {
              tableName: string;
              columns?: string[];
              limit?: number;
            };

            console.error(`📝 获取示例数据: ${tableName}`);

            const result = await this.databaseService.getSampleData(
              tableName,
              columns,
              limit
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`未知工具: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ 错误: ${errorMessage}`);

        return {
          content: [
            {
              type: 'text',
              text: `执行失败: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * 设置数据库适配器
   */
  setAdapter(adapter: DbAdapter): void {
    this.adapter = adapter;
    if (this.config) {
      this.databaseService = new DatabaseService(adapter, this.config, this.cacheConfig, undefined, this.errorTableConfig);
    }
  }

  /**
   * 获取 MCP Server 实例（用于 SSE/HTTP 传输）
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * 连接数据库（不启动传输层）
   */
  async connectDatabase(): Promise<void> {
    if (!this.adapter) {
      throw new Error('必须先设置数据库适配器才能连接数据库');
    }

    // 连接数据库
    console.error('🔌 正在连接数据库...');
    await this.adapter.connect();
    console.error('✅ 数据库连接成功');

    // 显示安全模式状态
    if (this.config?.allowWrite) {
      console.error('⚠️  警告: 写入模式已启用，请谨慎操作！');
    } else {
      console.error('🛡️  安全模式: 只读模式（推荐）');
    }

    // 显示缓存配置
    console.error('📦 Schema 缓存已启用 (默认 TTL: 5 分钟)');
  }

  /**
   * 使用指定的传输层连接 MCP 服务器
   */
  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  /**
   * 启动服务器（使用 stdio 传输，用于 Claude Desktop）
   */
  async start(): Promise<void> {
    // 如果有初始配置和适配器，先连接；否则等待 AI 调用 connect_database
    if (this.adapter) {
      await this.connectDatabase();
    } else {
      console.error('📡 MCP 服务器以无连接模式启动，等待通过 connect_database 工具连接数据库...');
    }

    // 启动 MCP 服务器（stdio 模式）
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('🚀 MCP 服务器已启动，等待客户端连接...');
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    // 1. 关闭 MCP Server（释放 transport 层资源：stdin/stdout 监听器等）
    try {
      await this.server.close();
    } catch (err) {
      console.error('关闭 MCP Server 时出错:', err instanceof Error ? err.message : String(err));
    }

    // 2. 清理 Schema 缓存
    if (this.databaseService) {
      this.databaseService.clearSchemaCache();
    }

    // 3. 断开数据库连接
    if (this.adapter) {
      await this.adapter.disconnect();
      console.error('👋 数据库连接已关闭');
    }
  }
}
