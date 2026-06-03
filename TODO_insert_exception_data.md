# insert_exception_data 功能 - 待办事项

> 状态：已暂停，待下次继续
> 日期：2026-06-02

---

## 已确定的内容

- **项目**：universal-db-mcp
- **目标**：新增定制化 MCP 工具，用于向错误信息表插入 AI 生成的数据
- **工具名**：`insert_exception_data`
- **配置方式**：项目根目录 `.mcp.json` 中的 `targetErrorTable` 字段
- **目标表（当前）**：`mt_error_message`
- **DDL**：
  ```sql
  create table mt_error_message
  (
      MESSAGE_ID            bigint                                  not null primary key,
      TENANT_ID             bigint        default 0                 not null comment '租户ID',
      MESSAGE_CODE          varchar(255)  default ''                not null comment '消息编码',
      MESSAGE               varchar(1000) default ''                null comment '消息内容',
      INITIAL_FLAG          varchar(1)    default 'Y'               null comment '初始化标识',
      CID                   bigint                                  not null,
      OBJECT_VERSION_NUMBER bigint        default 1                 not null,
      CREATED_BY            bigint        default -1                not null,
      CREATION_DATE         datetime      default CURRENT_TIMESTAMP not null,
      LAST_UPDATED_BY       bigint        default -1                not null,
      LAST_UPDATE_DATE      datetime      default CURRENT_TIMESTAMP not null,
      constraint MT_ERROR_MESSAGE_U1 unique (MESSAGE_CODE, TENANT_ID)
  );
  ```

### 字段分工

| 字段 | 来源 | 说明 |
|------|------|------|
| `MESSAGE_ID` | AI 传入 | bigint，主键，非空 |
| `TENANT_ID` | 待定 | bigint，默认 0 |
| `MESSAGE_CODE` | AI 传入 | varchar(255)，非空 |
| `MESSAGE` | AI 传入 | varchar(1000) |
| `INITIAL_FLAG` | 系统固定填充 | 值为 `'N'`（覆盖默认值 `'Y'`） |
| `CID` | AI 传入 | bigint，非空 |
| `OBJECT_VERSION_NUMBER` | 数据库默认 | 1 |
| `CREATED_BY` | 数据库默认 | -1 |
| `CREATION_DATE` | 数据库默认 | CURRENT_TIMESTAMP |
| `LAST_UPDATED_BY` | 数据库默认 | -1 |
| `LAST_UPDATE_DATE` | 数据库默认 | CURRENT_TIMESTAMP |

---

## 待澄清的问题（下次继续前必须确定）

1. **MESSAGE_ID 生成策略**
   - [ ] AI 直接传入？AI 如何知道下一个可用 ID？
   - [ ] 数据库自增？DDL 中未声明 AUTO_INCREMENT。
   - [ ] 业务层生成（如雪花算法、UUID）？

2. **CID 的来源**
   - [ ] AI 直接传入数值？
   - [ ] 从配置/上下文中获取？
   - [ ] 固定值？

3. **TENANT_ID 的来源**
   - [ ] AI 传入？
   - [ ] 从 `.mcp.json` 或环境变量固定配置？
   - [ ] 多租户动态获取？

4. **唯一约束冲突处理**
   - [ ] `(MESSAGE_CODE, TENANT_ID)` 已存在时：抛错 / 忽略 / 更新？

5. **MESSAGE_CODE 格式规范**
   - [ ] 是否有固定前缀或格式（如 `ERR_001`、`SYSTEM.TIMEOUT`）？
   - [ ] AI 自由发挥？

6. **是否需要配套 update 工具**
   - [ ] 如果 MESSAGE_CODE 已存在，是否需要更新而非插入？
   - [ ] 是否需要独立的 `update_exception_data` 工具？

7. **事务策略**
   - [ ] 批量插入多行时，一行失败：全部回滚 / 部分成功？

---

## 设计文档

- 路径：`docs/superpowers/specs/2026-06-02-insert-exception-data-design.md`
- 状态：初稿已完成，需根据上述澄清问题更新后定稿

---

## 后续步骤

1. 澄清上述 7 个问题
2. 更新设计文档
3. 用户确认设计
4. 调用 `writing-plans` 技能生成实现计划
5. 编码实现
