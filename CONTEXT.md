# Heirloom 语境

Heirloom：通用自部署开源平台，对标 Palantir Foundry Ontology（数据/动作/逻辑/安全四位一体，每支柱砍到最小可用）。v1 界面 = SDK + API（TS DSL + REST/GraphQL），无 UI。

本术语表由 wayfinder 图 [#1](https://github.com/0xnicholas/heirloom-pro/issues/1) 的决议维护；首个版本来自 [本体语言核心语义 #5](https://github.com/0xnicholas/heirloom-pro/issues/5)（见 [ADR-0001](docs/adr/0001-ontology-language-core-semantics.md)）。

## 术语

### 对象类型

有独立服务端 UUID 主键、可被链接、可独立查询的实体类型。查询、权限、动作的目标单位。

### 结构类型

无身份的嵌入值（如 `Address`），作为属性嵌在宿主对象内，随宿主删除。**不可链接、不可独立查询、无独立权限**。可复用于多个对象类型以共享形状（v1 无继承/接口，struct 复用是唯一的形状共享机制）。可嵌套 struct。

### 属性

对象类型上的值承载。标量九类：`string` / `boolean` / `integer`（JSON 安全区间 ±2^53）/ `float`（双精度近似）/ `decimal`（任意精度，API 层 JSON 字符串编码）/ `date` / `datetime` / `enum` / `json`（逃生舱）。默认可选，`required` 显式声明；默认值仅静态字面量（动态默认归动作层）。约束就地声明：数值 `range`、字符串 `length` + `regex`、`unique`。多值为数组属性 `T[]`（默认保序可重复，`unique` 转集合语义）。**对象引用不得作为属性值**——只能走链接。

### 链接

对象间引用的一等声明，独立于属性。单侧声明，正向命名 + 反向命名（可自动派生），双侧均可游走。基数三档：`1:1` / `1:N` / `M:N`。`required` 可选（写事务校验）。**链接不携带数据**；需要载荷（如 Membership 的角色、加入日期）时建模为中间对象类型 + 两条 1:N 链接（「升级」）。

### 自然键 / 业务键

用 `unique` 约束声明的业务标识（如员工工号）。不是主键；业务键演化不动主键。

### 对象 ID

服务端生成的 UUID 代理键。创建后不可变；对外不透明（普通 JSON + UUID，无 IRI/命名空间泄漏）。

### 命名元数据

每个类型/属性/链接携带：`apiName`（代码引用名）+ `displayName`（人类可读名）+ `description`。`status` 生命周期（experimental/active/deprecated）归本体演化管理（票 #6），不在 v1 语言核心。

## 决策记录

见 [docs/adr/](docs/adr/)。
