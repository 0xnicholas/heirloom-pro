# 调研：TS+Postgres 技术栈选型依据

- **票**：[#4 调研：TS+Postgres 技术栈选型依据](https://github.com/0xnicholas/heirloom-pro/issues/4)
- **父图**：[#1 Heirloom 图：企业领域模型系统的规格之路](https://github.com/0xnicholas/heirloom-pro/issues/1)
- **服务对象**：[#7 存储引擎映射](https://github.com/0xnicholas/heirloom-pro/issues/7)、[#9 安全模型最小版](https://github.com/0xnicholas/heirloom-pro/issues/9)
- **已锁定前提**（图 Notes）：TypeScript 全栈 + Postgres；本体 schema 由用户在运行时定义，编译期未知。

## TL;DR 决策点速览

| # | 决策点 | 推荐 | 一句话理由 |
|---|--------|------|-----------|
| D1 | 动态本体下的查询/DDL 层 | **Kysely**（平台静态表可选 Drizzle，排除 Prisma） | Kysely 是"SQL 之上的薄层"，schema 认知只存在于 TS 类型层，不与运行时本体冲突；Prisma client 是 build-time 生成物，与运行时 schema 根本不兼容 |
| D2 | 动态属性的物理存储 | **通用对象表 + `properties jsonb` + 选择性表达式/部分索引** | jsonb 支持 GIN/表达式索引，写入与查询路径都被官方文档覆盖；热属性"升列"留作演化路径而非 v1 前提 |
| D3 | 行级权限的执行点 | **v1 应用层谓词注入为主；RLS 作纵深防御可选层（事务级 `SET LOCAL`/`set_config(...,true)`）** | RLS 策略是静态 DDL，而 Heirloom 本体是运行时动态的；且 RLS 有 owner 旁路、连接池泄漏、per-row 评估成本等已知坑 |

---

## 1. 背景：为什么"运行时动态本体"改变选型题

Heirloom 的核心特征：**对象类型由平台用户在运行时定义**（对标 Palantir Foundry Ontology 的 [Ontology 系统](https://www.palantir.com/docs/foundry/architecture-center/ontology-system)——语言、引擎、工具链三层）。这意味着传统 TS ORM 的核心卖点——"从静态 schema 文件推导编译期类型"——不再是选型主轴；主轴变成：**库在运行时对"我不知道的表结构"有多友好，以及 DDL 能否由引擎自己生成**。

类型安全在 Heirloom 里由另一层提供：用户本体 DSL → Heirloom 生成器 → 用户侧 SDK 类型。数据库层只需要忠实的 SQL 生成与执行。

---

## 2. schema-as-code 库适配性（Drizzle vs Kysely vs Prisma）

### 2.1 一手事实

**Prisma**
- "Prisma Client is Prisma ORM's **generated**, type-safe query builder… It is **tailored to your schema**"（[Prisma Client 文档](https://www.prisma.io/docs/orm/prisma-client)）。
- schema 定义在 `.prisma` 文件里，用 Prisma Schema Language（PSL）书写（[Prisma Schema 概览](https://www.prisma.io/docs/orm/prisma-schema/overview)）。
- "`prisma generate`: Reads _all_ above mentioned information from the Prisma schema **to generate** the correct data source client code (e.g. Prisma Client)"（同上 schema 概览）——client 是从 schema 文件**生成**的构建产物。

**Drizzle**
- "Using Drizzle you can **define and manage database schemas in TypeScript**, access your data in a SQL-like or relational way"（[Drizzle 概览](https://orm.drizzle.team/docs/overview)）；schema 用 `pgTable('cities', {...})` 等 TS 代码声明。
- Drizzle Kit 是 CLI 工具："generate SQL migration files based on your Drizzle schema"、"push schema directly to the database"；配置要求提供 `dialect` 与 `schema` 路径（如 `schema: "./src/schema.ts"`）（[Drizzle Kit 概览](https://orm.drizzle.team/docs/kit-overview)）——**迁移工具链围绕磁盘上的 dev-time schema 文件工作**。
- 卖点与约束："Drizzle always outputs exactly 1 SQL query"、"exactly 0 dependencies"（[概览](https://orm.drizzle.team/docs/overview)）。

**Kysely**
- "A **thin abstraction layer over SQL**, crafted by SQL lovers for SQL lovers. Familiar naming, **predictable 1:1 query compilation**"（[kysely.dev](https://kysely.dev/)）。
- "no dependencies… Runs in Node.js, Deno, Bun, AWS Lambda, Cloudflare Workers, and browsers"（[kysely.dev](https://kysely.dev/)）。
- schema 类型通过 fluent API 流动："Your database schema types flow through Kysely's fluent API"；codegen 是**可选外挂**而非前提："With `kysely-codegen`, your database is the source of types"（[kysely.dev](https://kysely.dev/)）——即：Kysely 的 schema 认知**只存在于编译期 TS 类型**，运行时不持有 schema 模型。

### 2.2 对 Heirloom 的含义（分析）

| | 运行时动态 schema | DDL 由引擎生成 | 结论 |
|---|---|---|---|
| Prisma | client 是从 `.prisma` 文件生成的构建产物，"tailored to your schema"；运行时新增对象类型无法进入 client | schema→client 的生成链以静态文件为源 | **不兼容**——每次本体演化都要跑 codegen，无法服务运行时定义 |
| Drizzle | `pgTable()` 本质是运行时函数调用，理论上可动态构造表对象（文档未承诺此用法，属未支持路径）；类型推导在动态场景失效 | drizzle-kit 只认磁盘上的 schema 文件（`schema: "./src/schema.ts"`），运行时 DDL 需绕开工具链手写 | **半适配**——查询层可用，迁移工具链帮不上忙，动态用法无官方背书 |
| Kysely | 运行时不持有任何 schema 模型；`sql` 模板与 1:1 编译让"引擎解释本体→生成 SQL"路径最短 | 无迁移工具强绑定，DDL 自然是手写 SQL（引擎自己生成） | **最适配**——不与动态本体争夺 schema 所有权 |

### 2.3 建议（D1）

- **主查询层选 Kysely**：Heirloom 引擎做"本体解释器"，对动态对象表用 `sql` 模板/动态查询构造；平台自身的静态表（用户、权限、本体注册表）类型可以手写 `Database` interface，享受编译期检查。
- **可选混合**：若团队偏好 Drizzle 的 API 手感，平台静态表可用 Drizzle；但动态对象存储的查询与 DDL 一律走 Kysely/裸 SQL，避免两套体系在动态层纠缠。
- **排除 Prisma**：生成式 client 与"运行时定义本体"是结构性冲突，不是配置能绕过的。

**风险**：Kysely 路线意味着 Heirloom 要自己写"本体→DDL"的迁移生成器（Drizzle/Prisma 的迁移能力都用不上）；这是新代码量，但换来完全的控制权。此外 Kysely 动态查询（拼 `sql` 片段）的 TS 类型是宽松的——可接受，因为类型安全由用户侧 SDK 生成层负责。

---

## 3. JSONB 存动态属性

### 3.1 一手事实：存储格式

- `jsonb` 以**分解的二进制格式**存储：输入"slightly slower"（转换开销），处理"significantly faster"（无需重复解析），且**支持索引**——"which can be a significant advantage"（[PostgreSQL §8.14 JSON 类型](https://www.postgresql.org/docs/current/datatype-json.html)）。除非需要保留键序等特殊需求，官方建议大多数应用选 jsonb 而非 json。
- jsonb 不保留键序、忽略重复键与空白（[同上](https://www.postgresql.org/docs/current/datatype-json.html)）。
- jsonb 上也能建 btree/hash 索引，但"usually useful only for equality of complete documents"（[同上](https://www.postgresql.org/docs/current/datatype-json.html)）——排序/范围查询需要别的手段（见 3.2）。

### 3.2 一手事实：索引策略

**GIN 操作符类**（[PostgreSQL §8.14 索引](https://www.postgresql.org/docs/current/datatype-json.html)）：
- 默认 `jsonb_ops`：支持 `?`、`?|`、`?&`（存在性）与 `@>`（包含）及 jsonpath 的 `@?`/`@@`。
- `jsonb_path_ops`：只支持 `@>`/`@?`/`@@`；索引项是"值+键路径"的哈希，搜索**更精确**、索引更小，但对无值结构（如 `{"a": {}}`）无索引项，此类查询退化为全索引扫描"which is quite slow"。
- 官方明确：`jsonb_ops` 的包含查询是对多个独立键/值索引项做 AND，"less specific and slower"，行数多时尤其如此。

**表达式索引**（[PostgreSQL §11.7](https://www.postgresql.org/docs/current/indexes-expressional.html)）：
- 对嵌套键做存在性/等值查询需要表达式索引：文档示例 `CREATE INDEX … USING GIN ((jdoc -> 'tags'))`（[JSON §8.14](https://www.postgresql.org/docs/current/datatype-json.html)）。
- 等值/排序/范围查询：对 `((properties->>'name'))` 建 btree 表达式索引后，planner 把 `WHERE (properties->>'name') = 'x'` 当作普通索引列处理，"the speed of the search is equivalent to any other simple index query"（[§11.7](https://www.postgresql.org/docs/current/indexes-expressional.html)）。
- 代价："Index expressions are **relatively expensive to maintain**, because the derived expression(s) must be computed for each row insertion and non-HOT update"（[§11.7](https://www.postgresql.org/docs/current/indexes-expressional.html)）。
- UNIQUE 表达式索引可以约束"非简单唯一"的语义（如 `(object_type, lower(properties->>'email'))` 唯一）（[§11.7](https://www.postgresql.org/docs/current/indexes-expressional.html)）。

**部分索引**（[PostgreSQL §11.3](https://www.postgresql.org/docs/current/indexes-partial.html)）：
- 定义："an index built over a subset of a table; the subset is defined by a conditional expression"。
- 使用条件："a partial index can be used in a query only if the system can recognize that the `WHERE` condition of the query **mathematically implies** the predicate of the index"；匹配发生在**查询计划期而非运行期**，因此 "parameterized query clauses do not work with a partial index"。
- 用途之一："avoid indexing common values"（如只为 `object_type = 'open_order'` 的行建索引）。

### 3.3 一手事实：TOAST 与大对象成本

- TOAST 触发条件：行宽超过 `TOAST_TUPLE_THRESHOLD`（"normally 2 kB"）；默认策略先压缩、再移出行外，直到行小于 `TOAST_TUPLE_TARGET`（[PostgreSQL §70.2 TOAST](https://www.postgresql.org/docs/current/storage-toast.html)）。
- `jsonb` 属 TOAST 可用类型，默认策略是 EXTENDED（压缩+移出）（[§70.2](https://www.postgresql.org/docs/current/storage-toast.html)——EXTENDED "is the default for most TOAST-able data types"；jsonb 未在该页点名，但属 varlena 类型，可在部署时用实测确认）。
- 更新成本的关键官方句子："During an UPDATE operation, values of **unchanged** fields are normally preserved as-is; so an UPDATE of a row with out-of-line values incurs **no TOAST costs if none of the out-of-line values change**"（[§70.2](https://www.postgresql.org/docs/current/storage-toast.html)）——反面含义：**只要 jsonb 值变了，整个 out-of-line 值就要重写**。对"单属性更新"而言，jsonb 是全值替换：改一个键等于重写整个属性集，大对象高频小改是写放大点。
- 读侧好消息："The big values of TOASTed attributes will only be pulled out (if selected at all) at the time the result set is sent to the client"，主表因此更小、缓存命中与内存排序更友好（[§70.2](https://www.postgresql.org/docs/current/storage-toast.html)）。

### 3.4 建议（D2）

- **v1 采用通用对象表模式**：`(id, object_type, properties jsonb, created_at, updated_at, …)`，每类型的热查询属性由**表达式索引**（等值/排序）与**部分索引**（按 `object_type` 切分）覆盖；包含查询（如数组标签过滤）用 GIN `@>`。
- **索引按需创建**：本体 DSL 里属性可声明"indexed"，引擎据此发 `CREATE INDEX`——与官方"表达式索引维护贵、换检索快"的权衡一致（[§11.7](https://www.postgresql.org/docs/current/indexes-expressional.html)）。
- **热属性升列留作演化路径**：v1 不做"一类型一表"也不做自动升列；文档化升级手法（`ALTER TABLE … ADD COLUMN` + `UPDATE` 回填 + 表达式索引退役）。
- 部分索引只在**查询谓词包含字面量条件**（如固定 `object_type`）时可用——引擎生成查询时必须内联类型字面量，不能用参数占位符（[§11.3](https://www.postgresql.org/docs/current/indexes-partial.html)）。

**风险与已知代价**：
1. `jsonb_ops` 包含查询选择性差（官方明示 "less specific and slower"）；高频包含查询考虑 `jsonb_path_ops`（牺牲 `?` 类查询）。
2. 表达式索引在每次插入与非 HOT 更新时重算（[§11.7](https://www.postgresql.org/docs/current/indexes-expressional.html)）；索引声明要克制。
3. planner 对 jsonb 内部键值的统计信息有限——**此点本次未拿到一手文档来源，列为待验证**（PG14+ 的表达式统计/`CREATE STATISTICS` 可能缓解，需实测确认后再写入规格）。
4. 大属性集（>2KB）每次属性更新全值重写（由 §70.2 反推）；规格应给"单对象属性集大小"一个软上限建议。

---

## 4. Postgres RLS：实践与坑

### 4.1 一手事实：语义

（来源：[PostgreSQL §5.8 Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)）

- 策略按命令粒度：`ALL`/`SELECT`/`INSERT`/`UPDATE`/`DELETE`；`USING` 控制可见性，`WITH CHECK` 控制可写性；INSERT 只用 `with check`，UPDATE 两者都用，DELETE 只用 `using`（[§5.8](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)；另见 [Supabase RLS 指南](https://supabase.com/docs/guides/database/postgres/row-level-security)的对应说明）。
- 未定义 `WITH CHECK` 时隐式复用 `USING`。
- 多策略组合：permissive（默认）之间 **OR**，restrictive 之间及与 permissive 之间 **AND**。
- **默认拒绝**："If no policy exists for the table, a default-deny policy is used, meaning that no rows are visible or can be modified."——启用 RLS 但没写策略 = 全锁死。
- **旁路者**：超级用户与 `BYPASSRLS` 角色"always bypass"；**表 owner 通常也旁路**，除非 `ALTER TABLE … FORCE ROW LEVEL SECURITY`。
- **覆盖盲区**：`TRUNCATE`、`REFERENCES` 不受 RLS 约束；唯一约束/外键等引用完整性检查"always bypass row security"——官方警告存在通过完整性检查错误的"covert channel"泄露风险。
- `row_security=off` 不是旁路而是**报错**：任何会被策略过滤的查询直接失败，便于审计排查。

### 4.2 一手事实：连接池下的变量传递

- `SET LOCAL`："The effects of `SET LOCAL` last only till the end of the current transaction, **whether committed or not**"；在事务外执行只产生警告且无效果（[PostgreSQL `SET` 文档](https://www.postgresql.org/docs/current/sql-set.html)）。等价 API：`set_config('app.uid', $1, true)`（is_local=true）。
- **PgBouncer 事务池化模式下 `SET/RESET` 兼容性 = "Never"**（官方特性表，[pgbouncer.org/features](https://www.pgbouncer.org/features.html)）：会话级 `SET` 写的变量会**残留在池化连接上泄漏给下一个客户端**。同表中标明 LISTEN、会话级 advisory lock、`PREPARE/DEALLOCATE` 等同样不兼容。
- 正确模式（Supabase 实践同向）：在**显式事务内**执行 `BEGIN; SELECT set_config('app.user_id', …, true); …查询…; COMMIT;`，GUC 随事务结束自动还原（[§SET LOCAL](https://www.postgresql.org/docs/current/sql-set.html)）。

### 4.3 一手事实：性能

- 官方："This expression will be evaluated **for each row** prior to any conditions or functions coming from the user's query"，除非涉及 leakproof 函数可被优化器提前（[§5.8](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)）。
- 官方最佳实践："consider only the current values in the row to be accessed or updated. This is the simplest and **best-performing case**"——策略里查别的表（权限表）会引入额外计划节点；官方还警告对被引用表的"heavy concurrent use of row share locks"可能成为性能问题（[§5.8](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)）。
- [Supabase RLS 性能指南](https://supabase.com/docs/guides/database/postgres/row-level-security)的实测建议：
  - "You can just think of them as adding a `WHERE` clause to every query"——理解成本模型的最简模型；
  - "the performance impact is important to keep in mind. This is especially true for queries that scan every row in a table - like many `select` operations, **including those using limit, offset, and ordering**"；
  - 策略中用到的列**必须建索引**：文档给出实测 171ms → <0.1ms（99.94%）的例子；
  - 策略里的函数调用要包成 `(select auth.uid())` 形式，让 planner 作为 `initPlan` **只执行一次**而不是逐行执行（[Supabase 文档](https://supabase.com/docs/guides/database/postgres/row-level-security)）。

### 4.4 与 OR 层的组合：两个可选执行点

**模式 A：RLS 为执行点（DB-enforced）**
- 每对象类型表（或通用表）挂策略，读 `current_setting('app.uid')` 关联 Heirloom 权限表。
- 优点：任何直连 DB 的路径都被约束（纵深防御到库级）。
- 坑（全部有官方来源）：策略是**静态 DDL**，而 Heirloom 本体运行时演化——每次类型/权限语义变化都要生成/替换 `CREATE POLICY`（DDL 权限仅限表 owner，[§5.8](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)）；表 owner/超级用户旁路；池化下必须事务级 GUC；策略引用权限表引入 per-row/锁成本；TRUNCATE/FK 旁路。

**模式 B：应用层谓词注入（app-enforced）**
- Heirloom 引擎在生成 SQL 时把权限判定编译进 `WHERE`/`RETURNING`（等价于"自动加 WHERE"的 RLS 心智模型，但发生在引擎内）。
- 优点：与动态本体同构（权限规则就是本体元数据，无 DDL 同步问题）；可单测；不踩池化/owner 坑。
- 代价：直连 DB 的旁路无保护——需要用"应用独占数据库账号"来封住。

### 4.5 建议（D3）

- **v1 以模式 B 为主执行点**：权限是本体元数据的一部分，由引擎在查询编译期注入谓词；DB 账号仅归 Heirloom 服务持有（不向用户发直连凭证），以此关闭旁路面。
- **模式 A 作为可选的纵深防御层**：对平台静态表（用户/权限本体注册表）可用固定策略 + `FORCE ROW LEVEL SECURITY` + 事务级 `set_config(..., true)`；对动态对象表若启用 RLS，策略须由引擎按本体演化自动生成——此为 v2 增强，不进 v1 最小集。
- 规格中必须写死的两条红线：(1) 池化部署（含未来引入 PgBouncer）下**禁止会话级 SET 传用户身份**，一律事务级（[PgBouncer 特性表](https://www.pgbouncer.org/features.html)+[SET LOCAL 语义](https://www.postgresql.org/docs/current/sql-set.html)）；(2) 若启用 RLS，"无策略=默认拒绝"（[§5.8](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)）——新表挂 RLS 却忘写策略会静默锁死，须在引擎建表流程中原子完成"建表+挂策略"。

---

## 5. 汇总：给 #7 与 #9 的直接输入

**给 [#7 存储引擎映射](https://github.com/0xnicholas/heirloom-pro/issues/7)**：
1. 查询层推荐 Kysely（动态层）+ 可选 Drizzle（静态平台表）；排除 Prisma（D1）。
2. 存储映射推荐通用对象表 + `properties jsonb`；索引由本体 DSL 的 "indexed" 声明驱动（表达式索引/部分索引/GIN 三类，各有官方权衡依据）（D2）。
3. 引擎需自研"本体→DDL"迁移生成器（Drizzle/Prisma 的迁移工具链均围绕 dev-time 文件）。
4. 查询生成器须知：部分索引要求谓词在计划期可证明（内联字面量，不用参数占位）；包含查询优先 `jsonb_path_ops`。

**给 [#9 安全模型最小版](https://github.com/0xnicholas/heirloom-pro/issues/9)**：
1. v1 行级权限执行点 = 应用层谓词注入；DB 连接凭证仅服务持有（D3）。
2. 若规格决定加 RLS 纵深防御：事务级 GUC 传递、`FORCE ROW LEVEL SECURITY`、无策略=默认拒绝、策略列建索引、函数包 `(select …)` 成 initPlan——五条都是官方/实测来源的硬约束。
3. 连接池红线：身份变量禁止会话级 SET（PgBouncer 事务池化下 "Never"）。

---

## 来源清单（均为一手来源）

| 主题 | 来源 |
|---|---|
| RLS 语义/旁路/性能 | [PostgreSQL §5.8 Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) |
| SET LOCAL 事务级语义 | [PostgreSQL SET 参考](https://www.postgresql.org/docs/current/sql-set.html) |
| PgBouncer 池化兼容表 | [pgbouncer.org/features](https://www.pgbouncer.org/features.html) |
| RLS 实战性能 | [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) |
| jsonb 存储/索引/操作符类 | [PostgreSQL §8.14 JSON Types](https://www.postgresql.org/docs/current/datatype-json.html) |
| 表达式索引 | [PostgreSQL §11.7 Indexes on Expressions](https://www.postgresql.org/docs/current/indexes-expressional.html) |
| 部分索引 | [PostgreSQL §11.3 Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html) |
| TOAST | [PostgreSQL §70.2 TOAST](https://www.postgresql.org/docs/current/storage-toast.html) |
| Prisma 定位/codegen | [Prisma Client](https://www.prisma.io/docs/orm/prisma-client)、[Prisma Schema 概览](https://www.prisma.io/docs/orm/prisma-schema/overview) |
| Drizzle 定位/kit | [Drizzle 概览](https://orm.drizzle.team/docs/overview)、[Drizzle Kit 概览](https://orm.drizzle.team/docs/kit-overview) |
| Kysely 定位 | [kysely.dev](https://kysely.dev/) |
| 对标背景 | [Palantir Foundry Ontology](https://www.palantir.com/docs/foundry/architecture-center/ontology-system) |

## 待进一步验证（未拿到一手来源，写入规格前需实测）

1. **jsonb 内部键值的 planner 统计质量**：PG14+ 表达式统计/`CREATE STATISTICS` 能否改善 jsonb 谓词的行数估计——建议在 #7 落地前用 `EXPLAIN (ANALYZE)` 基准验证。
2. **jsonb 默认 TOAST 策略的官方点名**：§70.2 未逐类型列出默认策略，只说 EXTENDED 是"most TOAST-able types"的默认；部署时用 `\d+` 确认即可（预期 EXTENDED）。
3. **Kysely 动态查询的注记**：`sql` 模板拼动态条件的类型宽松属预期行为（文档未直接讨论"运行时未知 schema"场景）——以 Heirloom 引擎自身的集成测试兜底。
