# PROTOTYPE — TS DSL 外形原型（票 #12 反应物）

> **一次性产物，非交付代码。** 本目录回答一个问题：**本体定义 DSL 的「外形」对不对、手感好不好。**
> 定稿后本目录进 throwaway 分支存档，不进 main；main 只留被验证的决策。

## 运行

```bash
bun run prototype/ts-dsl-shape/demo.ts
```

（或 `tsx prototype/ts-dsl-shape/demo.ts`。无需安装依赖。）

## 文件

| 文件 | 角色 |
|---|---|
| `ontology.ts` | **反应物本体**——读这份文件的手感就是本票的问题 |
| `dsl.ts` | 让样例可运行的最小内存内核（注册表/五编辑操作/事务快照回滚） |
| `demo.ts` | 场景脚本：21 步动作 + 查询，每步打印结果与受影响状态 |

## 请针对这些口味决策点反应

1. **属性声明风格**：`p.string().required().unique().length(1, 80)` 链式修饰符（zod/drizzle 风）——还是你更想要选项对象 `p.string({ required: true, ... })`？
2. **链接声明**：`link.oneToMany(() => Employee, { reverse: 'department' })`——基数从声明方视角拼进助手名（oneToOne/oneToMany/manyToOne/manyToMany 四个拼写对应三档基数）。读 `Membership` 的两条 manyToOne 时歧义感如何？
3. **thunk 目标**：`() => Employee`。自引用/循环声明必须有 thunk；为一致性全部链接与 ref 都用 thunk。且自引用场景 thunk 还需标成 `(): any => Employee`（TS 循环初始化硬限制，drizzle 的 `(): AnyPgColumn` 同款毛边）。能接受这两层噪音吗？
4. **反向遍历**：正向 `q.linked(Department, dept, 'employees')` 走声明、有类型；反向 `q.backlinks(Project, pj, 'memberships')` 按反向名查、弱类型。这个不对称能接受吗，还是反向也该一等？
5. **动作的拼写**：`action({ apiName, params, execute: (ctx, params) => ... })`，`ctx.create/modify/delete/link/unlink` 五操作。`ctx.link(Department, dept, 'employees', emp)` 的四参形态（类型定义打头）手感如何？
6. **对象引用参数**：`p.ref(() => Department)` 传 UUID、execute 前注入完整对象——读 `hireEmployee` 里 `department.budget` 的直接访问，这个「注入即完整对象」的感觉对吗？
7. **函数注册接口位**：`queryFn({...})` 与 action 同构但 execute 拿只读 `q`。作为 v1 逻辑支柱的唯一形态，够用吗？
8. **整体密度**：一个类型一个 `objectType({...})` 块、动作各自成块——读 `ontology.ts` 全文，哪儿啰嗦、哪儿太省？

## 场景覆盖（对应 ADR 决策）

- struct 复用与嵌套（`Address`/`Money`）、九类标量、数组集合语义（`certifications` 去重）— ADR-0001
- 一等链接三档：1:N（部门-员工）、1:1 自链接（mentor）、M:N（skills）— ADR-0001
- 载荷升级中间对象（`Membership` + 双 required 1:N）— ADR-0001 决策 6
- 动态默认 `(ctx) => ctx.today`、execute 内校验 `ValidationFailed` 逐字段 — ADR-0003
- 无 upsert 的「查-建」两步（`grantSkill`）、同事务引用新建对象、RYW — ADR-0003
- `expectedUpdatedAt` 乐观锁冲突回滚 — ADR-0003 决策 8
- 删除：required 阻止（张三离职被拒）、optional 自动摘链（王五离职）— ADR-0002
- 审计只记已提交动作，回滚不落审计 — ADR-0003 决策 9

## 已知的原型简化（勿反应这些）

- UUID 用 v4 随机（规格定 UUIDv7）；约束校验在内存做（规格为 Postgres 原生约束）
- `backlinks` 弱类型；decimal 的 range 比较走 Number 强转
- 无鉴权/主体概念（#9 已定，DSL 面无感知）
