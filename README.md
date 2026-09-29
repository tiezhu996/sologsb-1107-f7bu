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
- `version(3)`：抄纸工序改为**修订链**模型，`runNo` 不再唯一（同一槽可有多版），新增 `chainId`、`versionNo`、`status`（`active`/`superseded`/`void`）、`revisionReason`、`revisedBy`、`revisedAt`、`voidReason` 以及纸帘快照字段；样本新增 `runVersionId` 固定引用登记当时那版工序。升级时已有工序与样本自动补成**基线版**，缺字段的老记录按基线值照常显示。
- 数据库首次创建时通过 `populate` 写入 5 张纸帘、5 个纤维料批、8 槽抄纸工序（基线版）和 6 个成纸样本。
- 页面顶部的“导出 JSON”可下载四张表的完整备份。

## 工序修订链规则

- 师傅复测一槽抄纸时，执行“复测更正”：基于当前有效版生成新版本，上一版自动标记为“历史版”并保留，更正必须写明原因与操作人。
- 样本固定引用登记当时那版工序（`runVersionId`），后续更正不会改变样本的偏差与参数；样本页对引用历史版、已作废、记录缺失或并列有效版的卡片标明“失效”。
- 作废不删除数据，仍可在“修订历程”中查阅；工作台、纸帘/料批引用统计只统计每槽**最新有效版**。
- 每版工序固化登记当时的纸帘标准间距等快照，纸帘修补只影响新登记工序，不回改历史。
- 同一槽出现两个并列有效版（异常数据）时，工序页红行标出、工作台给出告警并停止计入统计，可在修订历程中作废多余版本恢复。

## 核心功能与路由表

| 路由 | 页面标题 | 核心功能 |
| --- | --- | --- |
| `/` | 工作台 | 查看纸帘状态分布、本周工序数、待复检样本与标准工序路径 |
| `/moulds` | 纸帘台帐 | 筛选纸帘，登记新纸帘，实时推算网目密度并登记修补 |
| `/fibers` | 纤维料批台账 | 按原料和打浆度筛选、比较，展开查看关联抄纸工序 |
| `/runs` | 抄纸工序记录台 | 按槽展示修订链；复测更正保留上一版并写明原因，可作废、查修订历程，即时判断 ±0.2 mm 帘纹偏差 |
| `/samples` | 成纸样本与透光检验卡 | 样本固定引用当时工序版本；按匀度与帘纹条数分档，失效样本单独标明 |

未匹配的地址会回到工作台。
