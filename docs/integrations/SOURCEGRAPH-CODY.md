# Sourcegraph Cody Integration Guide

This guide shows how to integrate Universal Database MCP Server with Sourcegraph Cody.

## Overview

[Sourcegraph Cody](https://sourcegraph.com/cody) is an AI coding assistant. It supports MCP, allowing you to query databases while coding.

## Prerequisites

- Cody extension installed in VS Code or JetBrains
- Node.js 20.0.0 or later
- Database instance

## Configuration

Add to Cody's MCP configuration:

```json
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": [
        "universal-db-mcp-mes",
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

## Usage

Ask Cody about your database:

```
@database What tables are in the database?
@database Show me the schema of the users table
```

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `execute_query` | Execute SQL queries |
| `get_schema` | Get database schema |
| `get_table_info` | Get table details |
| `clear_cache` | Clear schema cache |
| `get_enum_values` | Get all unique values for a specified column |
| `get_sample_data` | Get sample data from a table (with automatic data masking) |
| `connect_database` | Dynamically connect to a database (supports all 17 types) |
| `disconnect_database` | Disconnect from the current database |
| `get_connection_status` | Get current database connection status |

## Resources

- [Sourcegraph Cody Documentation](https://sourcegraph.com/docs/cody)
- [Universal DB MCP GitHub](https://github.com/Anarkh-Lee/universal-db-mcp)

## Support

For integration issues:
- GitHub Issues: https://github.com/Anarkh-Lee/universal-db-mcp/issues
