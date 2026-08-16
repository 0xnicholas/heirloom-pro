# 调研：开源同类系统 —— 对 Heirloom 的借鉴与避坑

- **票**：[#3 调研：开源同类系统](https://github.com/0xnicholas/heirloom-pro/issues/3)（父图 [#1](https://github.com/0xnicholas/heirloom-pro/issues/1)）
- **分支**：`research/oss-landscape`
- **方法**：全部结论取自官方文档 / 官方 API 参考等一手来源，逐条附链接。
- **用途**：为「本体语言核心语义 #5」及后续「动作语义 #8」「安全模型 #9」「存储引擎映射 #7」提供输入。

## TL;DR

调研了 8 个开源系统（TerminusDB、TypeDB 3.x、OpenMetadata、DataHub、Cube、Hasura、Apache Atlas、Fluree），分三类：**图数据库**（TerminusDB/TypeDB/Fluree）、**元数据平台**（OpenMetadata/DataHub/Atlas）、**语义层/API 引擎**（Cube/Hasura）。三个关键结论：

1. **没有任何开源系统同时具备**「类型化领域模型 + 类型化操作动作（含校验与写回）+ 实体级安全」。动作这一支柱在开源界基本空白——Hasura Actions（webhook 支撑的自定义 mutation）是唯一接近的形态。这正是 Heirloom 对标 Palantir Ontology 的定位空档。
2. **对象/链接/结构的建模语义高度收敛**：struct（无身份嵌入值）vs object（有身份可链接）的区别在 TerminusDB（subdocument vs foreign link）、Atlas（struct vs entity）、TypeDB（attribute vs entity）三处独立出现；链接的基数声明（TypeDB `@card`、TerminusDB `@cardinality`、Atlas endDef cardinality）也是共识。Heirloom 照此共识设计即可，不需要发明。
3. **权限编译进查询**是被验证过的 TS+Postgres 路线：Hasura 把「布尔表达式 + 列选择」的权限规则编译进单条 SQL（[权限文档](https://hasura.io/docs/latest/auth/authorization/permissions/)）；Cube 在数据模型里声明式定义 access policies（行过滤 + 掩码）。Heirloom 的实体级 RBAC 应走「DSL 声明 → 编译进 SQL」路线，而非独立鉴权服务。

## 对比矩阵

| 系统 | 类别 | 对象/类型 | 链接 | 属性约束 | 动作/写回 | 权限 | 演化/版本 |
|---|---|---|---|---|---|---|---|
| [TerminusDB](https://terminusdb.org/docs/knowledge-graph-database/) | 图数据库（RDF） | Class 文档类型，schema 即图 | 属性 range 指向 Class；Set/List/Array/Optional + 基数 | `@key`（Lexical/Random/Hash）、closed-world 校验，违规事务被拒 | 无动作层；文档 CRUD 事务 | RBAC：org/db 级 capability，无行级 | **强项**：不可变 ACID 历史，branch/merge/diff/time-travel |
| [TypeDB 3.x](https://typedb.com/docs/core-concepts/typeql/entities-relations-attributes/) | 强类型图数据库 | entity（独立存在）/ attribute（值即身份） | relation + roles（`relates`/`plays`），n 元 | `@card`、`@key`、`@unique`、`@values`/`@range`，commit 时校验 | 无动作层；match/insert/delete 管道 | 3.x 起全版本内置用户管理与鉴权 | define/undefine/redefine 三段式 schema 演化 |
| [OpenMetadata](https://docs.open-metadata.org/main-concepts/metadata-standard) | 元数据平台 | JSON Schema（700+）定义 entity，代码自动生成 | 独立 `entity_relationship` 表（fromId/toId/relation 整型枚举） | JSON Schema 校验；custom property 存 `extension` | 仅元数据写（PATCH/PUT），无操作动作 | 内置 RBAC（bot JWT） | schema 版本随发布管理 |
| [DataHub](https://docs.datahub.com/docs/metadata-modeling/metadata-model) | 元数据平台 | PDL schema-first：entity = urn + aspects | aspect 里的外键字段 + `@Relationship` 注解 → 有名边，双向可游走 | PDL 强类型校验（端到端） | 写入单元 = aspect（不可变 record）+ MCP 事件流 | 平台级（policy） | **强项**：versioned aspect 自动版本化 + timeseries aspect |
| [Cube](https://cube.dev/docs/product/introduction) | 语义层 | cube/view（JS/TS 数据模型） | join 声明（SQL 语义） | measure/dimension/filter，SQL 下推 | **只读**，无 mutation | **强项**：数据模型内声明式 access policies（组 + 行过滤 + 掩码）+ `query_rewrite` 钩子 | pre-aggregation 后台刷新 |
| [Hasura](https://hasura.io/docs/latest/auth/authorization/permissions/) | GraphQL API 引擎 | 表即类型（元数据驱动，非语义模型） | 外键 → 嵌套查询 | 无 schema 级约束（依赖 DB） | **强项**：Actions = 类型化自定义 query/mutation + HTTP handler（sync/async） | **强项**：role×table×operation 行级+列级权限，编译进单条 SQL | metadata 版本化（HML） |
| [Apache Atlas](https://atlas.apache.org/2.0.0/TypeSystem.html) | 元数据治理 | TypeSystem：entity（GUID 身份）/struct（嵌入无身份）/classification | RelationshipDef：endDef1/endDef2 双端 + cardinality + 容器语义 | attributeDef（isOptional/isUnique/cardinality） | 无（治理平台，REST CRUD） | 依赖外置 Apache Ranger | 类型版本 + GUID 稳定 |
| [Fluree](https://docs.flur.ee/) | 不可变账本图库 | RDF/JSON-LD，schema 宽松 | 任意三元组边 | 有限（可选 schema） | insert/upsert/update/delete HTTP API | 内置细粒度访问控制（无外部依赖） | **强项**：git 式 branch/merge，账本级不可变审计 |

## 各系统关键事实（逐条溯源）

### TerminusDB —— 文档图数据库，schema 即数据

- 存储 RDF subject–predicate–object 三元组，对上层暴露 JSON 文档接口（[Knowledge Graph Database](https://terminusdb.org/docs/knowledge-graph-database/)）。
- Schema 本身也是图（存为三元组），可用与数据相同的版本化 commit 演化；closed-world 校验：必填属性缺失或引用不存在 → 整个事务被拒（[同上](https://terminusdb.org/docs/knowledge-graph-database/)）。
- 文档类型用 `@type: "Class"` 声明；属性 range 为 xsd 类型或另一个 Class；链接即「range 为 Class 的属性」（[Schema Reference](https://terminusdb.org/docs/schema-reference-guide/)）。
- 基数：类型族 `List`/`Set`/`Array`/`Optional` + `@cardinality`/`@min_cardinality`/`@max_cardinality`（`Cardinality` 已废弃，被 `Set` 取代）（[同上](https://terminusdb.org/docs/schema-reference-guide/)）。
- **subdocument vs foreign link**：`@subdocument` 声明嵌入子文档（无独立身份，随父删除）；普通文档链接用 IRI 引用（`"country": "Country/USA"`），多值用 `{"@type":"Set","@class":...}`（[Documents 说明](https://terminusdb.org/docs/documents-explanation/)）。
- 版本是核心卖点：「每个 change 都是不可变、ACID 事务化的历史」，可 branch/merge/diff/audit/rollback，支持 time-travel 查询（[Knowledge Graph Database](https://terminusdb.org/docs/knowledge-graph-database/)）。
- 权限：User/Role/Capability/Resource 四概念；内置 Admin（全动作）/Consumer（只读）角色；capability 授在 org 或 db 级，**无行级/文档级过滤**（[Access Control](https://terminusdb.org/docs/access-control/)）。
- 查询：WOQL 与 GraphQL（[同上](https://terminusdb.org/docs/knowledge-graph-database/)）。

### TypeDB 3.x —— PERA 模型的教科书

- PERA（Polymorphic Entity-Relation-Attribute）：entity 独立存在；attribute 由值标识（`age 10` 全局唯一共享）；relation 定义 roles，靠 role player 存在，**零 player 的 relation 自动删除**（[Entities, Relations, Attributes](https://typedb.com/docs/core-concepts/typeql/entities-relations-attributes/)）。
- 接口多态：`plays employment:employer` 是能力（capability），company 与 charity 都可实现；子类型继承 supertype 的全部接口（单继承）（[同上](https://typedb.com/docs/core-concepts/typeql/entities-relations-attributes/)）。
- 基数注解直接放声明处：`owns`/`relates` 默认 `@card(0..1)`、`plays` 默认 `@card(0..)`，官方指南建议「用最严格的基数」；`@key` = `@unique` + `@card(1)`（[Schema Modeling Guide](https://typedb.com/docs/guides/schema-modeling/)）。
- 建模指南明确反对深继承：**组合优于层级**，用单角色 unary relation 做组件；relation 保持 n 元（不要把关系实体化）；命名全用名词，让查询读起来像英语（[同上](https://typedb.com/docs/guides/schema-modeling/)）。
- 3.x 用 Rust 重写，rules/inference 被**函数**取代（显式执行换取灵活性）；用户管理与鉴权进入所有版本；driver API 简化为单一 `transaction.query()`（[2.x→3.x diff](https://typedb.com/docs/reference/typedb-2-vs-3/diff/)、[3.0 发布](https://typedb.com/blog/typedb-3-0-is-now-live)）。

### OpenMetadata —— JSON Schema 驱动的实体-关系存储

- 「标准即 JSON Schema」：700+ JSON Schema（Draft 07/2020-12）定义 entity/relationship/event，代码自动生成，语言无关；另提供 RDF/OWL/SHACL/JSON-LD 导出（[Metadata Standard](https://docs.open-metadata.org/main-concepts/metadata-standard)）。
- 存储模式（值得抄）：每 entity 一张 `<entity>_entity` 表，`json` 列存全量 JSON，`fqnHash` 等列从 JSON **GENERATED**；关系不进实体表，统一存独立表 `entity_relationship`（fromId/toId/fromEntity/toEntity/relation 整型枚举，枚举名在 entityRelationship.json）（[Backend DB](https://docs.open-metadata.org/v1.12.x/api-reference/main-concepts/backend-db)）。
- API：按 ID 或 FQN 的 GET/PUT/PATCH（JSON Patch 与 JSON Merge Patch 两种）（[Update a Table](https://docs.open-metadata.org/v1.12.x/api-reference/data-assets/tables/update)）。
- 扩展：custom property 通过 type API 加到实体类型定义上，值存实体的 `extension` 属性；UI 支持的字段类型仅 String/Markdown/Integer（[Custom Properties](https://docs.open-metadata.org/v1.12.x/developers/custom-properties)）。

### DataHub —— aspect 化的元数据图

- PDL（Pegasus）schema-first，自定义注解扩展；「从客户端到存储强类型贯穿」（[Metadata Model](https://docs.datahub.com/docs/metadata-modeling/metadata-model)）。
- entity = 类型 + urn + aspects；**aspect 是最小写入原子单位**，不可变 record，可跨实体复用（Ownership 全实体共用）（[同上](https://docs.datahub.com/docs/metadata-modeling/metadata-model)、[Aspect](https://docs.datahub.com/docs/what/aspect)）。
- 两种 aspect：versioned（数值版本，存关系库）与 timeseries（时间戳，只存 ES + Kafka）（[同上](https://docs.datahub.com/docs/metadata-modeling/metadata-model)）。
- 标识：key aspect（字段必须全为 STRING/ENUM 且 REQUIRED）序列化为 urn（`urn:li:<entity>:<key>`）（[同上](https://docs.datahub.com/docs/metadata-modeling/metadata-model)）。
- 关系：aspect 内外键字段 + `@Relationship` 注解 → 有名边，**双向可游走**（Chart→OwnedBy→CorpUser，也能反向走）（[同上](https://docs.datahub.com/docs/metadata-modeling/metadata-model)）。
- 写入流：MetadataChangeProposal → 服务处理 → MetadataChangeLog 广播（[MCP/MCL](https://docs.datahub.com/docs/advanced/mcp-mcl)）；GMS 提供 REST.li + GraphQL，图形查询走 `/relationships` 端点（[Serving Tier](https://docs.datahub.com/docs/architecture/metadata-serving)、[OpenAPI Guide](https://docs.datahub.com/docs/api/openapi/openapi-usage-guide)）。
- 架构代价：MySQL + Elasticsearch + Kafka 三件套（[Components](https://docs.datahub.com/docs/components)）。

### Cube —— 只读语义层，安全声明在模型里

- 定位：数据源与消费端之间的语义层，集中管理指标定义、join、访问规则与缓存；不存业务数据，只存 pre-aggregation rollup（Cube Store）（[Introduction](https://cube.dev/docs/product/introduction)）。
- 数据模型：cube（≈表）+ measures/dimensions/filters，运行时生成 SQL 下推执行（[Data Modeling Concepts](https://cube.dev/docs/product/data-modeling/concepts)）；view 作为对外门面与治理点（[同上](https://cube.dev/docs/product/data-modeling/concepts)）。
- 安全：access policies 直接声明在数据模型文件里——组级成员访问、行级过滤、数据掩码三合一；进阶用 `query_rewrite` 钩子在查询处理前改写（如注入行级过滤）（[Access Policies](https://docs.cube.dev/docs/data-modeling/data-access-policies)、[Row-level Security](https://docs.cube.dev/docs/data-modeling/access-control/row-level-security)）。
- API：SQL（Postgres 兼容）/REST/GraphQL + Meta API（供 AI agent 自省模型）（[Introduction](https://cube.dev/docs/product/introduction)）。

### Hasura —— 权限编译与 Action 形态的标杆

- 权限粒度：**table × role × operation**（select/insert/update/delete 各配行级布尔表达式 + 列选择；select 另有聚合权限与行数上限；insert/update 有列预设与 backend-only）（[Permissions](https://hasura.io/docs/latest/auth/authorization/permissions/)）。
- 实现机制：请求带 `X-Hasura-Role` 等 session variable → 「把权限规则导出的约束编译进单条 SQL 查询」在库上执行（[同上](https://hasura.io/docs/latest/auth/authorization/permissions/)）。
- Actions：把任意 REST 逻辑接入 GraphQL API 的安全通道——handler 是 HTTP webhook（自建服务/公共 API/serverless 函数），action 以类型化 mutation/query 暴露（`type Mutation { login(...): LoginResponse }`），支持异步订阅结果（[Actions Overview](https://hasura.io/docs/latest/actions/overview/)、[Create Action](https://hasura.io/docs/latest/actions/create/)）。

### Apache Atlas —— 类型系统里最完整的「关系定义」

- 元类型：primitive/enum/collection(array,map) + 复合 entity/struct/classification/relationship；entity 与 classification 可多继承（[Type System](https://atlas.apache.org/2.0.0/TypeSystem.html)）。
- **entity vs struct**：entity 有 GUID 身份可被引用；struct 无身份，作为属性集合嵌入实体内部（[同上](https://atlas.apache.org/2.0.0/TypeSystem.html)）。
- 实体互引：属性值是 AtlasObjectId（guid + typeName）；`ownedRef` 约束表示「子实体绑定于所属实体」（[同上](https://atlas.apache.org/2.0.0/TypeSystem.html)）。
- RelationshipDef：双端 endDef1/endDef2（各含 type、name、cardinality、isContainer）+ relationshipCategory（ASSOCIATION 等）+ relationshipLabel + propagateTags（[AtlasRelationshipDef](https://atlas.apache.org/api/v2/json_AtlasRelationshipDef.html)）。
- 治理靠 classification 打标；鉴权依赖外置 Apache Ranger（生态绑定）。

### Fluree —— 账本级不可变 + 多查询语言

- 不可变账本图数据库，「temporal、verifiable、git 式 branch/merge」（[docs.flur.ee](https://docs.flur.ee/)）。
- 查询：SPARQL 1.1 / JSON-LD / openCypher；写入接受 JSON-LD/Turtle/TriG（[同上](https://docs.flur.ee/)）。
- HTTP API：`/v1/fluree/create|insert|upsert|update|delete|query`；upsert 幂等（[同上](https://docs.flur.ee/)）。
- 宣称内置细粒度访问控制、无外部依赖、无 JVM（[同上](https://docs.flur.ee/)）。

## Heirloom 借鉴清单

按支柱归类，每条注明出处与用法：

### 数据（对象/链接/类型）——喂给票 #5

1. **struct vs object 二分**：无身份嵌入值 vs 有身份可链接对象。三处独立收敛（TerminusDB subdocument [Documents](https://terminusdb.org/docs/documents-explanation/)；Atlas struct vs entity [Type System](https://atlas.apache.org/2.0.0/TypeSystem.html)；TypeDB attribute vs entity [PERA](https://typedb.com/docs/core-concepts/typeql/entities-relations-attributes/)）。→ Heirloom v1 应有 value struct（嵌入、随属主删除）与 object type（独立 ID、可被链接）两级。
2. **链接是一等声明，基数写在链接上**：TypeDB `@card(1..)`（[Schema Modeling](https://typedb.com/docs/guides/schema-modeling/)）、TerminusDB `Set` + `@cardinality`（[Schema Reference](https://terminusdb.org/docs/schema-reference-guide/)）、Atlas endDef cardinality（[RelationshipDef](https://atlas.apache.org/api/v2/json_AtlasRelationshipDef.html)）。→ Heirloom 链接声明携带单值/多值 + 必填 + （可选）排序语义；写事务校验。
3. **组合优于继承**：TypeDB 明确单继承 + 用 capability 组合（[Schema Modeling](https://typedb.com/docs/guides/schema-modeling/)）。→ Heirloom v1 可先不做类型继承（YAGNI），把「能力」留给链接与接口位。
4. **自然键与代理键分置**：TerminusDB `@key` 策略（[Schema Reference](https://terminusdb.org/docs/schema-reference-guide/)）、TypeDB `@key`/`@unique`（[同上](https://typedb.com/docs/guides/schema-modeling/)）、DataHub key aspect → urn（[Metadata Model](https://docs.datahub.com/docs/metadata-modeling/metadata-model)）。→ Heirloom：服务端生成 UUID 为主键，DSL 允许声明自然键/唯一约束。
5. **值约束就地声明**：TypeDB `@values`/`@range` 可在 attribute 定义或 ownership 局部生效（[同上](https://typedb.com/docs/guides/schema-modeling/)）。→ Heirloom 属性约束（枚举/区间/正则）写在属性声明，写时校验。

### 存储——喂给票 #7

6. **JSON 列 + 生成列 + 独立关系表**：OpenMetadata 的 `json` 列 + `fqnHash` GENERATED + `entity_relationship` 表（fromId/toEntity/relation）（[Backend DB](https://docs.open-metadata.org/v1.12.x/api-reference/main-concepts/backend-db)）证明了「一类型一表（JSON 主体）+ 中央关系表」在 700+ schema 规模可行。→ Heirloom 在 Postgres 上的混合映射首选此形。
7. **schema-as-code 端到端生成**：OpenMetadata JSON Schema 生成代码（[Metadata Standard](https://docs.open-metadata.org/main-concepts/metadata-standard)）、DataHub PDL「从客户端到存储强类型」（[Metadata Model](https://docs.datahub.com/docs/metadata-modeling/metadata-model)）。→ Heirloom TS DSL 为唯一事实源，生成 API 校验 + SDK 类型 + DDL。

### 动作——喂给票 #8

8. **Action = 类型化参数/返回 + handler，sync/async 二态**：Hasura Actions 的形（SDL 定义 mutation + HTTP handler + 异步订阅）（[Overview](https://hasura.io/docs/latest/actions/overview/)、[Create](https://hasura.io/docs/latest/actions/create/)）。→ Heirloom action：TS DSL 声明参数/返回 schema + 校验，handler 是注册函数（进程内）或 webhook（外部写回）。
9. **写入原子单元 + 变更事件**：DataHub aspect 是「最小原子写单位」+ MCP/MCL 事件流（[Aspect](https://docs.datahub.com/docs/what/aspect)、[MCP/MCL](https://docs.datahub.com/docs/advanced/mcp-mcl)）。→ Heirloom action 提交 = 一个事务 + 一条审计/变更事件（为后续订阅与同步留接口）。

### 安全——喂给票 #9

10. **权限规则编译进查询**：Hasura「行级布尔表达式 + 列选择 → 编译进单条 SQL」（[Permissions](https://hasura.io/docs/latest/auth/authorization/permissions/)）；Cube 声明式 access policies（组 + 行过滤 + 掩码）（[Access Policies](https://docs.cube.dev/docs/data-modeling/data-access-policies)）。→ Heirloom：权限在 DSL 声明、引擎编译进 SQL WHERE / RLS，不建独立鉴权服务。
11. **主体-角色-资源能力模型**：TerminusDB User/Role/Capability/Resource + 内置 Admin/Consumer（[Access Control](https://terminusdb.org/docs/access-control/)）。→ Heirloom 最小 RBAC 的形状；但要补上 TerminusDB 没有的**实体/行级**粒度（用 10 的编译路线实现）。

### 演化/审计

12. **不可变历史**：TerminusDB 不可变 ACID 历史 + branch/diff/audit（[Knowledge Graph Database](https://terminusdb.org/docs/knowledge-graph-database/)）、DataHub versioned aspect（[Metadata Model](https://docs.datahub.com/docs/metadata-modeling/metadata-model)）。→ Heirloom v1 至少做 append-only 变更历史表（审计支柱）；branch/merge 留给 v2。

## Heirloom 避开清单

1. **三件套基础设施**：DataHub 的 MySQL + ES + Kafka（[Components](https://docs.datahub.com/docs/components/)）、OpenMetadata 的 MySQL + ES。→ Heirloom v1 单 Postgres（tsvector 全文检索），不引入 ES/Kafka。
2. **发明新 schema 文本语言**：DataHub 自定义注解扩展 Pegasus（[Metadata Model](https://docs.datahub.com/docs/metadata-modeling/metadata-model)）——维护成本高、工具链孤立。→ Heirloom 用 TS DSL（写作期类型检查）+ 标准 JSON Schema（协议期校验）。
3. **类型系统过度复杂**：TypeDB 全 PERA（roles、接口多态、层级 + 函数）学习曲线陡峭，2.x→3.x 重写直接破坏兼容（[2vs3](https://typedb.com/docs/reference/typedb-2-vs-3/diff/)）。→ Heirloom v1 类型系统保持最小：二分对象/结构 + 二元链接 + 属性约束，砍掉 n 元关系与继承。
4. **IRI/命名空间泄漏到用户面**：TerminusDB 的 `@base`/`@context`/`Player/George` 展开（[Documents](https://terminusdb.org/docs/documents-explanation/)）、Fluree 的 Turtle/TriG（[docs](https://docs.flur.ee/)）对业务用户不友好。→ Heirloom 对外只有普通 JSON + 不透明 UUID。
5. **外置鉴权系统绑定**：Atlas 鉴权依赖 Apache Ranger（重依赖）。→ 见借鉴 10，编译进查询。
6. **纯语义层（只读）陷阱**：Cube 无任何 mutation 能力（[Data Modeling](https://cube.dev/docs/product/data-modeling/concepts)）、OpenMetadata/DataHub 的写仅限元数据摄取。→ Heirloom 必须有操作动作支柱，否则退化成「另一个语义层」——Palantir 明说 Ontology 「不是 semantic layer」（[Ontology System](https://www.palantir.com/docs/foundry/architecture-center/ontology-system)）。
7. **治理功能蔓延**：classification/lineage/glossary 是元数据平台的核心（Atlas/OpenMetadata/DataHub），但不是领域模型系统的 v1 必需。→ 借它们的类型系统设计，砍掉治理特性。
8. **权限粒度止步于库级**：TerminusDB 最细只到 per-database，无行级过滤（[Access Control](https://terminusdb.org/docs/access-control/)）。→ Heirloom 明确要做实体级，否则多用户自部署平台不成立。

## 与「企业领域模型系统」定位的差距

- **元数据平台**（OpenMetadata/DataHub/Atlas）建模的是「数据资产的元数据」，读多写少、变更靠摄取管道；没有操作动作、没有面向业务流程的写回。它们给 Heirloom 的只是 schema-as-code 与实体-关系存储模式。
- **图数据库**（TerminusDB/TypeDB/Fluree）建模能力强（尤其 TypeDB 的概念建模方法论），但动作层空白，权限要么粗（TerminusDB 库级）要么复杂（Fluree 细粒度但绑定 RDF 生态）；引入其一 = 引入新存储引擎，与「TS + Postgres」路线冲突。
- **语义层/API 引擎**（Cube/Hasura）：Cube 是只读度量门面；Hasura 没有语义模型（表即类型），但其**权限编译**与 **Action 形态**是四支柱中「安全」「动作」两个支柱在 TS/Postgres 生态里最成熟的实现参考。
- **结论**：开源界没有人把「Palantir 四位一体」做成一个可自部署的产品。Heirloom 的组合方式（TS DSL + Postgres 混合映射 + 编译式权限 + Hasura 形态的 Action + 审计事件流）每块都有被验证的先例，组合本身是空档。

## 对票 #5（本体语言核心语义）的直接输入

| 待决策点 | 调研倾向 | 依据 |
|---|---|---|
| 标量类型集 | string/boolean/integer/decimal/date/datetime/enum/struct + json 逃生舱 | 各家收敛（TerminusDB xsd、TypeDB value types、Atlas primitives） |
| struct vs object | 必须二分 | 借鉴 1 |
| 链接基数 | 声明处携带 single/many + required；排序 v1 可选 | 借鉴 2 |
| 继承 | v1 不做（或只做单继承 + @abstract） | 借鉴 3、避开 3 |
| n 元关系 | 不做，二元链接 + 需要属性时把关系升格为 object | TypeDB 指南（[Schema Modeling](https://typedb.com/docs/guides/schema-modeling/)）反向权衡：Heirloom 面向 API 消费者，二元 + link properties 更简单 |
| ID 表达 | 语言层不写 ID；`@key`/`@unique` 声明自然键；主键服务端生成 | 借鉴 4、避开 4 |
| 约束 | 枚举/区间/正则就地声明，写事务拒绝 | 借鉴 5 |

---

*调研完成于 2026-08-16，全部来源为各项目官方文档/官方 API 参考，抓取时间同日。*
