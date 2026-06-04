# PostgreSQL 使用指南

## 配置示例

### Claude Desktop 配置

```json
{
  "mcpServers": {
    "postgres-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp-mes",
        "--type", "postgres",
        "--host", "localhost",
        "--port", "5432",
        "--user", "postgres",
        "--password", "your_password",
        "--database", "your_database"
      ]
    }
  }
}
```

### 连接远程数据库

```json
{
  "mcpServers": {
    "postgres-prod": {
      "command": "npx",
      "args": [
        "universal-db-mcp-mes",
        "--type", "postgres",
        "--host", "db.example.com",
        "--port", "5432",
        "--user", "readonly_user",
        "--password", "secure_password",
        "--database", "production"
      ]
    }
  }
}
```

## 连接参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--host` | 数据库主机地址 | localhost |
| `--port` | 数据库端口 | 5432 |
| `--user` | 用户名 | - |
| `--password` | 密码 | - |
| `--database` | 数据库名 | - |

## 使用示例

### 查看数据库结构

```
用户: 查看数据库中有哪些表

Claude 会自动:
1. 调用 get_schema 工具
2. 返回所有表的列表和基本信息
```

### 复杂查询

```
用户: 找出订单金额最高的 10 个客户

Claude 会自动:
1. 调用 get_schema 了解表结构
2. 生成复杂的 JOIN 查询
3. 执行并返回结果
```

## 安全建议

### 创建只读用户

```sql
-- 创建只读用户
CREATE USER mcp_readonly WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE mydb TO mcp_readonly;

-- 授予 public schema 权限
GRANT USAGE ON SCHEMA public TO mcp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mcp_readonly;

-- 如需访问其他 schema，需要额外授权
-- GRANT USAGE ON SCHEMA analytics TO mcp_readonly;
-- GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO mcp_readonly;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT ON TABLES TO mcp_readonly;
```

## 支持的版本

- PostgreSQL 10+
- PostgreSQL 11+
- PostgreSQL 12+
- PostgreSQL 13+
- PostgreSQL 14+
- PostgreSQL 15+

## 特性支持

- 多 Schema 支持（自动发现所有用户 Schema）
- 参数化查询（$1, $2, ...）
- 事务支持
- JSON/JSONB 类型
- 数组类型

## 注意事项

1. **多 Schema 支持** - 自动获取所有用户 Schema 下的表（排除 `pg_catalog`、`information_schema` 等系统 Schema）。`public` Schema 下的表直接使用表名（如 `users`），其他 Schema 的表使用 `schema.table_name` 格式（如 `analytics.events`）。查询时支持使用 `schema.table_name` 格式精确指定表。
2. **参数化查询** - 使用 $1, $2 占位符
3. **SSL** - 生产环境建议启用 SSL

## 连接稳定性

MCP 服务内置了完善的连接管理机制，无需额外配置：

- **连接池** - 使用 pg 连接池（最大 3 个连接），自动管理连接生命周期
- **TCP Keep-Alive** - 启用 TCP 保活机制（30 秒初始延迟），防止连接被服务端超时关闭
- **断线自动重试** - 检测到连接断开（如 `Connection terminated`、`ECONNRESET`）时自动重试

## 常见问题

### 连接被拒绝

检查 `pg_hba.conf` 配置，确保允许远程连接。

### 权限不足

确保用户有 CONNECT 和 SELECT 权限。
