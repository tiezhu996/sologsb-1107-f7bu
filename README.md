# 手工造纸帘纹与工序档案

围绕手工造纸的纸帘、纤维料批、抄纸工序与成纸样本建立一体化档案。界面可登记纸帘丝径与帘纹间距、推算网目密度，跟踪料批打浆度，复测抄纸帘纹偏差，并按匀度与帘纹条数复核样本。所有业务数据保存在浏览器 IndexedDB 中，无需后端服务。

## Docker 一键启动

```bash
cp .env.example .env && docker compose up -d --build
```

默认映射端口为 `21807`。启动后访问 `http://localhost:21807`。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端框架 | React 18 + TypeScript 5 |
| 构建工具 | Vite 5 |
| 界面组件 | MUI 5 + Emotion |
| 路由 | React Router 6 |
| 状态管理 | Zustand 4 |
| 本地数据库 | Dexie 4 + IndexedDB |
| 部署 | Nginx + Docker Compose |

## 访问地址

`http://localhost:21807`

## 本地开发方式

```bash
cd frontend
npm install
npm run dev
```

本地开发服务器默认运行在 `http://localhost:5173`。

## 目录结构

```text
.
├── docker-compose.yml
├── .env.example
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/
│       ├── components/common/  公共可视化组件
│       ├── hooks/              筛选与单位换算
│       ├── pages/              五个业务页面
│       ├── router/             路由表
│       ├── stores/             Zustand 状态与持久化动作
│       ├── types/              四类业务模型
│       └── utils/              Stripe 计算、Dexie 与 JSON 导出
└── README.md
```

## 数据存储说明

数据存储使用 IndexedDB，Dexie 数据库名为 `gbpapermill-db`。

- `version(1)`：建立 `moulds`、`fiberBatches`、`sheetRuns`、`paperSamples` 四张表及编号、日期、状态等索引。
- `version(2)`：为四张表加入 `schemaRev` 索引，并通过 `upgrade` 将存量记录回填为版本 `2`。
- `version(3)`：工序修订链。`sheetRuns` 新增 `versionNo`、`prevId`、`reason`、`voided`、`voidReason`、`voidedAt`、`revisedAt`、`standardGap` 字段，`runNo` 不再唯一（同一槽可有多个版本）；`paperSamples` 以 `runVersionId` 固定引用工序版本记录。升级时存量工序补成基线版（`versionNo=1`、`reason='基线版'`），样本钉住当时工序记录，缺字段的老记录照常保留显示。
- 数据库首次创建时通过 `populate` 写入 5 张纸帘、5 个纤维料批、8 槽抄纸工序（含 1 条复测更正版、1 条作废版）和 7 个成纸样本（含 1 份引用作废版本的失效样本）。
- 页面顶部的“导出 JSON”可下载四张表的完整备份。

## 工序修订链规则

- 每槽工序（`runNo`）是一条修订链：登记时为基线版 v1；复测更正生成 v2、v3……，旧版保留并写明更正原因，不直接覆盖。
- 每个版本记录制版时的纸帘标准间距快照（`standardGap`），偏差按快照计算；纸帘修补只影响此后新建的工序版本，不回改历史。
- 样本固定引用登记时的工序版本（`runVersionId`），不随后续更正漂移；引用版本作废后，样本页标明「失效」，记录仍可查询。
- 作废版本留档可查；工作台只统计每槽的最新有效版。若同一槽出现两个并列有效版（链梢冲突），页面指出该槽并停止计入统计，作废多余版本后自动恢复。

## 核心功能与路由表

| 路由 | 页面标题 | 核心功能 |
| --- | --- | --- |
| `/` | 工作台 | 查看纸帘状态分布、本周工序数、待复检样本与标准工序路径 |
| `/moulds` | 纸帘台帐 | 筛选纸帘，登记新纸帘，实时推算网目密度并登记修补 |
| `/fibers` | 纤维料批台账 | 按原料和打浆度筛选、比较，展开查看关联抄纸工序 |
| `/runs` | 抄纸工序记录台 | 按日期和帘号筛选，登记工序并即时判断 ±0.2 mm 帘纹偏差 |
| `/samples` | 成纸样本与透光检验卡 | 按匀度与帘纹条数分档，查看透光帘纹预览和归档位置 |

未匹配的地址会回到工作台。
