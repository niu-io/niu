---
title: Release qualification
description: The scope and evidence required for Niu's first complete release.
---

<div data-lang="en">

Niu is available for development and evaluation. **The first complete release
remains under qualification.** A published version, successful build or closed
implementation issue does not establish that every workflow is ready for
production.

The maintained [engineering release checklist](https://github.com/niu-io/niu/blob/main/docs/releases/first-release.md)
records the detailed requirements and bounded evidence. This page explains how
to interpret that checklist; it does not certify a particular hosted deployment.

## What release qualification covers

| Area | Required evidence |
| --- | --- |
| Setup and access | A clean installation, usable Provider configuration, independent credentials, workspace keys and backend-enforced isolation. |
| Model delivery | Actual supported model requests, streaming, cancellation and diagnosable upstream failures. Model discovery alone is insufficient. |
| Customer accounting | The request's pinned selling price, reservations, exact charges, refunds and reconciliation, with unknown liabilities retained. |
| Commercial operations | Customer funds, noncash credits, Provider earnings and settlements remain distinct. Purchase prices and platform margins stay confidential. |
| Multimodal workflows | Saved Chat and Video state, asynchronous job recovery, material management, authorized result retrieval and the applicable billing lifecycle. |
| Operations | Current-input recovery, upgrade and workload evidence for the exact artifact being evaluated, plus desktop and narrow-screen workflow review. |

## Integration capability and activation

Supporting a payment adapter or model API does not require activating every
external service. Qualification of the integration concerns its authorization,
persistence, protocol handling and safe failures. Merchant activation, receipt
of funds, commercial Provider agreements and verified discounts require their
own evidence; unavailable configuration must remain explicit.

Personal upstream credentials used for evaluation do not establish commercial
supply. Unknown usage or costs must remain unknown, rather than being displayed
 as zero or free. Customers see their selling prices and charges, not Provider
purchase costs or the operator's margins.

## Interpreting verification records

An acceptance record should identify the source or deployed artifact, the
actual current-input workflow, and independently inspected final artifacts.
Its conclusions apply only to the exercised scope. Fixture outcomes provide no
acceptance signal. Compilation and build checks are separate from runtime
behavior, financial settlement and performance qualification.

For your own evaluation, start with the [deployment guide](/docs/deployment/single-container/),
make a [model request](/docs/guides/api-quickstart/), and follow its
[request evidence](/docs/concepts/execution-observation/) and
[customer charge](/docs/concepts/performance-and-cost/).

</div>

<div data-lang="zh" data-title-zh="发布验收">

Niu 目前可供开发与评估使用。**首个完整版本仍处于发布验收阶段。** 已发布的版本号、构建成功或已关闭的实现 Issue，并不代表每个工作流都已具备生产就绪条件。

持续维护的[工程发布检查清单](https://github.com/niu-io/niu/blob/main/docs/releases/first-release.md)记录了详细要求与有界证据。本页说明如何解读该检查清单，并不对特定托管部署提供认证。

## 发布验收涵盖的范围

| 领域 | 所需证据 |
| --- | --- |
| 初始设置与访问控制 | 全新安装、可用的模型供应商配置、独立凭据、工作空间密钥以及后端强制执行的租户隔离。 |
| 模型调用交付 | 实际受支持的模型请求、流式传输、取消操作以及可诊断的上游故障。仅有模型发现是不够的。 |
| 客户账务核算 | 请求锁定的销售价格、预算预留、精确扣费、退款与对账，并保留未知负债状态。 |
| 商业运营 | 客户资金、非现金赠金、供应商收益与结算保持严格区分。采购价格与平台利润保持机密。 |
| 多模态工作流 | 已保存的对话（Chat）与视频（Video）状态、异步任务恢复、素材管理、授权结果获取以及适用的计费生命周期。 |
| 运维保障 | 针对所评估确切构建产物的当前输入恢复、升级与负载证据，以及桌面端与窄屏界面工作流审查。 |

## 集成能力与服务激活

支持某种支付适配器或模型 API 并不要求激活每一个外部服务。集成的验收关注其授权、持久化、协议处理与安全失败机制。商户激活、资金到账、商业供应商协议以及已验证的折扣需要各自独立的证据；未就绪的配置必须保持明确提示。

用于评估的个人上游凭据不构成商业供应。未知的用量或成本必须保持未知状态，而不能显示为零或免费。客户看到的是其销售价格与扣费金额，而非供应商采购成本或运营方利润。

## 解读验证记录

验收记录应明确标识源码或所部署的构建产物、实际的当前输入工作流，以及经过独立检查的最终产物。其结论仅适用于实际执行过的范围。测试夹具（Fixture）的结果不提供验收信号。编译与构建检查独立于运行时行为、财务结算与性能验收。

若要进行您自己的评估，请从[部署指南](/docs/deployment/single-container/)开始，发起一次[模型请求](/docs/guides/api-quickstart/)，并跟踪其[请求证据](/docs/concepts/execution-observation/)与[客户扣费](/docs/concepts/performance-and-cost/)。

</div>
