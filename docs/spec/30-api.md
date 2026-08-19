# API 面

> **范围**：REST 端点逐个（查询/单对象/动作/函数/introspection）、管理面七组、错误模型与状态码映射、OpenAPI 口径、CLI 映射。
> **不含**：引擎内部映射（40）；语义本体（10/20）。
> **素材**：[ADR-0008](../adr/0008-api-and-logic-interfaces.md)（#10 决议全文）；编码义务移交清单 ADR-0002/0003/0004/0005/0007。
> **待落位**：无。
> **验收线**：深规格（[#13](https://github.com/0xnicholas/heirloom-pro/issues/13) 决议：逐端点表、逐条规范性陈述、示例内嵌、总表归附录）

## 决议要点（ADR-0008 播要）

1. **REST 唯一**：GraphQL → v2；端点对任意本体不变；SDK 同源编译。
2. **六件套**：`POST /v1/objects/{type}/query`（JSON 体过滤/排序/游标/include）、`GET /v1/objects/{type}/{id}`、`POST /v1/{actions|functions}/{name}/invoke`（对称动词后缀）、`GET /v1/meta/ontology`、响应统一 `{data, nextCursor?}`（limit 100/1000）、静态 OpenAPI（逐本体生成 → v2）。
3. **错误四件**：统一信封；注册表归 90 附录；映射表——零行=200、403 双 code（白名单/PermissionDenied，均落安全日志）、404 名不存在与 GET miss、409 乐观锁与 unique、413 超批量、422 ValidationFailed（含 ref 注入 miss）与 push 三档拒绝专属码。
4. **管理面单伞**：`/v1/admin/*`——ontology push / ingest（服务账号例外）/ audit / security-log / subjects / groups / read-grants / action-grants / tokens（明文仅一次）；CLI 1:1。

（正文图外撰写；逐端点表按深规格验收线铺开）
