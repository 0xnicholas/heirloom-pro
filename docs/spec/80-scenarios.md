# 验收场景

> **范围**：示例本体（领域选型与语言构造覆盖）+ 端到端故事清单 + 覆盖矩阵（规格完整性的硬验收判据）。
> **不含**：新语义（故事只组合既有决议）；故事正文叙事（图外撰写）。
> **素材**：[#14 决议](https://github.com/0xnicholas/heirloom-pro/issues/14)（本文件即其落地）；示例本体冻结自 [#12 原型 `ontology.ts`（归档分支）](https://github.com/0xnicholas/heirloom-pro/blob/prototype/ts-dsl-shape/prototype/ts-dsl-shape/ontology.ts)。
> **待落位**：#6、#10 决议后回填覆盖矩阵占位行。
> **验收线**：深规格（[#13](https://github.com/0xnicholas/heirloom-pro/issues/13) 决议：逐端点表、逐条规范性陈述、示例内嵌、总表归附录）

## 规范性地位（#14 决议）

- **覆盖矩阵为规范性**：规格宣布完成**必须**满足——每条决议点至少被一条故事锚定；矩阵不闭合，规格不得宣布完成。
- **故事叙事为资料性**：每条故事的预期行为与正文各章（10/20/30/40/50/60/70）**必须**一致；如有冲突，以各章为准，并修正故事。

## 示例本体（#14 决议：沿用冻结）

规格示例本体 = [#12 原型（归档分支）](https://github.com/0xnicholas/heirloom-pro/blob/prototype/ts-dsl-shape/prototype/ts-dsl-shape/ontology.ts)的 HR/项目域，**冻结沿用**：Department / Employee / Skill / Project / Membership（+ Address、Money struct），动作 createDepartment / hireEmployee / grantSkill / createProject / assignToProject / transferEmployee / adjustSalary / offboardEmployee，queryFn departmentRoster / projectTeam。语言构造全覆盖：struct 复用、九类标量、数组+unique、就地约束、1:1/1:N/M:N、载荷升级中间对象、动态默认、ValidationFailed、乐观锁、无 upsert 查建两步、link 即移动、删除语义、只读函数接口位。

- #12 若调整 DSL 外形，示例本体**同步跟进**（两票互检：外形改则本体改）。
- 故事需要的安全面素材（主体、授权、PAT）在场景层补充，不改本体语言面。
- 已知毛刺：行级谓词仅限本类型属性（ADR-0004），S3 的切分示例须用本类型属性（enum 或反规范化属性），撰写时定。

## 故事清单（S0–S11，#14 决议；正文图外撰写）

| # | 故事 | 锚定决议点 | 落章 |
|---|---|---|---|
| S0 | 部署引导：compose 起栈→自动迁移→引导超管→签发 PAT | ADR-0005、0004、0006（运行时环境） | 70/50 |
| S1 | 本体推送：CLI push 首版本体 | ADR-0007（期望态收敛、revision） | 60 |
| S2 | 批量接入：服务账号经接入端点导入存量，批次审计一条 | ADR-0005 | 70/20 |
| S3 | 读授权两态：全类型授权 vs 谓词收窄；静默收窄、零授权=零行 | ADR-0004 + ADR-0008（零行=200） | 50/30 |
| S4 | 录用正反路径：动态默认→ValidationFailed→422→回滚无审计→修正成功→审计一条 | ADR-0003 + ADR-0008（invoke/422 编码） | 20/30 |
| S5 | 并发调薪：双发 adjustSalary，expectedUpdatedAt→409 回滚 | ADR-0003 | 20 |
| S6 | 白名单两拒：引擎层白名单拒 vs execute 内 PermissionDenied；安全日志形状各一 | ADR-0004 | 50 |
| S7 | 链接全家桶：transfer（link 即移动）、grantSkill（无 upsert 查建）、assign（载荷升级+同事务引用） | ADR-0001、0003 | 10/20 |
| S8 | 删除语义：先清 Membership（required 阻止）→删员工；技能 optional 自动摘链 | ADR-0002 | 40 |
| S9 | 查询包：嵌套过滤+一跳链接过滤+keyset+count+include 2 跳；queryFn 花名册 | ADR-0002 + ADR-0008（query 端点形状） | 30/40 |
| S10 | 演化小步：加属性再 push，变更分类学落点 | ADR-0007（三档矩阵+联动校验） | 60 |
| S11 | 审计与安全日志查询：管理面只读端点、过滤 | ADR-0003/0004 + ADR-0008（admin 端点形状） | 30/50 |

## 覆盖矩阵（规范性）

| 决议点 | 锚定故事 | 状态 |
|---|---|---|
| ADR-0001 本体语言核心（类型/属性/链接/约束） | S7（+示例本体全构造） | ✓ |
| ADR-0002 存储映射（查询包/删除语义） | S8、S9 | ✓ |
| ADR-0003 动作（校验/乐观锁/审计/RYW） | S4、S5、S7、S11 | ✓ |
| ADR-0004 安全（PAT/读授权/白名单/安全日志） | S0、S3、S6、S11 | ✓ |
| ADR-0005 接入与部署 | S0、S2 | ✓ |
| ADR-0006 语言与运行时（环境性前提） | S0 | ✓ |
| #12 TS DSL 外形 | 示例本体即反应物（S1/S4/S7 全体） | ✓ |
| #6 本体定义与演化 | S1、S10 | ✓ |
| #10 API 与逻辑接口 | S3、S4、S9、S11 编码面 | ✓ |

（故事正文图外撰写）
