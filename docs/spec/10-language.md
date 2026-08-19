# 本体语言

> **范围**：对象/结构类型、属性九类标量与约束、链接（1:1/1:N/M:N）、业务键、命名元数据；DSL 外形（本章，#12 已落）。
> **不含**：演化语义（60）；动作/参数拼写细节（20）。
> **素材**：ADR-0001；#12 决议（下方 DSL 外形八项；反应物归档于 [`prototype/ts-dsl-shape` 分支](https://github.com/0xnicholas/heirloom-pro/tree/prototype/ts-dsl-shape/prototype/ts-dsl-shape)）。
> **待落位**：无。
> **验收线**：深规格（[#13](https://github.com/0xnicholas/heirloom-pro/issues/13) 决议：逐端点表、逐条规范性陈述、示例内嵌、总表归附录）

## DSL 外形（#12 决议，2026-08-19 定稿）

八项定稿，反应物为 [prototype/ts-dsl-shape](https://github.com/0xnicholas/heirloom-pro/tree/prototype/ts-dsl-shape/prototype/ts-dsl-shape)（可运行原型，21 步场景全通过）：

1. **属性声明 = 链式修饰符**（zod/drizzle 风）：`p.string().required().unique().length(1, 80)`；类型推断走幻影类型参数（值类型 × required × 默认值三轴）。被否：选项对象。
2. **链接声明 = 四基数助手**（`link.oneToOne / oneToMany / manyToOne / manyToMany`，从声明方视角命名）。
3. **链接目标一律 thunk**：`() => Employee`。前向引用与自引用均为单文件本体常态，一致性优先于局部省略。被否：非循环直传（重排声明顺序会改变合法性）；字符串目标（失类型检查）。
4. **自引用 thunk 标 `(): any => Employee`**：TS 循环初始化硬限制（drizzle `(): AnyPgColumn` 同款）——进附录已知限制清单。
5. **反向名派生规则**：省略 `reverse` → 派生为**声明方 apiName 原样**（不加复数）；目标类型侧派生名冲突 → push 拒绝，相关链接须显式 `reverse`。被否：朴素加 s（不规则复数难堪）；反向名一律必填（修 ADR-0001「可自动派生」）。
6. **遍历不对称（v1）**：正向 `q.linked(Type, obj, 'linkName')` 有类型；反向 `q.backlinks(Type, obj, 'reverseName')` 弱类型（运行时校验）。全双向类型推断的类型机成本 v1 不付，v2 再评估。
7. **编辑操作四参形态**：`ctx.link(Type, obj, 'linkName', target)`——类型打头，与 `q.linked` 对称；同型双链接时链接名为唯一键。**对象引用参数** `p.ref(() => T)`：传 UUID，execute 前注入完整对象（`department.budget` 直读）。
8. **queryFn 与 action 同构**：`queryFn({ apiName, params, execute: (q, params) => ... })`，`q` 为只读上下文（无编辑操作）；`objectType` / `action` / `queryFn` 各自成块，不引入简写。

（正文图外撰写；示例本体 = 冻结的 HR/项目域，见 [80 章](80-scenarios.md)）
