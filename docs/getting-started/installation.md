# 安装指南

本文档介绍 Universal DB MCP 的各种安装方式。

## 系统要求

- **Node.js**: >= 20.0.0
- **操作系统**: Windows、macOS、Linux
- **内存**: >= 512MB（推荐 1GB+）

## 安装方式

### 方式一：NPM 全局安装（推荐）

```bash
npm install -g universal-db-mcp
```

安装完成后，可以直接使用命令：

```bash
universal-db-mcp --help
```

### 方式二：npx 直接运行（无需安装）

```bash
npx universal-db-mcp-mes --help
```

这种方式会自动下载最新版本并运行，适合临时使用或测试。

### 方式三：从源码安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/universal-db-mcp.git
cd universal-db-mcp

# 安装依赖
npm install

# 构建项目
npm run build

# 全局链接（可选，用于开发）
npm link
```

## 验证安装

```bash
# 查看版本
universal-db-mcp --version

# 查看帮助
universal-db-mcp --help
```

## 数据库驱动

大多数数据库驱动会自动安装。以下是一些特殊情况：

### 达梦数据库（DM）

达梦驱动 `dmdb` 作为可选依赖。如果自动安装失败：

```bash
npm install -g dmdb
```

### SQLite

SQLite 驱动 `better-sqlite3` 需要编译。在 Windows 上需要安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)。

### Oracle

Oracle 驱动 `oracledb` 需要 Oracle Instant Client。请参考 [Oracle 官方文档](https://oracle.github.io/node-oracledb/INSTALL.html)。

## 更新版本

```bash
# NPM 全局安装方式
npm update -g universal-db-mcp

# 或重新安装最新版
npm install -g universal-db-mcp@latest
```

## 卸载

```bash
npm uninstall -g universal-db-mcp
```

## 下一步

- [快速开始](./quick-start.md) - 5 分钟上手
- [配置说明](./configuration.md) - 详细配置选项
- [使用示例](./examples.md) - 各数据库使用示例
