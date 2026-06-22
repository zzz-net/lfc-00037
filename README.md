# 设备报修管理系统

图书馆设备报修管理平台，支持工单全生命周期管理、状态流转控制、数据导出和跨重启数据持久化。

## 快速启动

```bash
npm install
npm run dev
```

启动后在终端输出中找到 Vite 的 `Local:` 行，默认地址：

- **前端页面**：http://localhost:5173 （Vite 开发服务器，若 5173 被占用会自动递增到 5174 等）
- **后端 API**：http://localhost:3001/api （Express 服务，仅供接口调用）

> 提示：`npm run dev` 会同时启动前端（Vite）和后端（Express）。前端的 `/api` 请求会自动代理到后端，**直接访问前端地址即可使用完整功能**，不要访问 3001 端口的 API 地址当作用户界面。具体前端端口以启动时终端输出的 `Local:` 行为准。

默认账号：

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | admin123 |
| 技术员 | tech1 | tech123 |
| 读者/馆员 | reader1 | reader123 |

## 工单状态治理规则

### 状态机与合法跳转

```
pending → processing
processing → waiting_parts | paused | completed
waiting_parts → processing | paused
paused → processing
completed → reopened
reopened → processing | waiting_parts | paused | completed
```

### 关键约束

1. **等待配件不能直接完成**：处于「等待配件」状态的工单，任何角色都不能直接标记为完成，必须先恢复为「处理中」或「已暂停」
2. **已完成工单锁定**：已完成的工单不能派工、添加备注或变更状态（前端隐藏操作按钮，后端返回 400 错误）
3. **管理员重新打开**：只有管理员可以重新打开已完成的工单，且必须填写重新打开原因
4. **重新打开后恢复操作**：工单重新打开后，才允许继续派工、备注和状态变更
5. **读者/馆员不可关闭**：读者/馆员角色无权关闭工单

### 派工规则

- 只有「待派工」和「重新打开」状态的工单可以派工
- 已完成工单派工会被拦截，提示先由管理员重新打开

## 导出功能

### 导出字段

CSV 和 JSON 导出使用统一字段，确保一致性：

| 字段 | 说明 |
|------|------|
| 工单ID | 工单唯一标识 |
| 设备名称 | 关联资产名称 |
| 设备编号 | 资产编号 |
| 设备类型 | 资产分类 |
| 位置 | 故障位置 |
| 问题描述 | 故障描述 |
| 优先级 | 优先级名称 |
| 状态 | 当前状态（中文） |
| 报修人 | 提交人姓名 |
| 处理人 | 指派处理人姓名 |
| 创建时间 | 工单创建时间 |
| 更新时间 | 最后更新时间 |
| 关闭时间 | 完成时间 |
| 重新打开原因 | 管理员填写的重新打开原因 |
| 状态变更记录 | 完整状态变更时间线 |

### 导出特性

- CSV 包含 UTF-8 BOM 头，Excel 可直接打开无乱码
- JSON 使用中文字段名，与 CSV 列头完全一致
- 导出文件名使用 `filename*=UTF-8''` 编码，确保中文文件名兼容

## 跨重启数据保障

### 持久化机制

- **筛选条件**：前端使用 localStorage 持久化，页面刷新不丢失
- **优先级配置**：存储在 db.json，服务重启后保留
- **工单与历史**：全部存储在 db.json，包含工单、时间线事件

### 启动时数据校验

服务启动时自动校验 db.json 数据完整性，自动修复以下异常：

- 非法状态值 → 重置为 pending
- 已完成但缺少关闭时间 → 用更新时间填充
- 非完成状态但存在关闭时间 → 清除关闭时间
- 重新打开但缺少原因 → 填充默认文本
- 处理人引用不存在 → 清除处理人
- 资产/优先级引用缺失 → 记录警告

校验日志输出到控制台，格式：`[DB Validation] 数据校验发现问题：`

## 批量操作幂等性保障

### 核心机制

批量操作采用**双维度幂等检查** + **持久化存储** + **失败原因自动分类**，确保同一 `batchOperationId` 无论提交多少次、服务重启多少次，始终返回首次执行结果，不会重复写入时间线和操作日志。

#### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    批量操作幂等性保障                          │
├─────────────────────────────────────────────────────────────┤
│  双维度检查                                                 │
│    ├─ 内存缓存（Map）：快速命中，无需读盘                     │
│    └─ db.json 持久化：服务重启后自动重建缓存                 │
│                                                             │
│  失败原因分类（failureType）                                 │
│    ├─ permission_denied  权限不足                           │
│    ├─ status_invalid     状态非法（已完成/等待配件）          │
│    ├─ version_conflict   并发版本冲突                        │
│    ├─ validation_error   参数校验失败                        │
│    └─ not_found          工单不存在                           │
│                                                             │
│  时间线去重                                                 │
│    └─ 每条时间线包含 batchId，写入前检查是否已存在           │
│                                                             │
│  重放标记（isReplayed）                                     │
│    ├─ false：首次执行                                       │
│    └─ true：幂等重放，结果来自缓存/持久化                     │
└─────────────────────────────────────────────────────────────┘
```

#### 关键特性

| 特性 | 说明 |
|------|------|
| **跨重启一致** | 结果持久化到 `db.json`，服务重启后从磁盘重建内存缓存，幂等性不失效 |
| **选中态隔离** | 仅以 `batchOperationId` 作为幂等键，与传入的 `ticketIds` 无关。页面刷新清掉选中态不影响结果追溯 |
| **时间线去重** | 同一批量操作在工单时间线中仅出现一次，重复提交不会追加重复记录 |
| **结果对齐** | 列表页、详情页、导出文件、管理员提示统一展示成功/失败明细及失败原因 |

### API 接口

```bash
# 批量操作接口（支持幂等）
POST /api/tickets/batch/priority        # 批量改优先级
POST /api/tickets/batch/assign          # 批量派工
POST /api/tickets/batch/exception/set   # 批量设催办例外
POST /api/tickets/batch/exception/revoke # 批量撤催办例外

# 查询接口（管理员可见）
GET  /api/tickets/batch/operations               # 批量操作列表
GET  /api/tickets/batch/operations/:batchOperationId  # 单条详情

# 导出接口
GET  /api/export/batch-operations?format=csv   # CSV 导出
GET  /api/export/batch-operations?format=json  # JSON 导出
```

### 请求示例

```bash
# 批量修改优先级（带幂等键）
curl -X POST http://localhost:3001/api/tickets/batch/priority \
  -H "Content-Type: application/json" \
  -H "x-user-id: user_admin" \
  -d '{
    "ticketIds": ["ticket_001", "ticket_002", "ticket_003"],
    "priorityId": "pri_high",
    "reason": "紧急处理",
    "batchOperationId": "batch_priority_20260622_001",
    "expectedVersions": {
      "ticket_001": 1,
      "ticket_002": 3,
      "ticket_003": 2
    }
  }'
```

### 回归测试（一键运行）

```bash
# 全自动端到端测试（含 27 个用例）
npm run test:batch:v2:run
```

测试流程：
1. 自动备份 `db.json`
2. 清理历史测试数据
3. 启动独立测试服务器（端口 3005，不冲突）
4. 运行 27 个真实 API 测试用例
5. 停止测试服务器
6. 恢复原始 `db.json`

#### 测试覆盖场景

| 分类 | 用例数 | 说明 |
|------|--------|------|
| **幂等性核心** | 2 | 重复提交返回相同结果、isReplayed 标记正确 |
| **失败原因分类** | 6 | 权限不足、状态非法、版本冲突、参数错误、工单不存在 |
| **持久化验证** | 4 | API 列表/详情可查、db.json 落地、字段完整 |
| **跨重启一致性** | 2 | 记录已落库、重启后可重建缓存 |
| **时间线去重** | 1 | 同一批量操作在时间线仅出现一次 |
| **权限拦截** | 2 | 技术员改优先级被拦、读者派工被拦 |
| **并发冲突** | 1 | 旧版本号提交被标记为 version_conflict |
| **状态拦截** | 2 | waiting_parts、completed 状态被拦截 |
| **导出对齐** | 2 | CSV/JSON 导出包含失败类型 |
| **选中态隔离** | 1 | 同 batchId 不同 ticketIds 仍返回原结果 |
| **准备工作** | 4 | 登录、创建测试工单、状态流转 |

### 手动复现步骤

#### 场景 1：跨重启幂等重放

```bash
# 步骤 1：首次提交批量操作（服务运行中）
curl -X POST http://localhost:3001/api/tickets/batch/priority \
  -H "x-user-id: user_admin" \
  -H "Content-Type: application/json" \
  -d '{
    "ticketIds": ["ticket_001"],
    "priorityId": "pri_high",
    "reason": "测试幂等",
    "batchOperationId": "test_replay_001"
  }'
# ✅ 返回 isReplayed=false，记录成功/失败明细

# 步骤 2：重启服务（模拟崩溃重启）
# 停止服务器 → 重新启动 npm run server:dev
# 控制台输出：[Batch Idempotency] 从 db.json 重建缓存，共 N 条批量操作记录

# 步骤 3：用同一个 batchOperationId 再次提交
curl -X POST http://localhost:3001/api/tickets/batch/priority \
  -H "x-user-id: user_admin" \
  -H "Content-Type: application/json" \
  -d '{
    "ticketIds": ["ticket_001"],
    "priorityId": "pri_high",
    "reason": "测试幂等",
    "batchOperationId": "test_replay_001"
  }'
# ✅ 返回 isReplayed=true，结果与首次完全一致
# ✅ 工单时间线不会新增重复记录
# ✅ 不会触发版本冲突（即使工单已被修改）
```

#### 场景 2：部分成功 + 失败原因分类

```bash
# 准备：创建 3 张工单，分别为 pending、completed、不存在的 ID
curl -X POST http://localhost:3001/api/tickets/batch/assign \
  -H "x-user-id: user_admin" \
  -H "Content-Type: application/json" \
  -d '{
    "ticketIds": ["ticket_pending", "ticket_completed", "ticket_not_exist"],
    "assigneeId": "user_tech1",
    "reason": "批量派工测试",
    "batchOperationId": "test_partial_001"
  }'
```

**预期返回：**
```json
{
  "batchOperationId": "test_partial_001",
  "total": 3,
  "succeeded": 1,
  "failed": 2,
  "isReplayed": false,
  "results": [
    {
      "ticketId": "ticket_pending",
      "success": true,
      "ticket": { ... }
    },
    {
      "ticketId": "ticket_completed",
      "success": false,
      "error": "已完成的工单不能派工，请先重新打开",
      "failureType": "status_invalid"
    },
    {
      "ticketId": "ticket_not_exist",
      "success": false,
      "error": "工单不存在",
      "failureType": "not_found"
    }
  ]
}
```

#### 场景 3：并发修改被拦截

```bash
# 步骤 1：获取工单当前版本号
GET /api/tickets/ticket_001
# → version: 2

# 步骤 2：A 用户用 version=2 提交批量修改（携带 expectedVersions）
# 步骤 3：在 A 提交前，B 用户先修改了该工单（version 变为 3）
# 步骤 4：A 的批量提交到达

# ✅ A 的提交中，该工单被标记为 failureType=version_conflict
# ✅ 错误信息："该工单在此期间已被他人修改，请刷新后重试"
# ✅ 其他无冲突工单正常执行
```

#### 场景 4：权限不足被拦截

```bash
# 用技术员身份尝试批量修改优先级（仅管理员可操作）
curl -X POST http://localhost:3001/api/tickets/batch/priority \
  -H "x-user-id: user_tech1" \
  -H "Content-Type: application/json" \
  -d '{
    "ticketIds": ["ticket_001"],
    "priorityId": "pri_high",
    "reason": "越权测试",
    "batchOperationId": "test_perm_001"
  }'
```

**预期：**
- HTTP 403 Forbidden
- 所有工单标记为 `failureType=permission_denied`
- 错误信息："只有管理员可以修改优先级"

#### 场景 5：选中态隔离验证

```bash
# 步骤 1：提交批量操作（选中 ticket_001、ticket_002）
curl -X POST http://localhost:3001/api/tickets/batch/priority \
  -H "x-user-id: user_admin" \
  -d '{
    "ticketIds": ["ticket_001", "ticket_002"],
    "priorityId": "pri_high",
    "reason": "测试",
    "batchOperationId": "test_selection_001"
  }'
# → total=2

# 步骤 2：页面刷新，选中态丢失，用户只选了 ticket_001
# 但仍使用同一个 batchOperationId 提交
curl -X POST http://localhost:3001/api/tickets/batch/priority \
  -H "x-user-id: user_admin" \
  -d '{
    "ticketIds": ["ticket_001"],
    "priorityId": "pri_high",
    "reason": "测试",
    "batchOperationId": "test_selection_001"
  }'
# ✅ 仍返回 total=2 的原始结果（幂等）
# ✅ 不会因为 ticketIds 变少而只处理 1 张
# ✅ 已落库的完整结果不受前端选中态影响
```

### 数据存储结构

`db.json` 中新增 `batchOperations` 表：

```json
{
  "batchOperations": [
    {
      "id": "bo_xxx",
      "batchOperationId": "test_replay_001",
      "operationType": "priority",
      "operatorId": "user_admin",
      "operatorName": "系统管理员",
      "createdAt": "2026-06-22T08:00:00.000Z",
      "requestBody": {
        "ticketIds": ["ticket_001"],
        "priorityId": "pri_high",
        "reason": "测试幂等"
      },
      "total": 1,
      "succeeded": 1,
      "failed": 0,
      "results": [
        {
          "ticketId": "ticket_001",
          "success": true,
          "failureType": null,
          "error": null
        }
      ]
    }
  ]
}
```

## 验证与回归测试

### 运行校验脚本

```bash
npm run validate
```

校验脚本覆盖 5 大类、40+ 项检查，**每个关键分支都通过真实 API 请求验证**，输出包含请求方法、路径、状态码、错误信息等证据，不会因数据缺失而偷偷跳过。

#### 检查分类

1. **状态跳转规则校验**：验证所有合法/非法状态跳转（白名单 + 黑名单）
2. **数据库完整性校验**：检查 db.json 中数据引用完整性
3. **跨重启持久化校验**：确认筛选条件、配置、历史数据持久化机制
4. **导出一致性校验**：确认 CSV/JSON 字段对齐、BOM 头、中文字段
5. **API 运行时拦截校验**（需服务运行中）：
   - 已完成工单派工被拦截
   - 已完成→处理中跳转被拦截
   - 已完成工单添加备注被拦截
   - 等待配件→完成跳转被拦截（任何角色都不行）
   - 无原因重新打开被拦截
   - 读者关闭工单被拦截
   - 管理员带原因重新打开成功
   - 重新打开后可以派工
   - CSV 导出含 BOM 头和中文字段
   - JSON 导出中文字段可回读

### 手动验收步骤

1. **正常报修到关闭**：reader1 提交报修 → admin 派工 → tech1 处理 → 完成
2. **管理员重新打开**：admin 重新打开已完成工单 → 填写原因 → 派工 → 再次处理
3. **越权拦截**：
   - reader1 尝试关闭工单 → 被拦截
   - tech1 对已完成工单派工 → 被拦截
   - 任何人从等待配件直接完成 → 被拦截
4. **导出验证**：admin 导出 CSV/JSON → 用 Excel 打开 CSV 无乱码 → JSON 可被程序回读

## 项目结构

```
├── api/                  # 后端 API
│   ├── data/
│   │   ├── db.json       # 数据存储
│   │   └── store.ts      # 数据层（含启动校验）
│   ├── middleware/
│   │   └── auth.ts       # 认证中间件
│   └── routes/
│       ├── tickets.ts    # 工单路由（状态治理核心）
│       ├── export.ts     # 导出路由
│       ├── assets.ts     # 资产管理
│       ├── auth.ts       # 认证路由
│       └── priorities.ts # 优先级配置
├── shared/
│   └── types.ts          # 共享类型与常量（状态机定义）
├── src/                  # 前端 React
│   ├── pages/
│   │   ├── TicketDetail.tsx  # 工单详情（操作面板）
│   │   ├── TicketList.tsx    # 工单列表
│   │   ├── ExportCenter.tsx  # 导出中心
│   │   └── SubmitTicket.tsx  # 提交报修
│   └── store/
│       └── ticketStore.ts    # 工单状态管理（筛选持久化）
└── scripts/
    ├── validate.ts           # 状态机/导出/跨重启校验脚本
    └── test-batch-operations.ts  # 批量操作回归测试脚本
```
