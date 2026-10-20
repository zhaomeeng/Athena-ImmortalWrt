# 自动更新构建来源，手动编译固件

更新日期：2026-10-21（Asia/Shanghai）。用户已明确采用本模式，替代先前“更新后自动编译候选固件”的建议。

## 两个独立入口

| 工作流 | 触发方式 | 执行内容 |
| --- | --- | --- |
| [Athena Update Sources](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/workflows/SOURCE-UPDATE.yml) | 每天北京时间 11:20；也可手动运行 | 读取上游发布元数据，更新源码/feed 版本锁与来源记录 |
| [Athena Build Firmware](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/workflows/ATHENA.yml) | 仅手动 Run workflow | 先 `preview=true` 做真实配置/恢复预检，再以相同锁运行 `preview=false` 正式编译和发布 |

更新工作流没有 make、defconfig、编译工作流调用或 Release 发布步骤。编译工作流没有 push、schedule、workflow_run 或 repository_dispatch 触发器。只有用户需要新固件并手动发起时才编译。

## 自动更新如何选择版本

策略集中在 [Config/UPSTREAM-SOURCE.json](../Config/UPSTREAM-SOURCE.json)，实现为 [Scripts/Athena-sources.mjs](../Scripts/Athena-sources.mjs)，仅使用 Node.js 标准库。

1. 查询 `VIKINGYFY/OpenWRT-CI` 的 Releases，筛选非草稿、非 prerelease 的 `IPQ60XX-WIFI-YES-VIKINGYFY-*` 平台发布；分页寻找对应平台，按发布时间选择最新记录。
2. 要求发布包含非空配置、RE-CS-02 Factory 和 Sysupgrade 资产。从来源字段读取唯一的源码仓库、分支和完整 SHA；不使用属于编译框架仓库的 `target_commitish` 代替源码提交。
3. 验证源码为 `VIKINGYFY/immortalwrt`、分支符合 `owrt` 白名单、提交存在且属于该分支。相同分支拒绝源码回退和分叉；已记录的发布时间也不能倒退。
4. 如果锁定的源码和分支没有变化，保留已有 feed 锁，避免重复发布或每日依赖漂移。已有版本元数据时直接校对 README；缺失时仅从原锁定提交补齐版本，不刷新 feed。
5. 从固定源码提交读取 `feeds.conf.default`。按允许的 GitHub 仓库解析每个启用的 git feed，固定其声明分支/提交或默认 HEAD。未知源类型、未知 feed、地址变化、重复声明和无法解析的提交均停止更新。
6. 从同一个固定源码提交读取 qualcommax/IPQ60xx 的内核选择、`target/linux/generic/kernel-*` 的补丁版本及 `include/version.mk` 的 ImmortalWrt 默认版本。只解析文本，不运行上游脚本；不能可靠解析时停止，不猜测版本。SNAPSHOT 如实标注为开发版本，不能将发布日期当作 ImmortalWrt 正式版本号。
7. 所有请求和检查成功后，写入 `build.lock.tsv` 的 source/feed 条目、`sources/upstream.json` 及 README 自动版本区块；原 package/binary 锁逐项保留。来源记录包含上游 Release、源码和 feed 提交、解析时间、锁摘要、版本及其文件来源和更新时的框架提交。版本表对应待编译源码，不代表已发布或运行中的固件。
8. GitHub bot 仅允许提交 `build.lock.tsv`、`sources/upstream.json`、`README.md` 三个文件；README 只替换唯一的 `ATHENA-SOURCE-VERSIONS` 标记区块，保留其余内容，标记缺失或重复时停止。使用普通 push，遇到并发更新造成非快进时失败停止，不强推、不覆盖用户改动。无变化不提交。

本仓库保存编译配置和版本锁，完整源码在手动编译时由 GitHub runner 拉取。更新任务不会把整个上游源码镜像进本仓库。

## main → owrt 的首次来源更新

已发布双代理镜像采用旧 `main` 提交 `0fb9b10cb9df51fb076470e1dd93d1c30dd89d83`。实现保留对这个确切旧来源的识别，允许首次更新到当前白名单内的 `owrt` 平台发布；其他分支变化需修改策略并审查。

截至实施时，对应上游为 [IPQ60XX-WIFI-YES-VIKINGYFY-owrt-26.10.19-07.29.05](https://github.com/VIKINGYFY/OpenWRT-CI/releases/tag/IPQ60XX-WIFI-YES-VIKINGYFY-owrt-26.10.19-07.29.05)，源码 `2e285cda3da4680a2b7e5c798df037b4fdaa6fc1`。其 feed 定义增加了 `pon_drivers` 和 `pon_userspace`，策略明确允许并锁定这两项。

首次自动更新只表示元数据与锁完整性验证通过，不表示 `owrt` 已通过固件编译或真机验收。现有作者设备配置、GENERAL、Handles/Settings、NSS/无线/DTS/驱动以及定制应用不由更新任务改写。框架和新源码的兼容性留到用户手动预检时验证；遇到失败应先排查，不自动修补底层绕过。

## 手动编译时的保护

- 从该次 workflow 固定的 Git 提交读取锁和来源记录；记录摘要或源码信息与锁不符时拒绝继续。
- 编译框架从锁读取源码仓库/分支，不再将 `main` 硬编码到构建参数。
- feeds 更新前要求每个启用的 feed 与锁一一匹配，并写为固定 SHA；缺项、多项和地址不符都会停止，避免新 feed 未锁定就被拉取。
- source/feed 策略、来源记录、配置和脚本均加入检查点输入指纹，禁止跨版本恢复。
- 保留真实 defconfig、作者受保护配置对比、必需应用检查、无有效 Rust host 依赖检查和实际镜像验证；保持原分阶段编译及时间/空间保护。
- 构建时保存 `source-policy.json` 和 `upstream-source.json`，与最终配置、镜像及 SHA256SUMS 一起交付。

编译/镜像通过仍不替代真机的 80/160MHz、NSS、长时间运行、两套代理分别运行及 Docker 测试。

## 手动检查和异常恢复

打开 Update Sources，默认 `dry_run=true` 只生成报告；选择 false 才提交来源更新。报告和建议锁在该次 Actions 的 `athena-source-update-*` artifact 中，保留 14 天。没有更新时不会制造时间戳提交。

出现网络、来源、分支或 feed 校验失败时，任务失败且不提交更新；修正问题后可手动重跑检查。遇到 GitHub 分支保护禁止 bot 写入时，任务会报告 push 错误，需要按仓库实际规则处理。

仓库于 2026-10-21 改为 Private，Actions 与来源更新工作流仍启用，cron 保持北京时间每日 11:20。私有化后手动执行同一更新工作流 [39459455766](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/runs/39459455766) 成功，验证了私有仓库 checkout、上游读取、版本检查和报告上传；当前无变化，提交步骤跳过。未来定时触发需等下一个计划窗口确认，本次手动验证不能替代未来的定时触发证据。

GitHub 定时任务可能延迟，因此保留手动入口，无需本地程序常驻。私有仓库的 GitHub-hosted runner 使用账户免费分钟及存储额度，超额计费或预算限制可能影响执行；固件编译仍仅手动触发。依据：[GitHub schedule 文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)、[GitHub Actions 计费说明](https://docs.github.com/en/billing/concepts/product-billing/github-actions)。
