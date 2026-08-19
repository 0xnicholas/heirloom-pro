# 调研：建模工作台 UX 模式（票 #17）

> 分支 `research/modeling-workbench-ux`；父图 [#16 工作台图](https://github.com/0xnicholas/heirloom-pro/issues/16)。
> 问题：面向**非技术领域专家**的建模/术语采集工具既有 UX 模式——向导流型、术语采集界面型、草稿/diff 预览型三类清单与推荐。
> 方法：官方文档（Palantir / OpenMetadata / dbdiagram / DrawSQL / Lucidchart / Protégé Wiki）+ 同行评审论文（WebProtégé 简化界面研究、33 人四方法可用性实验、srcDiff diff 可理解性实验）+ 社区实践（Event Storming 词汇表）。逐条标注 **实证**（官方文档/论文直接陈述）与 **推断**（本报告综合推断，无直接来源）。

## 结论先行

1. **没有单一赢家，最强实证是一组设计原则**：33 人受控实验 + 3 名领域专家 think-aloud（四方法对比：Quick Form 单页表单 / Wizard 问题向导 / Wikidata / WebProtégé）得出的跨方法结论是——**「不打断用户工作流」是第一原则**（加关联词不离开当前页、一页内完成子任务）；过滤搜索框与「全图常驻」（类层级/图谱总在屏幕上）是反复被点赞的特性。**[实证]**
2. **向导流推荐 = 三段混合**：批量倒词起步（表格粘贴，零结构压力）→ 判定向导（单实体深问，问题克制）→ 全图常驻收口（层级/图谱主屏）。各段分别对应实验中得分最高的三个形态（Quick Form 的效率、Wizard 的任务有效性、WebProtégé 的全图感）。**[实证支撑的推荐]**
3. **判定向导三戒（来自实验的被批点与专家警告）**：① 必须可回退（Wizard 因「不能回退上一步」被列 dislike）；② 问题要克制、选项封闭（植物学家警告「问题太细会诱导错误的关系与词进本体」）；③ 结束必须给「将加入内容的摘要预览」（Wizard 被点赞的「显示进度与最终公理摘要」）。**[实证]**
4. **草稿预览推荐 = 双层呈现**：主层是**结构化变更摘要卡**（人类语言 + 三档演化预检红绿灯，面向领域专家与客户确认），次层才是**代码预览**——且因为工作台「只生成新块、零删改既有源码」，代码预览天然是**纯增量清单**而非 unified diff（无 `-` 行、无 hunk 头），非技术用户的主要认知障碍（删除语义与上下文噪音）被架构性消除。**[推断，但两根支柱是实证：srcDiff 证明结构感知呈现优于行级 diff；读写模型（#16 根决策）保证纯增量]**
5. **投影场景的直接实证**：植物学家看到投影上 WebProtégé 类层级时的原话「that list of terms put me right at home」——**全图常驻不是装饰，是工作坊的心理锚点**；但同时「不觉得自己能立刻上手操作」——**操作者是顾问，不是领域专家**，这与工作台根决策（顾问驾驶、投影给房间看）吻合。**[实证]**

---

## 一、向导流型：单步深问 vs 表格批量 vs 混合

### 模式清单

| 模式 | 代表工具与证据 | 优点（实证） | 缺点（实证） |
|---|---|---|---|
| **单页表单**（Quick Form 型） | 可用性实验中的 Quick Form：简单 web 表单连本体 | 效率最高、难度最低、前后信心均最高；「清晰指示」「一页全含」「最少输入」是 top likes | **录不下富语义**——问项之外的信息无处放；植物学家明确指出会把关系都堆进定义框、需事后编辑 |
| **问题向导**（Wizard 型） | 同实验的 Wizard：问题序列引导加词/同义词/part-of 关系；Palantir 对象类型创建 = guided step-by-step helper（推荐路径，中途退出可手动补全 metadata/数据源映射/键） | 「引导且直觉」「单页内答完一问」「显示进度与最终摘要」；**任务有效性显著最强** | 「不能回退上一步」「长列表找词难」「定制有限」 |
| **专业编辑器**（WebProtégé 型） | WebProtégé 默认简化 UI（只暴露 OWL 2 子集）；tab/portlet 门户布局；类层级树 + 注释/变更历史 | 「清晰不滚动的布局、类层级全图」「过滤搜索框」「关联新词不出页面自动加」；7 人「没有不喜欢的」 | 「无说明时不直觉」「需要受控词汇知识」 |
| **自由知识库**（Wikidata 型） | 同实验 | 「富连接」「Wiki 界面熟悉」 | **最差**：19/34 说复杂不直觉；「加关联词要离开页面去别处建词、来回跳」；植物学家现场放弃 |
| **代码优先 + 即时图**（dbdiagram 型） | dbdiagram.io：代码左/图右、随打随渲、键盘优先、「为分析师与开发者设计」 | 结构即文本（可 diff/评审/版本化）、实时视觉反馈 | 受众是分析师/开发者——**非技术领域专家不可用**（推断，但工具自我定位如此） |
| **画布拖拽**（DrawSQL/Lucidchart 型） | DrawSQL：「拖表上画布」；Lucidchart：shape libraries + 模板 + 拖拽 | 「Reason about changes in context — not in migration files」；视觉直觉 | 表格位置编排负担（dbdiagram 博客：「双击建表改值的体验」之弊的镜像） |
| **批量文本粘贴**（Protégé Create Class Hierarchy 型） | Protégé 桌面向导：粘贴多行文本 + **tab 缩进 = 层级**，一次批量建类 | 现场倒词的最快通道——领域专家口述、顾问粘贴（推断，机制为实证） | 只建名字与层级，无属性/约束（实证：向导本身只处理类名） |

### 推荐（喂 #19）

**混合三段，且段的顺序就是工作坊的节奏**：

1. **批量倒词**（Protégé 粘贴型 + Event Storming chaotic exploration）：开场零结构压力，卡片墙式堆词。颜色语义借 Event Storming 约定（名词/动词/热点分色）。
2. **判定向导**（Wizard 型，带三戒）：每个候选词过判定问题序列（有身份？→object/struct；被引用？→链接+基数；有载荷？→中间对象；是动词？→动作）。选项封闭、可回退、**结束给 DSL 块摘要预览**。
3. **全图常驻**（WebProtégé 型）：判定过程中类层级/图谱始终在主屏可见，随判定实时生长——投影场景的心理锚点（植物学家实证）。

**被否**：纯单页表单（录不下链接/基数/动作的富结构——Heirloom 的判定向导恰恰要问这些）；纯画布拖拽（编排负担 + 无法承载属性/约束细节）；Wikidata 式跳页流（实验最差，直接违反第一原则）。

---

## 二、术语采集界面型：字段集与输入节奏

### 模式清单（字段集，OpenMetadata 为最完整公开模板）

| 字段 | OpenMetadata（实证） | 工作台取舍（推断） |
|---|---|---|
| 名称（必填） | `name*`——术语主名 | **保留**，即 `apiName` 的来源（工作台可自动从 displayName 生成 camelCase 建议） |
| 显示名 | `displayName` | **保留**——中文人类名（ADR-0001 双名制） |
| 定义（必填） | definition，「mandatory requirement」 | **保留必填**——工作坊现场逼出「一句话定义」是术语表工作法的核心 |
| 同义词 | `synonyms` 数组 | **保留**——「客户叫它什么/文档里叫什么」的分歧记录 |
| 相关术语 | `relatedTerms` 数组（fqn 引用） | **保留**——链接候选的温床 |
| 外部引用 | `references` 数组（外链到既有词汇表） | **保留可选**——客户既有 Excel/文档术语的溯源 |
| 标签 | `tags` | 换成**候选分类**（object/struct/link/action/待定）——工作台的分类即标签（推断） |
| 治理字段 | `owners` / `reviewers` / status / approval workflow | **砍掉**——工作台是采集工具不是治理平台（OpenMetadata 的评审流为组织常设角色设计，工作坊是一次性事件） |

### 输入节奏

- **倒词期零字段**：只要「名字 + 一句话」（Quick Form 的「最少输入」实证得分）；定义可以后补。**[推断，机制实证]**
- **判定期补结构**：字段随判定逐步出现（基数、约束、载荷），不一次全铺。**[推断]**（实证旁证：Wikidata「太多属性可选」是 top dislike——字段轰炸伤非技术用户）
- **过滤搜索贯穿**：输入时实时匹配既有术语/类型，防重复造词。**[实证，跨方法 liked]**

---

## 三、草稿/diff 预览型：非技术用户能否读懂 diff

### 证据

1. **srcDiff（~70 被试对照实验）**：结构感知（语法级）的 differencing 比行级 diff 产生**更准确、更可理解**的变更呈现。→ diff 的可理解性是呈现方式的函数，不是常数。**[实证]**（受众是懂代码的学生，对非技术用户的推论向下成立——推断）
2. **side-by-side vs inline 实践共识**：结构变更与审批场景 side-by-side 更稳；小改动两者皆可。**[弱实证，实践指南]**
3. **「unified diff 对非技术用户」无直接研究**（检索未见）。已知障碍（推断）：`+/-` 行前缀、`@@ hunk` 头、上下文行、删除语义——这些是版本控制文化产物。
4. **DrawSQL 定位语**：「Reason about changes in context — not in migration files」——变更应在其结构上下文中被讨论，而非在迁移文件里。**[实证（官方定位）]**

### 推荐（喂 #21）

**双层呈现，diff 降为顾问视图**：

- **主层：结构化变更摘要卡**（面向领域专家 + 客户确认）——人类语言的「将新增……」清单 + **三档演化预检红绿灯**（新增=绿灯自动档；涉及既有=黄灯数据校验档/红灯拒绝档，附后果与出路建议——ADR-0007 矩阵的 UI 化）。变更卡的粒度 = 判定向导的产出粒度（一类型一卡、一动作一卡）。
- **次层：代码预览**——因「只生成新块、零删改」，预览是**纯新增清单**（新文件/新块全绿式呈现），没有删除行与 hunk 噪音；side-by-side 仅在顾问要求对照既有块时出现。**这不是妥协而是架构红利**：#16 根决策（写新块）把 unified diff 最难的部分（删改语义）从非技术用户视野里移除了。**[推断]**
- **diff 工具保留给顾问**：贴回仓库后 `git diff` 是顾问/开发者的既有验收手段，工作台不必复刻。**[推断]**

---

## 逐源证据清单

| # | 来源 | 性质 | 关键内容 |
|---|---|---|---|
| S1 | [Palantir: Create an object type](https://palantir.com/docs/foundry/object-link-types/create-object-type/) + [Create a link type](https://palantir.com/docs/foundry/object-link-types/create-link-type/) + [Ontology Manager overview](https://palantir.com/docs/foundry/ontology-manager/overview/) | 官方文档 **[实证]** | 对象/链接类型创建以 **guided step-by-step helper** 为推荐路径；中途退出可手动补全各段（元数据/数据源映射/键）；OM 界面 = 顶栏+侧栏持久导航 + 对象类型/属性编辑器/链接/动作/函数视图 |
| S2 | [OpenMetadata: What is a Glossary Term](https://docs.open-metadata.org/v1.11.x/how-to-guides/data-governance/glossary/glossary-term) + [How to Create Glossary Terms](https://docs.open-metadata.org/v1.12.x/how-to-guides/data-governance/glossary/create-terms) + [Glossary Approval Workflow](https://docs.open-metadata.org/v1.12.x/how-to-guides/data-governance/glossary/approval) | 官方文档 **[实证]** | 术语字段集（name*/displayName/definition 必填/synonyms/relatedTerms/references/tags/owners/reviewers/status）；Thesauri 三关系（层级/等价/关联）；评审发布流 |
| S3 | [可用性实验：四种本体术语添加方法](https://pmc.ncbi.nlm.nih.gov/articles/PMC8218699/)（33 人受控 + 3 植物学家 think-aloud） | 同行评审论文 **[实证，本报告最强证据]** | Quick Form 效率/信心最高但录不下富语义；Wizard 任务有效性显著最强但不可回退、专家警告诱导错误关系；Wikidata 最差（跳页断流）；WebProtégé 类层级全图+不离页加词获赞；「不打断工作流」第一原则；投影上类层级「put me right at home」 |
| S4 | [WebProtégé: Collaborative Ontology Editor (PMC3691821)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3691821/) + [WebProtegeUsersGuide](https://protegewiki.stanford.edu/wiki/WebProtegeUsersGuide) | 论文+官方 wiki **[实证]** | 默认简化 UI 只暴露 OWL 2 子集；portal/tab/portlet 可配置布局；设计目标即新手可用+协作 |
| S5 | [Protégé: Create multiple subclasses 向导](https://protegewiki.stanford.edu/wiki/PrF_UG_classes_creating_multiple_classes) | 官方 wiki **[实证]** | 粘贴多行文本 + tab 缩进 = 层级，批量建类——「倒词」通道的先例 |
| S6 | [dbdiagram.io](https://docs.dbdiagram.io/) + [设计理念博文](https://blog.dbdiagram.io/dbdiagram-io-a-database-diagram-designer-built-for-developers-and-analysts/) | 官方 **[实证]** | 代码左/图右、随打随渲、键盘优先、DBML；自我定位「为数据分析师与开发者」 |
| S7 | [DrawSQL vs dbdiagram 对比页](https://drawsql.app/compare/drawsql-vs-dbdiagram) + [DrawSQL 首页](https://drawsql.app/) | 官方 **[实证]** | 「写 DBML vs 拖画布」两派自陈；「Reason about changes in context — not in migration files」 |
| S8 | [Lucidchart ERD](https://lucid.co/diagram/erd) + [建 ERD 指南](https://help.lucid.co/hc/en-us/articles/16471565238292-Create-an-Entity-Relationship-Diagram-in-Lucidchart) | 官方 **[实证]** | shape libraries + 模板 + 拖拽画布模式 |
| S9 | [srcDiff（~70 被试实验）](https://www.cs.kent.edu/~jmaletic/papers/srcDiff.pdf) | 同行评审论文 **[实证]** | 结构感知 diff 呈现比行级更准确更可懂——diff 可理解性是呈现方式的函数 |
| S10 | [ddd-crew EventStorming 词汇表](https://github.com/ddd-crew/eventstorming-glossary-cheat-sheet) + [Event Storming Journal 指南](https://www.eventstormingjournal.com/big%20picture/step-by-step-guide-to-run-a-big-picture-event-storming/) + [Bourgau 输出采集](https://philippe.bourgau.net/5-views-to-capture-the-outputs-of-an-event-storming-workshop/) | 社区实践 **[实证于实践描述]** | 颜色语义（橙事件/蓝命令/紫策略/粉热点/黄实体）；chaotic exploration 自由倒词起步；输出采集用聚焦视图而非全量拍照；「模糊性是特性」 |

## 对下游票的喂给

**→ [#19 术语工作坊工作流语义](https://github.com/0xnicholas/heirloom-pro/issues/19)**：
- 术语卡片字段集：本报告二节表格（含「治理字段砍掉」清单与理由）。
- 判定向导三戒：可回退 / 问题克制选项封闭 / 摘要先行（S3 实证）。
- 工作坊节奏：倒词（零结构）→ 判定（补结构）→ 全图收口；颜色语义建议借 S10。
- 防重复：过滤搜索贯穿（S3 跨方法 liked）。

**→ [#21 工作台界面外形原型](https://github.com/0xnicholas/heirloom-pro/issues/21)**：
- 三屏布局依据：左侧列表 + 主区全图常驻 + 上下文编辑（S1 OM 布局、S3 全图实证）。
- 变更呈现：主层结构化变更卡（人类语言+三档红绿灯）、次层纯增量代码预览、diff 留给顾问 git（三节推荐）。
- 投影场景：大字号层级/图谱常驻主屏（S3 植物学家投影实证）；操作者=顾问。
- 被否形态清单（避免原型踩坑）：跳页关联流、字段一次全铺、画布编排负担、纯代码优先。

## 待进一步验证（诚实清单）

- 「非技术用户读纯增量代码预览」的舒适度——未做用户测试；原型票（#21）若做高保真可拿真实客户快速验证。
- Event Storming 颜色语义直接移植到「术语候选分类」是否有文化冲突（客户若熟悉 ES 会带预期）——工作坊实测。
- Palantir Ontology Manager 的向导步数与字段粒度：官方文档只给结构未给逐屏截图清单（图片未抓取成功）；不影响模式级结论。
