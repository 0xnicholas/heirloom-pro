/**
 * PROTOTYPE — 场景驱动脚本（throwaway 外壳）。
 * 逐步 apply 动作，每步打印结果与受影响类型的全量状态。
 * 运行：bun run prototype/ts-dsl-shape/demo.ts
 */

import { Engine, ValidationFailed, ConflictError, EngineError, type ApplyResult, type ActionDef, type Props, type InferInput } from './dsl';
import './ontology';
import {
  Department, Employee, Skill, Project, Membership,
  createDepartment, hireEmployee, grantSkill, createProject,
  assignToProject, transferEmployee, adjustSalary, offboardEmployee,
  departmentRoster, projectTeam,
} from './ontology';

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;
const short = (id: string) => id.slice(0, 8);

const engine = new Engine();

// ── 状态打印 ─────────────────────────────────────────────────────
function labelOf(type: string, obj: Record<string, any>): string {
  return obj.name ?? obj.title ?? obj.code ?? obj.employeeNo ?? `${obj.role ?? ''}@${short(obj.id)}`;
}
function printType(apiName: string) {
  const rows = engine.table(apiName);
  console.log(B(`  ${apiName} ×${rows.length}`));
  for (const o of rows) {
    const { id, createdAt, updatedAt, ...props } = o;
    const kv = Object.entries(props)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('  ');
    console.log(`    ${labelOf(apiName, o)} ${D(`<${short(id)}>`)}  ${D(kv)}`);
  }
}
function printLinks() {
  const entries = engine.linkEntries();
  if (!entries.length) return;
  console.log(B('  链接'));
  for (const e of entries) {
    const fromType = engine.table(e.link.declaringType).find((o) => o.id === e.from);
    const targets = e.toIds
      .map((id) => {
        const t = engine.table(e.link.def.target().apiName).find((o) => o.id === id);
        return t ? labelOf(e.link.def.target().apiName, t) : short(id);
      })
      .join(', ');
    console.log(`    ${e.link.declaringType}(${fromType ? labelOf(e.link.declaringType, fromType) : short(e.from)}) --${e.link.name}--> ${targets}`);
  }
}
function printState(types: string[]) {
  for (const t of types) printType(t);
  printLinks();
}

// ── 步骤执行器 ───────────────────────────────────────────────────
let step = 0;
let applyCount = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function applyStep<P extends Props, R>(title: string, def: ActionDef<P, R>, params: InferInput<P>): ApplyResult<Awaited<R>> {
  step++;
  applyCount++;
  console.log(`\n${B(`[${step}] ${title}`)}  ${D(`apply(${def.apiName})`)}`);
  console.log(D(`    参数: ${JSON.stringify(params)}`));
  const r = engine.apply(def, params);
  if (r.ok) {
    console.log(`    ✅ 已提交  ${D(`tx=${short(r.audit.txId)}  ${r.edits.length} 个编辑`)}`);
    for (const e of r.edits) console.log(D(`       ${e.op} ${e.type} <${short(e.id)}> ${e.detail ?? ''}`));
    console.log(D(`    返回: ${JSON.stringify(r.result)}`));
  } else {
    const e = r.error;
    if (e instanceof ValidationFailed) {
      console.log(`    ❌ ValidationFailed（已回滚）`);
      for (const [f, msg] of Object.entries(e.fields)) console.log(`       ${f}: ${msg}`);
    } else if (e instanceof ConflictError) {
      console.log(`    ❌ ConflictError（已回滚）: ${e.message}`);
    } else if (e instanceof EngineError) {
      console.log(`    ❌ EngineError（已回滚）: ${e.message}`);
    }
  }
  return r;
}

// ═══ 场景开始 ═══
console.log(B('\n═══ 本体注册表 ═══'));
console.log(`对象类型: department, employee, skill, project, membership`);
console.log(`struct:   address, money`);
console.log(`动作:     create-department, hire-employee, grant-skill, create-project,`);
console.log(`          assign-to-project, transfer-employee, adjust-salary, offboard-employee`);
console.log(`查询函数: department-roster, project-team  ${D('（只读接口位，调用桥 → v2）')}`);

console.log(B('\n═══ 场景 ═══'));

// 1. 建两个部门
const rd = applyStep('新建部门「研发部」', createDepartment, { name: '研发部', budget: '3000000' });
const ds = applyStep('新建部门「设计部」', createDepartment, { name: '设计部', budget: '1500000' });
const rdId = rd.ok ? rd.result.departmentId : '';
const dsId = ds.ok ? ds.result.departmentId : '';
printState(['department']);

// 2. 录用三名员工
const z3 = applyStep('录用张三（研发部；struct 地址、集合数组、动态默认 hiredAt）', hireEmployee, {
  employeeNo: 'E001', name: '张三', department: rdId, salary: '800000',
  certifications: ['AWS', 'AWS', 'K8s'], // 集合语义：重复值去重
  address: { street: '中关村大街 1 号', city: '北京', zip: '100080' },
});
printState(['employee']);
const l4 = applyStep('录用李四（研发部；指定 mentor → 1:1 自链接）', hireEmployee, {
  employeeNo: 'E002', name: '李四', department: rdId, salary: '950000',
  hiredAt: '2025-03-01', mentor: z3.ok ? z3.result.employeeId : '',
});
const w5 = applyStep('录用王五（设计部）', hireEmployee, {
  employeeNo: 'E003', name: '王五', department: dsId, salary: '700000',
});
printState(['employee']);

// 3. 失败案例：超预算 / ref 不存在 / 唯一冲突
applyStep('录用赵六（年薪超部门预算 → ValidationFailed）', hireEmployee, {
  employeeNo: 'E004', name: '赵六', department: rdId, salary: '3500000',
});
applyStep('录用孙七（department 引用不存在的 id → 参数校验失败）', hireEmployee, {
  employeeNo: 'E005', name: '孙七', department: 'no-such-department-id', salary: '100000',
});
applyStep('重复工号 E001（→ 唯一约束冲突）', hireEmployee, {
  employeeNo: 'E001', name: '张三二世', department: rdId, salary: '100000',
});
printState(['employee']); // 三例全部回滚，状态应与上面一致

// 4. 技能：M:N + 无 upsert 的「查-建」两步
const z3Id = z3.ok ? z3.result.employeeId : '';
const l4Id = l4.ok ? l4.result.employeeId : '';
const w5Id = w5.ok ? w5.result.employeeId : '';
applyStep('授予张三 TypeScript（技能不存在 → 同事务先建后链）', grantSkill, { employee: z3Id, skillName: 'TypeScript' });
applyStep('授予李四 TypeScript（已存在 → 复用）', grantSkill, { employee: l4Id, skillName: 'TypeScript' });
applyStep('授予张三 Postgres', grantSkill, { employee: z3Id, skillName: 'Postgres' });
printState(['skill']);

// 5. 项目与载荷链接
const pj = applyStep('新建项目「数据平台」（struct 参数 Money）', createProject, {
  code: 'P-DATA', title: '数据平台', startsOn: '2026-09-01',
  budget: { amount: '2000000', currency: 'CNY' },
});
const pjId = pj.ok ? pj.result.projectId : '';
applyStep('分配张三为 lead（中间对象 Membership + 双 required 1:N）', assignToProject, {
  employee: z3Id, project: pjId, role: 'lead',
});
applyStep('分配李四（role 默认 contributor，joinedAt 动态默认）', assignToProject, {
  employee: l4Id, project: pjId,
});
applyStep('分配王五 role=boss（→ enum 校验失败）', assignToProject, {
  // 'boss' as any：模拟非 TS 客户端的线上调用——运行时校验是 API 契约，不只是编译期
  employee: w5Id, project: pjId, role: 'boss' as any,
});
printState(['membership']);

// 6. 调动：1:N 重挂
applyStep('王五 设计部 → 研发部（旧链自动摘除）', transferEmployee, { employee: w5Id, toDepartment: rdId });
printState(['department']);

// 7. 乐观锁
const z3Now = engine.table('employee').find((o) => o.id === z3Id)!;
const staleAt = z3Now.updatedAt as string; // 先快照旧值——对象引用是活的，不能直接留引用
await sleep(2); // 保证下一步 modify 产生新的毫秒戳
applyStep('张三调薪（expectedUpdatedAt 命中）', adjustSalary, {
  employee: z3Id, newSalary: '880000', expectedUpdatedAt: staleAt,
});
applyStep('张三再调薪（用过期的 expectedUpdatedAt → 冲突回滚）', adjustSalary, {
  employee: z3Id, newSalary: '990000', expectedUpdatedAt: staleAt,
});
printState(['employee']);

// 8. 删除语义
applyStep('张三离职（有 required 链接的 Membership 指向他 → 阻止删除）', offboardEmployee, { employee: z3Id });
applyStep('王五离职（无载荷链 → 删除成功，部门链接自动摘除）', offboardEmployee, { employee: w5Id });
printState(['employee', 'department']);

// 9. 只读查询函数
console.log(`\n${B(`[${++step}] 查询函数`)}  ${D('runQuery(department-roster / project-team)')}`);
const roster = engine.runQuery(departmentRoster, { department: rdId });
console.log(`    研发部花名册: ${JSON.stringify(roster)}`);
const team = engine.runQuery(projectTeam, { project: pjId });
console.log(`    数据平台项目组: ${JSON.stringify(team)}`);

// 10. 审计日志
console.log(B('\n═══ 审计日志（已提交动作，只追加）═══'));
for (const a of engine.auditLog) {
  console.log(D(`  ${a.at}  ${a.action}  edits=${a.edits.length}  tx=${short(a.txId)}  expectedUpdatedAt=${a.usedExpectedUpdatedAt}`));
}
console.log(D(`\n回滚的失败动作不落审计（共 ${applyCount - engine.auditLog.length} 次失败未入列）。`));
