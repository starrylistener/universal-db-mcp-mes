# NPM 发布步骤

## ✅ 准备工作已完成

以下准备工作已经完成：
- ✅ package.json 配置完整
- ✅ LICENSE 文件已创建
- ✅ .npmignore 文件已创建
- ✅ 包名 `universal-db-mcp` 可用
- ✅ 本地打包测试成功（25.6 kB）

## 📝 发布流程

### 1. 登录 NPM

如果你还没有 NPM 账号，需要先注册：

```bash
# 注册新账号（会打开浏览器）
npm adduser
```

如果已有账号，直接登录：

```bash
# 登录
npm login
```

按提示输入：
- Username（用户名）
- Password（密码）
- Email（邮箱）
- OTP（如果启用了两步验证）

验证登录状态：
```bash
npm whoami
```

### 2. 发布到 NPM

```bash
# 发布
npm publish
```

如果是第一次发布，可能需要验证邮箱。

### 3. 验证发布成功

```bash
# 查看包信息
npm view universal-db-mcp

# 测试安装
npx universal-db-mcp@latest --help
```

## 🎉 发布成功后

发布成功后，用户可以通过以下方式使用：

```bash
# 全局安装
npm install -g universal-db-mcp

# 或直接使用 npx
npx universal-db-mcp-mes --type mysql --host localhost --port 3306 ...
```

## 📦 包信息

- **包名**: universal-db-mcp
- **版本**: 0.1.0
- **大小**: 25.6 kB (压缩后)
- **解压后**: 97.8 kB
- **文件数**: 34 个文件

## 🔄 后续版本发布

当需要发布新版本时：

```bash
# 修复 bug（0.1.0 -> 0.1.1）
npm version patch

# 新功能（0.1.0 -> 0.2.0）
npm version minor

# 重大更新（0.1.0 -> 1.0.0）
npm version major

# 发布新版本
npm publish
```

## ⚠️ 注意事项

1. **发布前检查**
   - 确保代码已提交到 Git
   - 确保所有测试通过
   - 确保 README 文档完整

2. **版本号规范**
   - 遵循语义化版本（Semantic Versioning）
   - 主版本号.次版本号.修订号

3. **撤销发布**
   - 发布后 72 小时内可以撤销：`npm unpublish universal-db-mcp@0.1.0`
   - 超过 72 小时只能废弃：`npm deprecate universal-db-mcp@0.1.0 "版本已废弃"`

## 📊 发布后的推广

1. **更新 README**
   - 添加 NPM 徽章
   - 更新安装说明

2. **社区推广**
   - 在 GitHub 创建 Release
   - 在相关社区分享（如 V2EX、掘金等）
   - 在 Twitter/X 上宣布

3. **文档完善**
   - 添加更多使用示例
   - 录制演示视频
   - 编写博客文章

## 🔗 相关链接

- NPM 包页面: https://www.npmjs.com/package/universal-db-mcp
- GitHub 仓库: https://github.com/universal-db-mcp/universal-db-mcp
- 问题反馈: https://github.com/universal-db-mcp/universal-db-mcp/issues
