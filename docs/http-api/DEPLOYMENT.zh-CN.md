# 部署指南

本指南涵盖 Universal Database MCP Server HTTP API 模式的各种部署选项。

## 目录

- [本地部署](#本地部署)
- [Docker 部署](#docker-部署)
- [Serverless 部署](#serverless-部署)
- [PaaS 平台部署](#paas-平台部署)
- [生产环境考虑](#生产环境考虑)

## 本地部署

### 前置要求

- Node.js >= 20.0.0
- npm 或 yarn
- 数据库实例（MySQL、PostgreSQL 等）

### 方式 1: 直接使用 Node.js

#### 1. 安装

```bash
# 全局安装
npm install -g universal-db-mcp

# 或本地安装
npm install universal-db-mcp
```

#### 2. 配置

创建 `.env` 文件：

```bash
MODE=http
HTTP_PORT=3000
HTTP_HOST=0.0.0.0
API_KEYS=your-secret-key-1,your-secret-key-2
CORS_ORIGINS=*
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1m
LOG_LEVEL=info
```

#### 3. 启动

```bash
# 如果全局安装
npm run start:http

# 如果本地安装
npx universal-db-mcp
```

#### 4. 验证

```bash
curl http://localhost:3000/api/health
```

### 方式 2: PM2（生产环境）

PM2 是 Node.js 应用的生产进程管理器。

#### 1. 安装 PM2

```bash
npm install -g pm2
```

#### 2. 创建 PM2 配置

创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'universal-db-mcp',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      MODE: 'http',
      HTTP_PORT: 3000,
      HTTP_HOST: '0.0.0.0',
      API_KEYS: 'your-secret-key-1,your-secret-key-2',
      CORS_ORIGINS: '*',
      RATE_LIMIT_MAX: 100,
      RATE_LIMIT_WINDOW: '1m',
      LOG_LEVEL: 'info'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G',
    autorestart: true,
    watch: false
  }]
};
```

#### 3. 使用 PM2 启动

```bash
# 先构建
npm run build

# 启动
pm2 start ecosystem.config.js

# 查看日志
pm2 logs universal-db-mcp

# 监控
pm2 monit

# 重启
pm2 restart universal-db-mcp

# 停止
pm2 stop universal-db-mcp

# 删除
pm2 delete universal-db-mcp
```

#### 4. 开机自启动

```bash
# 生成启动脚本
pm2 startup

# 保存当前进程列表
pm2 save
```

### 方式 3: systemd（Linux）

创建 `/etc/systemd/system/universal-db-mcp.service`：

```ini
[Unit]
Description=Universal Database MCP Server
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/universal-db-mcp
Environment="NODE_ENV=production"
Environment="MODE=http"
Environment="HTTP_PORT=3000"
Environment="API_KEYS=your-secret-key"
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=universal-db-mcp

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable universal-db-mcp
sudo systemctl start universal-db-mcp
sudo systemctl status universal-db-mcp
```

## Docker 部署

### 前置要求

- Docker >= 20.10
- Docker Compose >= 2.0（可选）

### 方式 1: Docker Run

#### 1. 构建镜像

```bash
cd /path/to/universal-db-mcp
docker build -t universal-db-mcp:latest -f docker/Dockerfile .
```

#### 2. 运行容器

```bash
docker run -d \
  --name universal-db-mcp \
  -p 3000:3000 \
  -e MODE=http \
  -e HTTP_PORT=3000 \
  -e API_KEYS=your-secret-key \
  -e CORS_ORIGINS=* \
  -e RATE_LIMIT_MAX=100 \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  universal-db-mcp:latest
```

#### 3. 查看日志

```bash
docker logs -f universal-db-mcp
```

#### 4. 停止/删除

```bash
docker stop universal-db-mcp
docker rm universal-db-mcp
```

### 方式 2: Docker Compose

#### 1. 创建 docker-compose.yml

```yaml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - MODE=http
      - HTTP_PORT=3000
      - HTTP_HOST=0.0.0.0
      - API_KEYS=${API_KEYS:-default-key-change-me}
      - CORS_ORIGINS=${CORS_ORIGINS:-*}
      - RATE_LIMIT_MAX=${RATE_LIMIT_MAX:-100}
      - LOG_LEVEL=${LOG_LEVEL:-info}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
```

#### 2. 创建 .env 文件

```bash
API_KEYS=your-secret-key-1,your-secret-key-2
CORS_ORIGINS=*
RATE_LIMIT_MAX=100
LOG_LEVEL=info
```

#### 3. 启动（根目录下执行）

```bash
docker-compose up -d
```

#### 4. 查看日志

```bash
docker-compose logs -f
```

#### 5. 停止

```bash
docker-compose down
```

### Docker 配合数据库

MySQL 示例：

```yaml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - MODE=http
      - HTTP_PORT=3000
      - API_KEYS=your-secret-key
    depends_on:
      - mysql
    networks:
      - app-network

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: testdb
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
    networks:
      - app-network

networks:
  app-network:
    driver: bridge

volumes:
  mysql-data:
```

从 API 连接到 MySQL：

```bash
curl -X POST http://localhost:3000/api/connect \
  -H "X-API-Key: your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "mysql",
    "host": "mysql",
    "port": 3306,
    "user": "root",
    "password": "rootpassword",
    "database": "testdb"
  }'
```

### 注意

当你本地通过docker启动了这个mcp服务，而你的数据库也是通过docker启动的。

当您的 API 服务运行在 Docker 容器中时，容器内的 localhost 指向的是容器自己，而不是宿主机（您的 Windows11）。所以容器无法通过 localhost 或 127.0.0.1 访问宿主机上的 MySQL 服务。

**使用 host.docker.internal（推荐）**✅

  适用场景： MySQL 容器独立运行，不在同一个 docker-compose 中

  在 API 请求中修改 host：

```json
{
    "type": "mysql",
    "host": "host.docker.internal",  // ← 改这里
    "port": 3306,
    "user": "root",
    "password": "your_password",
    "database": "your_database"
  }
```

  原理：
  - host.docker.internal 是 Docker Desktop 提供的特殊 DNS 名称
  - 它会自动解析为宿主机的 IP 地址
  - 在 Windows 和 Mac 上都可用

## Serverless 部署

### 阿里云函数计算

#### 1. 安装 Funcraft

```bash
npm install -g @alicloud/fun
```

#### 2. 创建 template.yml

```yaml
ROSTemplateFormatVersion: '2015-09-01'
Transform: 'Aliyun::Serverless-2018-04-03'
Resources:
  universal-db-mcp:
    Type: 'Aliyun::Serverless::Service'
    Properties:
      Description: 'Universal Database MCP Server'
    universal-db-api:
      Type: 'Aliyun::Serverless::Function'
      Properties:
        Handler: index.handler
        Runtime: nodejs20
        CodeUri: './'
        MemorySize: 512
        Timeout: 60
        EnvironmentVariables:
          MODE: http
          HTTP_PORT: 9000
          API_KEYS: your-secret-key
        Events:
          httpTrigger:
            Type: HTTP
            Properties:
              AuthType: ANONYMOUS
              Methods: ['GET', 'POST', 'PUT', 'DELETE']
```

#### 3. 部署

```bash
fun deploy
```

### 腾讯云 SCF

#### 1. 安装 Serverless Framework

```bash
npm install -g serverless
```

#### 2. 创建 serverless.yml

```yaml
component: scf
name: universal-db-mcp

inputs:
  name: universal-db-mcp
  src: ./
  handler: index.handler
  runtime: Nodejs20.15
  region: ap-guangzhou
  memorySize: 512
  timeout: 60
  environment:
    variables:
      MODE: http
      HTTP_PORT: 9000
      API_KEYS: your-secret-key
  events:
    - apigw:
        parameters:
          protocols:
            - http
            - https
          environment: release
          endpoints:
            - path: /
              method: ANY
```

#### 3. 部署

```bash
serverless deploy
```

### AWS Lambda

#### 1. 安装 AWS SAM CLI

```bash
pip install aws-sam-cli
```

#### 2. 创建 template.yaml

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  UniversalDbMcpFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./
      Handler: index.handler
      Runtime: nodejs20.x
      MemorySize: 512
      Timeout: 60
      Environment:
        Variables:
          MODE: http
          HTTP_PORT: 9000
          API_KEYS: your-secret-key
      Events:
        ApiEvent:
          Type: Api
          Properties:
            Path: /{proxy+}
            Method: ANY
```

#### 3. 构建和部署

```bash
sam build
sam deploy --guided
```

### Vercel

#### 1. 创建 vercel.json

```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/index.js"
    }
  ],
  "env": {
    "MODE": "http",
    "API_KEYS": "@api_keys"
  }
}
```

#### 2. 部署

```bash
npm install -g vercel
vercel
```

## PaaS 平台部署

### Railway

#### 1. 创建 railway.json

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm run start:http",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

#### 2. 部署

```bash
# 安装 Railway CLI
npm install -g @railway/cli

# 登录
railway login

# 初始化
railway init

# 部署
railway up
```

#### 3. 设置环境变量

```bash
railway variables set MODE=http
railway variables set HTTP_PORT=3000
railway variables set API_KEYS=your-secret-key
```

### Render

#### 1. 创建 render.yaml

```yaml
services:
  - type: web
    name: universal-db-mcp
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm run start:http
    envVars:
      - key: MODE
        value: http
      - key: HTTP_PORT
        value: 3000
      - key: API_KEYS
        sync: false
      - key: NODE_ENV
        value: production
    healthCheckPath: /api/health
```

#### 2. 部署

1. 将代码推送到 GitHub
2. 在 Render 控制台连接仓库
3. Render 将自动部署

### Fly.io

#### 1. 安装 Fly CLI

```bash
curl -L https://fly.io/install.sh | sh
```

#### 2. 创建 fly.toml

```toml
app = "universal-db-mcp-mes"
primary_region = "hkg"

[build]
  builder = "heroku/buildpacks:20"

[env]
  MODE = "http"
  HTTP_PORT = "8080"
  NODE_ENV = "production"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[services]]
  http_checks = []
  internal_port = 8080
  processes = ["app"]
  protocol = "tcp"

  [[services.ports]]
    force_https = true
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
```

#### 3. 部署

```bash
# 登录
fly auth login

# 启动应用
fly launch

# 设置密钥
fly secrets set API_KEYS=your-secret-key

# 部署
fly deploy
```

## 生产环境考虑

### 安全性

#### 1. HTTPS/TLS

使用反向代理（nginx、Caddy）配置 HTTPS：

**nginx 示例**:

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 2. API Keys

生成强 API Keys：

```bash
# 生成随机密钥
openssl rand -base64 32

# 或使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

#### 3. CORS

在生产环境限制 CORS 源：

```bash
CORS_ORIGINS=https://app.example.com,https://admin.example.com
```

#### 4. 速率限制

根据需求调整速率限制：

```bash
RATE_LIMIT_MAX=1000
RATE_LIMIT_WINDOW=1h
```

### 监控

#### 1. 健康检查

配置健康检查端点：

```bash
curl http://localhost:3000/api/health
```

#### 2. 日志

使用结构化日志：

```bash
LOG_LEVEL=info
LOG_PRETTY=false  # JSON 格式用于日志聚合
```

#### 3. 指标

监控关键指标：
- 请求速率
- 响应时间
- 错误率
- 活跃会话数
- 数据库连接池

### 性能

#### 1. 集群模式

使用 PM2 集群模式：

```javascript
{
  instances: 'max',  // 使用所有 CPU 核心
  exec_mode: 'cluster'
}
```

#### 2. 缓存

为 Schema 查询实现缓存：

```javascript
// 缓存 Schema 5 分钟
const schemaCache = new Map();
```

#### 3. 连接池

配置数据库连接池：

```javascript
// MySQL 示例
{
  connectionLimit: 10,
  queueLimit: 0
}
```

### 备份与恢复

#### 1. 数据库备份

定期数据库备份：

```bash
# MySQL
mysqldump -u root -p mydb > backup.sql

# PostgreSQL
pg_dump mydb > backup.sql
```

#### 2. 配置备份

备份环境变量和配置。

#### 3. 灾难恢复

记录恢复流程：
1. 从备份恢复数据库
2. 重新部署应用
3. 恢复环境变量
4. 验证健康检查

## 故障排除

### 常见问题

#### 端口已被占用

```bash
# 查找占用端口的进程
lsof -i :3000

# 终止进程
kill -9 <PID>
```

#### 权限被拒绝

```bash
# 使用 > 1024 的端口或使用 sudo 运行
HTTP_PORT=8080
```

#### 数据库连接失败

检查：
- 数据库是否运行
- 凭据是否正确
- 网络连接
- 防火墙规则

#### 内存使用过高

- 减少会话超时
- 实现连接池
- 监控内存泄漏

### 日志

根据部署方式查看日志：

```bash
# PM2
pm2 logs universal-db-mcp

# Docker
docker logs -f universal-db-mcp

# systemd
journalctl -u universal-db-mcp -f

# Railway
railway logs

# Render
# 在控制台查看

# Fly.io
fly logs
```

## 支持

如有部署问题：
- GitHub Issues: https://github.com/Anarkh-Lee/universal-db-mcp/issues
- 文档: https://github.com/Anarkh-Lee/universal-db-mcp#readme
