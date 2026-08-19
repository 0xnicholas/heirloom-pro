/**
 * ═══════════════════════════════════════════════════════════════════
 *  PROTOTYPE — 一次性反应物（票 #12 TS DSL 外形原型）。
 *  这不是引擎实现，只是让 DSL 样例「可运行」的最小内存内核：
 *  注册表 + 内存存储 + 五编辑操作 + 事务快照回滚。
 *  决策定稿后本目录整体进 throwaway 分支，不进 main。
 * ═══════════════════════════════════════════════════════════════════
 */

// ── 标量九类（ADR-0001 决策 2）────────────────────────────────────
// decimal / date / datetime 在 API 层的线上编码都是 JSON 字符串（ADR-0001）。
export type ScalarKind =
  | 'string' | 'boolean' | 'integer' | 'float'
  | 'decimal' | 'date' | 'datetime' | 'enum' | 'json';

/** 动态默认值函数拿到的上下文（ADR-0003 决策 2） */
export interface DefaultCtx {
  today: string; // ISO yyyy-mm-dd
  now: Date;
}

interface PropOpts {
  required?: boolean;
  unique?: boolean;
  isArray?: boolean;
  default?: unknown;
  displayName?: string;
  description?: string;
  enumValues?: readonly string[];
  structDef?: AnyStructDef;
  refTarget?: () => AnyObjectDef;
  range?: [number | undefined, number | undefined];
  length?: [number | undefined, number | undefined];
  regex?: RegExp;
}

// ── 属性构建器 ───────────────────────────────────────────────────
// 口味决策点：链式修饰符（zod/drizzle 风）vs 选项对象。
// 幻影三参：T=值类型，Req=是否 required，HasDef=是否有默认值（决定输入/解析两种形状）
export class PropBuilder<T, Req extends boolean = false, HasDef extends boolean = false> {
  declare readonly _t: T; // 幻影类型：承载 TS 推断，运行时无值
  declare readonly _req: Req;
  declare readonly _def: HasDef;

  constructor(
    public kind: ScalarKind | 'struct' | 'ref',
    public opts: PropOpts = {},
  ) {}

  /** 属性默认可选，required 显式声明（ADR-0001 决策 4） */
  required(): PropBuilder<T, true, HasDef> {
    this.opts.required = true;
    return this as unknown as PropBuilder<T, true, HasDef>;
  }
  /** 标量/enum 上 = 唯一约束（业务键）；数组上 = 集合语义 */
  unique(): this {
    this.opts.unique = true;
    return this;
  }
  /** 静态字面量，或 (ctx) => value 动态函数（动态默认归动作层/参数，ADR-0003 决策 2） */
  default(v: T | ((ctx: DefaultCtx) => T)): PropBuilder<T, Req, true> {
    this.opts.default = v;
    return this as unknown as PropBuilder<T, Req, true>;
  }
  range(min?: number, max?: number): this {
    this.opts.range = [min, max];
    return this;
  }
  length(min?: number, max?: number): this {
    this.opts.length = [min, max];
    return this;
  }
  regex(re: RegExp): this {
    this.opts.regex = re;
    return this;
  }
  /** 数组属性：scalar[] / enum[] / struct[]，默认保序可重复（ADR-0001 决策 3） */
  array(): PropBuilder<T[], Req, HasDef> {
    this.opts.isArray = true;
    return this as unknown as PropBuilder<T[], Req, HasDef>;
  }
  displayName(n: string): this {
    this.opts.displayName = n;
    return this;
  }
  description(d: string): this {
    this.opts.description = d;
    return this;
  }
}

/** 对象引用参数（仅动作/函数参数可用；属性里禁止引用——ADR-0001 决策 3） */
export class RefPropBuilder<
  O extends AnyObjectDef,
  Req extends boolean = false,
  HasDef extends boolean = false,
> extends PropBuilder<ObjInstanceOf<O>, Req, HasDef> {
  declare readonly _ref: O;
  override required(): RefPropBuilder<O, true, HasDef> {
    this.opts.required = true;
    return this as unknown as RefPropBuilder<O, true, HasDef>;
  }
}

/** struct 属性/参数（嵌入形状；写侧输入允许省略有默认值的键） */
export class StructPropBuilder<
  S extends AnyStructDef,
  Req extends boolean = false,
  HasDef extends boolean = false,
> extends PropBuilder<StructInstanceOf<S>, Req, HasDef> {
  declare readonly _struct: S;
  override required(): StructPropBuilder<S, true, HasDef> {
    this.opts.required = true;
    return this as unknown as StructPropBuilder<S, true, HasDef>;
  }
}

export const prop = {
  string: () => new PropBuilder<string>('string'),
  boolean: () => new PropBuilder<boolean>('boolean'),
  integer: () => new PropBuilder<number>('integer'), // ±2^53 JSON 安全区间
  float: () => new PropBuilder<number>('float'),
  decimal: () => new PropBuilder<string>('decimal'), // JSON 字符串编码
  date: () => new PropBuilder<string>('date'),
  datetime: () => new PropBuilder<string>('datetime'),
  json: () => new PropBuilder<unknown>('json'), // 逃生舱
  enum: <V extends string>(values: readonly V[]) =>
    new PropBuilder<V>('enum', { enumValues: values }),
  struct: <S extends AnyStructDef>(def: S) =>
    new StructPropBuilder<S>('struct', { structDef: def }),
  /** 对象引用：传 UUID，引擎在 execute 前预取并注入完整对象（ADR-0003 决策 2） */
  ref: <O extends AnyObjectDef>(target: () => O) =>
    new RefPropBuilder<O>('ref', { refTarget: target }),
};

// ── 形状推断 ─────────────────────────────────────────────────────
// 输入形状（创建输入 / apply 入参）：required 且无默认 = 必填
// 解析形状（实例 / execute 参数）：required 或有默认 = 必在场
export type AnyProp = PropBuilder<any, any, any>;
export type Props = Record<string, AnyProp>;
type PropValue<B> = B extends PropBuilder<infer T, any, any> ? T : never;
type RawProp<B> = B extends RefPropBuilder<any, any, any> ? string
  : B extends StructPropBuilder<infer S, any, any> ? InferInput<S['properties']>
  : PropValue<B>;
type IsReq<B> = B extends PropBuilder<any, true, any> ? true : false;
type HasDef<B> = B extends PropBuilder<any, any, true> ? true : false;

/** 输入形状：ref 传 UUID 字符串；有默认的键可省略 */
export type InferInput<P extends Props> =
  & { [K in keyof P as IsReq<P[K]> extends true ? (HasDef<P[K]> extends true ? never : K) : never]: RawProp<P[K]> }
  & { [K in keyof P as IsReq<P[K]> extends true ? (HasDef<P[K]> extends true ? K : never) : K]?: RawProp<P[K]> };

/** 解析形状：默认值填充后，required 或有默认的键必在场 */
export type InferShape<P extends Props> =
  & { [K in keyof P as IsReq<P[K]> extends true ? K : (HasDef<P[K]> extends true ? K : never)]: PropValue<P[K]> }
  & { [K in keyof P as IsReq<P[K]> extends true ? never : (HasDef<P[K]> extends true ? never : K)]?: PropValue<P[K]> };

// ── 类型定义 ─────────────────────────────────────────────────────
export interface StructDef<P extends Props = Props> {
  kind: 'struct';
  apiName: string;
  displayName?: string;
  description?: string;
  properties: P;
}
type AnyStructDef = StructDef<any>;

export interface ObjectTypeDef<P extends Props = Props, L extends Links = Links> {
  kind: 'object';
  apiName: string;
  displayName?: string;
  description?: string;
  properties: P;
  links: L;
}
type AnyObjectDef = ObjectTypeDef<any, any>;

export type StructInstanceOf<S> = S extends StructDef<infer P> ? InferShape<P> : never;
export type ObjInstanceOf<O> = O extends ObjectTypeDef<infer P, any>
  ? InferShape<P> & { id: string; createdAt: string; updatedAt: string }
  : never;

// ── 链接（一等声明，独立于属性——ADR-0001 决策 5）────────────────
// 口味决策点：基数从声明方视角命名，四个助手对应三档基数的四个落座方向。
export interface LinkDef<O extends AnyObjectDef = AnyObjectDef> {
  cardinality: '1:1' | '1:N' | 'M:N';
  declaringSide: 'one' | 'many'; // oneToOne 两侧都是 one
  target: () => O;
  reverse?: string; // 反向名；省略时派生 = 声明方 apiName 原样（#12 决议；冲突须显式）
  required?: boolean; // 写事务校验（ADR-0001 决策 5）
  displayName?: string;
  description?: string;
}
type Links = Record<string, LinkDef<any>>;
export type LinkTarget<L> = L extends LinkDef<infer O> ? O : never;

export const link = {
  oneToOne: <O extends AnyObjectDef>(target: () => O, o: Partial<LinkDef<O>> = {}) =>
    ({ cardinality: '1:1', declaringSide: 'one', target: () => target(), ...o }) as LinkDef<O>,
  oneToMany: <O extends AnyObjectDef>(target: () => O, o: Partial<LinkDef<O>> = {}) =>
    ({ cardinality: '1:N', declaringSide: 'one', target: () => target(), ...o }) as LinkDef<O>,
  manyToOne: <O extends AnyObjectDef>(target: () => O, o: Partial<LinkDef<O>> = {}) =>
    ({ cardinality: '1:N', declaringSide: 'many', target: () => target(), ...o }) as LinkDef<O>,
  manyToMany: <O extends AnyObjectDef>(target: () => O, o: Partial<LinkDef<O>> = {}) =>
    ({ cardinality: 'M:N', declaringSide: 'many', target: () => target(), ...o }) as LinkDef<O>,
};

// ── 动作（ADR-0003）───────────────────────────────────────────────
export interface ActionDef<P extends Props = Props, R = unknown> {
  kind: 'action';
  apiName: string;
  displayName?: string;
  description?: string;
  params: P;
  execute: (ctx: ActionCtx, params: InferShape<P>) => R;
}
type AnyActionDef = ActionDef<any, any>;

/** 只读注册函数——v1 逻辑支柱接口位（ADR-0003 决策 7；调用桥 → v2） */
export interface QueryFnDef<P extends Props = Props, R = unknown> {
  kind: 'queryFn';
  apiName: string;
  displayName?: string;
  description?: string;
  params: P;
  execute: (q: QueryCtx, params: InferShape<P>) => R;
}
type AnyQueryFnDef = QueryFnDef<any, any>;

// ── 事务上下文（活事务：RYW、可引用本事务新建——ADR-0003 决策 5）───
export interface ActionCtx {
  today: string;
  now: Date;
  create<P extends Props>(def: ObjectTypeDef<P, any>, input: InferInput<P>): ObjInstanceOf<ObjectTypeDef<P, any>>;
  modify<P extends Props>(
    def: ObjectTypeDef<P, any>,
    obj: ObjInstanceOf<ObjectTypeDef<P, any>>,
    patch: Partial<InferInput<P>>,
    opts?: { expectedUpdatedAt?: string }, // 乐观锁（ADR-0003 决策 8）
  ): ObjInstanceOf<ObjectTypeDef<P, any>>;
  delete(obj: { id: string }): void;
  link<P extends Props, L extends Links, K extends keyof L & string>(
    def: ObjectTypeDef<P, L>,
    from: ObjInstanceOf<ObjectTypeDef<P, L>>,
    name: K,
    to: ObjInstanceOf<LinkTarget<L[K]>>,
  ): void;
  unlink<P extends Props, L extends Links, K extends keyof L & string>(
    def: ObjectTypeDef<P, L>,
    from: ObjInstanceOf<ObjectTypeDef<P, L>>,
    name: K,
    to: ObjInstanceOf<LinkTarget<L[K]>>,
  ): void;
  get<P extends Props>(def: ObjectTypeDef<P, any>, id: string): ObjInstanceOf<ObjectTypeDef<P, any>> | undefined;
  all<P extends Props>(def: ObjectTypeDef<P, any>): ObjInstanceOf<ObjectTypeDef<P, any>>[];
  linked<P extends Props, L extends Links, K extends keyof L & string>(
    def: ObjectTypeDef<P, L>,
    from: ObjInstanceOf<ObjectTypeDef<P, L>>,
    name: K,
  ): ObjInstanceOf<LinkTarget<L[K]>>[];
  /** 反向遍历：按反向名找声明方实例。弱类型——原型简化 */
  backlinks<P extends Props>(def: ObjectTypeDef<P, any>, obj: ObjInstanceOf<ObjectTypeDef<P, any>>, reverseName: string): any[];
}
export type QueryCtx = Pick<ActionCtx, 'today' | 'now' | 'get' | 'all' | 'linked' | 'backlinks'>;

// ── 结构化异常 ────────────────────────────────────────────────────
/** 校验失败：逐字段消息（ADR-0003 决策 3） */
export class ValidationFailed extends Error {
  constructor(public fields: Record<string, string>) {
    super(`ValidationFailed: ${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('; ')}`);
  }
}
/** 乐观锁冲突（ADR-0003 决策 8） */
export class ConflictError extends Error {}
/** 引擎层错误（唯一约束、required 链接、基数等） */
export class EngineError extends Error {}

// ── 注册表 ────────────────────────────────────────────────────────
export const registry = {
  structs: [] as AnyStructDef[],
  objectTypes: [] as AnyObjectDef[],
  actions: [] as AnyActionDef[],
  queryFns: [] as AnyQueryFnDef[],
};

export function structType<P extends Props>(def: Omit<StructDef<P>, 'kind'>): StructDef<P> {
  const d = { kind: 'struct' as const, ...def };
  registry.structs.push(d);
  return d;
}
export function objectType<P extends Props, L extends Links>(
  def: Omit<ObjectTypeDef<P, L>, 'kind'>,
): ObjectTypeDef<P, L> {
  const d = { kind: 'object' as const, ...def };
  registry.objectTypes.push(d);
  return d;
}
export function action<P extends Props, R>(
  def: Omit<ActionDef<P, R>, 'kind'>,
): ActionDef<P, R> {
  const d = { kind: 'action' as const, ...def };
  registry.actions.push(d as AnyActionDef);
  return d;
}
export function queryFn<P extends Props, R>(
  def: Omit<QueryFnDef<P, R>, 'kind'>,
): QueryFnDef<P, R> {
  const d = { kind: 'queryFn' as const, ...def };
  registry.queryFns.push(d as AnyQueryFnDef);
  return d;
}

// ── 内存引擎（throwaway：让样例可运行，仅此而已）──────────────────
export interface Edit {
  op: 'create' | 'modify' | 'delete' | 'link' | 'unlink';
  type: string;
  id: string;
  detail?: string;
}
export interface AuditRow {
  action: string;
  at: string;
  params: Record<string, unknown>;
  edits: Edit[];
  txId: string;
  durationMs: number;
  usedExpectedUpdatedAt: boolean;
}
export type ApplyResult<R> =
  | { ok: true; result: R; edits: Edit[]; audit: AuditRow }
  | { ok: false; error: ValidationFailed | ConflictError | EngineError };

interface LinkMeta {
  declaringType: string;
  name: string;
  def: LinkDef<any>;
  reverseName: string;
}

export class Engine {
  private types = new Map<string, AnyObjectDef>();
  private data = new Map<string, Map<string, Record<string, any>>>();
  private linkStore = new Map<string, Map<string, Set<string>>>(); // `${type}.${link}` -> fromId -> toIds
  private linkMeta: LinkMeta[] = [];
  private edits: Edit[] = [];
  private touched = new Set<string>(); // 本事务触及的对象 id（required 链接提交校验范围）
  auditLog: AuditRow[] = [];

  constructor() {
    for (const t of registry.objectTypes) {
      this.types.set(t.apiName, t);
      this.data.set(t.apiName, new Map());
      for (const [name, def] of Object.entries(t.links as Links)) {
        // #12 决议：省略 → 派生为声明方 apiName 原样；目标侧派生名冲突 → 拒绝注册（须显式）
        const reverseName = def.reverse ?? t.apiName;
        const target = def.target().apiName as string;
        const collide = this.linkMeta.some(
          (m) => m.def.target().apiName === target && m.reverseName === reverseName && m.name !== name,
        );
        if (collide) {
          throw new Error(
            `reverse '${reverseName}' on '${target}' 冲突：${t.apiName}.${name} 须显式 reverse（#12 派生规则）`,
          );
        }
        this.linkMeta.push({ declaringType: t.apiName, name, def, reverseName });
      }
    }
  }

  // —— 存储工具 ——
  private key(type: string, link: string) {
    return `${type}.${link}`;
  }
  private linkSet(type: string, link: string, fromId: string): Set<string> {
    const k = this.key(type, link);
    if (!this.linkStore.has(k)) this.linkStore.set(k, new Map());
    const m = this.linkStore.get(k)!;
    if (!m.has(fromId)) m.set(fromId, new Set());
    return m.get(fromId)!;
  }
  private tableOf(type: string): Map<string, Record<string, any>> {
    const t = this.data.get(type);
    if (!t) throw new EngineError(`未知类型 ${type}`);
    return t;
  }
  private typeOfId(id: string): string | undefined {
    for (const [apiName, table] of this.data) if (table.has(id)) return apiName;
    return undefined;
  }

  // —— 约束校验 ——
  private validateValue(path: string, b: AnyProp, v: any, errors: Record<string, string>) {
    if (v == null) {
      if (b.opts.required) errors[path] = '必填';
      return;
    }
    const items: any[] = b.opts.isArray ? (Array.isArray(v) ? v : [v]) : [v];
    if (b.opts.isArray && !Array.isArray(v)) {
      errors[path] = '应为数组';
      return;
    }
    for (const item of items) {
      switch (b.kind) {
        case 'integer':
          if (!Number.isInteger(item)) errors[path] = '应为整数';
          break;
        case 'float':
          if (typeof item !== 'number') errors[path] = '应为数字';
          break;
        case 'boolean':
          if (typeof item !== 'boolean') errors[path] = '应为布尔';
          break;
        case 'decimal':
          if (typeof item !== 'string' || Number.isNaN(Number(item))) errors[path] = 'decimal 应为 JSON 字符串编码';
          break;
        case 'enum':
          if (!b.opts.enumValues!.includes(item)) errors[path] = `应为 ${b.opts.enumValues!.join(' | ')}`;
          break;
        case 'struct': {
          const sd = b.opts.structDef!;
          for (const [sk, sb] of Object.entries(sd.properties as Props)) {
            this.validateValue(path === '' ? sk : `${path}.${sk}`, sb, item?.[sk], errors);
          }
          break;
        }
        default:
          if (typeof item !== 'string') errors[path] = `应为 ${b.kind}`;
      }
      if (b.opts.range && item != null && typeof item !== 'object') {
        const n = b.kind === 'decimal' ? Number(item) : item;
        const [min, max] = b.opts.range;
        if (min !== undefined && n < min) errors[path] = `应 ≥ ${min}`;
        if (max !== undefined && n > max) errors[path] = `应 ≤ ${max}`;
      }
      if (b.opts.length && typeof item === 'string') {
        const [min, max] = b.opts.length;
        if (min !== undefined && item.length < min) errors[path] = `长度应 ≥ ${min}`;
        if (max !== undefined && item.length > max) errors[path] = `长度应 ≤ ${max}`;
      }
      if (b.opts.regex && typeof item === 'string' && !b.opts.regex.test(item)) {
        errors[path] = `不匹配 ${b.opts.regex}`;
      }
    }
  }

  private resolveDefault(b: AnyProp, dctx: DefaultCtx) {
    const d = b.opts.default;
    return typeof d === 'function' ? (d as (c: DefaultCtx) => unknown)(dctx) : d;
  }

  private checkUnique(type: string, propName: string, b: AnyProp, v: any, selfId?: string) {
    if (!b.opts.unique || b.opts.isArray || v == null) return;
    for (const [id, obj] of this.tableOf(type)) {
      if (id !== selfId && obj[propName] === v) {
        throw new EngineError(`唯一约束冲突：${type}.${propName} = ${JSON.stringify(v)}`);
      }
    }
  }

  // —— 事务上下文 ——
  private makeCtx(dctx: DefaultCtx): ActionCtx {
    const engine = this;
    return {
      today: dctx.today,
      now: dctx.now,

      create(def, input) {
        const id = crypto.randomUUID(); // 原型用 v4；v1 规格为 UUIDv7 应用层生成（ADR-0002）
        const errors: Record<string, string> = {};
        const obj: Record<string, any> = { id };
        for (const [name, b] of Object.entries(def.properties as Props)) {
          let v = (input as any)[name] ?? engine.resolveDefault(b, dctx);
          if (v != null && b.opts.isArray && b.opts.unique) v = [...new Set(v as any[])]; // 集合语义
          engine.validateValue(name, b, v, errors);
          if (v !== undefined) obj[name] = v;
        }
        if (Object.keys(errors).length) throw new ValidationFailed(errors);
        for (const [name, b] of Object.entries(def.properties as Props)) {
          engine.checkUnique(def.apiName, name, b, obj[name]);
        }
        const now = dctx.now.toISOString();
        obj.createdAt = now;
        obj.updatedAt = now;
        engine.tableOf(def.apiName).set(id, obj);
        engine.touched.add(id);
        engine.edits.push({ op: 'create', type: def.apiName, id, detail: JSON.stringify(input) });
        return obj as never;
      },

      modify(def, obj, patch, opts) {
        const stored = engine.tableOf(def.apiName).get(obj.id);
        if (!stored) throw new EngineError(`对象不存在：${obj.id}`);
        if (opts?.expectedUpdatedAt !== undefined && stored.updatedAt !== opts.expectedUpdatedAt) {
          throw new ConflictError(`expectedUpdatedAt 未命中：期望 ${opts.expectedUpdatedAt}，实际 ${stored.updatedAt}`);
        }
        const errors: Record<string, string> = {};
        for (const [name, v] of Object.entries(patch)) {
          const b = def.properties[name];
          if (!b) continue;
          let val = v;
          if (val != null && b.opts.isArray && b.opts.unique) val = [...new Set(val as any[])];
          engine.validateValue(name, b, val, errors);
          engine.checkUnique(def.apiName, name, b, val, obj.id);
          if (val === undefined) delete stored[name];
          else stored[name] = val;
        }
        if (Object.keys(errors).length) throw new ValidationFailed(errors);
        stored.updatedAt = dctx.now.toISOString();
        engine.touched.add(obj.id);
        engine.edits.push({
          op: 'modify',
          type: def.apiName,
          id: obj.id,
          detail: Object.keys(patch).join(', ') + (opts?.expectedUpdatedAt ? ' (expectedUpdatedAt)' : ''),
        });
        return stored as never;
      },

      delete(obj) {
        const type = engine.typeOfId(obj.id);
        if (!type) throw new EngineError(`对象不存在：${obj.id}`);
        // 入向链接：required 阻止删除，optional 自动摘链（ADR-0002）
        for (const meta of engine.linkMeta) {
          const store = engine.linkStore.get(engine.key(meta.declaringType, meta.name));
          if (!store) continue;
          for (const [fromId, set] of store) {
            if (set.has(obj.id)) {
              if (meta.def.required) {
                throw new EngineError(
                  `删除被阻止：${meta.declaringType}.${meta.name} 是 required 链接（${fromId.slice(0, 8)}… 仍指向它）`,
                );
              }
              set.delete(obj.id);
              engine.edits.push({ op: 'unlink', type: meta.declaringType, id: fromId, detail: `${meta.name} -/-> ${obj.id.slice(0, 8)}…（自动摘链）` });
              engine.touched.add(fromId);
            }
          }
        }
        // 出向链接随对象消失
        for (const meta of engine.linkMeta.filter((m) => m.declaringType === type)) {
          engine.linkStore.get(engine.key(type, meta.name))?.delete(obj.id);
        }
        engine.tableOf(type).delete(obj.id);
        engine.touched.delete(obj.id);
        engine.edits.push({ op: 'delete', type, id: obj.id });
      },

      link(def, from, name, to) {
        const meta = engine.linkMeta.find((m) => m.declaringType === def.apiName && m.name === name)!;
        const set = engine.linkSet(def.apiName, name, from.id);
        if (meta.def.cardinality === '1:1' || meta.def.declaringSide === 'many' && meta.def.cardinality === '1:N') {
          set.clear(); // 单端：替换
          set.add(to.id);
        } else {
          set.add(to.id);
        }
        if (meta.def.cardinality !== 'M:N') {
          // to 端为 "many" 时，to 从其他 from 的集合里摘除（1:N 重挂）
          if (meta.def.declaringSide === 'one' && meta.def.cardinality === '1:N') {
            const store = engine.linkStore.get(engine.key(def.apiName, name))!;
            for (const [otherFrom, otherSet] of store) {
              if (otherFrom !== from.id && otherSet.delete(to.id)) {
                engine.edits.push({ op: 'unlink', type: def.apiName, id: otherFrom, detail: `${name} -/-> ${to.id.slice(0, 8)}…（重挂）` });
              }
            }
          }
          if (meta.def.cardinality === '1:1') {
            const store = engine.linkStore.get(engine.key(def.apiName, name))!;
            for (const [otherFrom, otherSet] of store) {
              if (otherFrom !== from.id && otherSet.delete(to.id)) {
                engine.edits.push({ op: 'unlink', type: def.apiName, id: otherFrom, detail: `${name} -/-> ${to.id.slice(0, 8)}…（1:1 唯一）` });
              }
            }
          }
        }
        engine.touched.add(from.id);
        engine.edits.push({ op: 'link', type: def.apiName, id: from.id, detail: `${name} -> ${to.id.slice(0, 8)}…` });
      },

      unlink(def, from, name, to) {
        engine.linkSet(def.apiName, name, from.id).delete(to.id);
        engine.touched.add(from.id);
        engine.edits.push({ op: 'unlink', type: def.apiName, id: from.id, detail: `${name} -/-> ${to.id.slice(0, 8)}…` });
      },

      get(def, id) {
        return engine.tableOf(def.apiName).get(id) as never;
      },
      all(def) {
        return [...engine.tableOf(def.apiName).values()] as never;
      },
      linked(def, from, name) {
        const meta = engine.linkMeta.find((m) => m.declaringType === def.apiName && m.name === name)!;
        const ids = [...engine.linkSet(def.apiName, name, from.id)];
        const targetType = meta.def.target().apiName;
        return ids.map((id) => engine.tableOf(targetType).get(id)).filter(Boolean) as never;
      },
      backlinks(def, obj, reverseName) {
        const out: any[] = [];
        for (const meta of engine.linkMeta) {
          if (meta.reverseName !== reverseName) continue;
          if (meta.def.target().apiName !== def.apiName) continue;
          const store = engine.linkStore.get(engine.key(meta.declaringType, meta.name));
          if (!store) continue;
          for (const [fromId, set] of store) {
            if (set.has(obj.id)) out.push(engine.tableOf(meta.declaringType).get(fromId));
          }
        }
        return out.filter(Boolean);
      },
    };
  }

  // —— 参数解析（ref 预取注入、默认值填充、校验）——
  private resolveParams(defs: Props, raw: Record<string, any>, dctx: DefaultCtx): Record<string, any> {
    const errors: Record<string, string> = {};
    const out: Record<string, any> = {};
    for (const [name, b] of Object.entries(defs)) {
      let v = raw[name] ?? this.resolveDefault(b, dctx);
      if (v == null) {
        if (b.opts.required) errors[name] = '必填';
        continue;
      }
      if (b instanceof RefPropBuilder) {
        const target = b.opts.refTarget!();
        const found = this.tableOf(target.apiName).get(v);
        if (!found) {
          errors[name] = `引用的 ${target.apiName} 不存在：${String(v).slice(0, 13)}…`;
          continue;
        }
        v = found; // 预取注入完整对象（ADR-0003 决策 2）
      } else {
        this.validateValue(name, b, v, errors);
      }
      out[name] = v;
    }
    if (Object.keys(errors).length) throw new ValidationFailed(errors);
    return out;
  }

  /** 应用动作：单请求单动作，正常返回即 COMMIT，抛错即 ROLLBACK（ADR-0003 决策 5） */
  apply<P extends Props, R>(def: ActionDef<P, R>, rawParams: InferInput<P>): ApplyResult<Awaited<R>> {
    const dctx: DefaultCtx = { today: new Date().toISOString().slice(0, 10), now: new Date() };
    const started = Date.now();
    const snapshot = {
      data: structuredClone([...this.data]),
      links: structuredClone([...this.linkStore]),
    };
    this.edits = [];
    this.touched = new Set();
    const rollback = () => {
      this.data = new Map(snapshot.data as any);
      this.linkStore = new Map(snapshot.links as any);
    };
    try {
      const params = this.resolveParams(def.params, rawParams as Record<string, any>, dctx);
      const ctx = this.makeCtx(dctx);
      const result = def.execute(ctx, params as never);
      // required 链接写事务校验（ADR-0001 决策 5）：本事务触及的对象
      for (const id of this.touched) {
        const type = this.typeOfId(id);
        if (!type) continue;
        const t = this.types.get(type)!;
        for (const [name, ldef] of Object.entries(t.links as Links)) {
          if (ldef.required && this.linkSet(type, name, id).size === 0) {
            throw new EngineError(`required 链接缺失：${type}.${name}（对象 ${id.slice(0, 8)}…）`);
          }
        }
      }
      const audit: AuditRow = {
        action: def.apiName,
        at: dctx.now.toISOString(),
        params: redactRefs(rawParams as Record<string, any>),
        edits: this.edits,
        txId: crypto.randomUUID(),
        durationMs: Date.now() - started,
        usedExpectedUpdatedAt: this.edits.some((e) => e.detail?.includes('expectedUpdatedAt')),
      };
      this.auditLog.push(audit); // 审计 = 已提交动作只追加记录（ADR-0003 决策 9）
      return { ok: true, result: result as never, edits: this.edits, audit };
    } catch (e) {
      rollback();
      if (e instanceof ValidationFailed || e instanceof ConflictError || e instanceof EngineError) {
        return { ok: false, error: e };
      }
      throw e;
    }
  }

  /** 调用只读注册函数（v1 接口位；动作↔函数调用桥 → v2） */
  runQuery<P extends Props, R>(def: QueryFnDef<P, R>, rawParams: InferInput<P>): R {
    const dctx: DefaultCtx = { today: new Date().toISOString().slice(0, 10), now: new Date() };
    const params = this.resolveParams(def.params, rawParams as Record<string, any>, dctx);
    const ctx = this.makeCtx(dctx);
    const q: QueryCtx = {
      today: ctx.today, now: ctx.now,
      get: ctx.get, all: ctx.all, linked: ctx.linked, backlinks: ctx.backlinks,
    };
    return def.execute(q, params as never) as never;
  }

  // —— 原型展示用只读访问 ——
  table(apiName: string): Record<string, any>[] {
    return [...this.tableOf(apiName).values()];
  }
  linkEntries(): { from: string; link: LinkMeta; toIds: string[] }[] {
    const out: { from: string; link: LinkMeta; toIds: string[] }[] = [];
    for (const meta of this.linkMeta) {
      const store = this.linkStore.get(this.key(meta.declaringType, meta.name));
      if (!store) continue;
      for (const [fromId, set] of store) {
        if (set.size) out.push({ from: fromId, link: meta, toIds: [...set] });
      }
    }
    return out;
  }
  linkMetaAll(): LinkMeta[] {
    return this.linkMeta;
  }
}

function redactRefs(params: Record<string, any>): Record<string, unknown> {
  // 审计原样记录入参（ADR-0003 决策 9：v1 不脱敏，已知限制）；ref 注入前是 id 字符串
  return structuredClone(params);
}
