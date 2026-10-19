# 跟随上游发布更新与自动编译方案

分析日期：2026-10-19（Asia/Shanghai）。本文件是可行性分析和实施建议，当前没有启用定时检查、自动改锁或自动编译流程。

## 结论

可以实现“发现适用于雅典娜的新上游发布 → 更新一组可追溯的版本锁 → 预检 → 编译并发布候选固件”。需要沿用作者对应平台的适配，并持续保留本项目的应用 overlay。

推荐先自动生成候选版，由用户完成设备测试后再作为日常版本。编译成功不能证明 Wi-Fi 160MHz、NSS 加速或代理/Docker 共存的运行表现。

## 当前事实与迁移前提

| 项目 | 已核对的情况 |
| --- | --- |
| 本项目已发布源码 | `VIKINGYFY/immortalwrt`，`main`，`0fb9b10cb9df51fb076470e1dd93d1c30dd89d83` |
| 本项目构建入口 | 手动触发 `ATHENA.yml`，分别运行 preview 和正式构建；另有编辑该入口文件时的预检触发 |
| 版本固定方式 | `build.lock.tsv` 固定源码、feeds、插件和 Mihomo；只重复运行 workflow 不会自动追上新版本 |
| 最新对应上游发布 | [IPQ60XX-WIFI-YES-VIKINGYFY-owrt-26.10.19-07.29.05](https://github.com/VIKINGYFY/OpenWRT-CI/releases/tag/IPQ60XX-WIFI-YES-VIKINGYFY-owrt-26.10.19-07.29.05) |
| 该发布记录的源码 | `VIKINGYFY/immortalwrt`，`owrt`，`2e285cda3da4680a2b7e5c798df037b4fdaa6fc1`，内核 `6.18.55` |
| 对应编译框架 | 检查时 `VIKINGYFY/OpenWRT-CI` 的 `QCA-ALL.yml` 使用 `owrt`；框架 main 为 `5a77a388c8fe91c894f3e97618e9f997b57c4fba` |

上游已经改变分支选择，首次迁移必须核对源码、设备/GENERAL 配置、Handles/Settings、feeds 和插件获取方式的兼容性。新源码的 feeds 定义还出现了 `pon_drivers`、`pon_userspace`，需要按实际使用和依赖决定处理方式；当前锁文件没有这两项，锁覆盖检查必须同时更新，不能让新 feed 未锁定就进入构建。

本次分析保持已验证的版本锁和底层配置。迁移到 `owrt` 应作为单独的候选版本增量完成，不能仅将旧 `main` 的固定 SHA 替换成“最新提交”。

## 建议的自动更新流程

1. **定时检查平台发布。** 使用 GitHub Actions `schedule` 加手动入口。建议每天北京时间 11:20 检查一次；无新版本时立即结束。该时间是建议值，当前没有创建计划。
2. **准确选择上游。** 查询 `VIKINGYFY/OpenWRT-CI` 的 Releases，过滤非草稿、非预发布、`IPQ60XX-WIFI-YES`、允许的源码仓库/分支，并要求存在 `jdcloud_re-cs-02` 镜像和配置。不要只读 `/releases/latest`，它可能属于其他平台。分支白名单应在首次 `owrt` 兼容性验证后再调整。
3. **提取并校验来源。** 从该平台 Release 的来源记录读取源码仓库、分支及完整 SHA，与 GitHub 上实际提交核对。Release 的 `target_commitish` 属于编译框架仓库，不能当作固件源码提交。来源缺失、分支突然变化或发布资产不完整时停止并记录原因。
4. **生成候选版本锁。** 保存上游 Release ID/标签、源码提交、框架基线、设备配置摘要、实际 feeds/插件提交、二进制校验和及本项目 overlay 摘要。依据候选源码声明的 feed 地址和分支解析固定提交，逐项检查锁覆盖。自定义插件仍独立锁定，变更和兼容性理由写入更新记录。上游发布未提供的依赖提交只能记录为本次解析值，不能宣称与上游原构建完全一致。
5. **在更新分支上预检。** 比较上游框架/配置与本地基线，保留 OpenClash、PassWall2、Docker、Lucky 等自定义应用。核对 RE-CS-02、IPQ6018/QCN9074、NSS、USB/eMMC、LuCI/Firewall、代理核心和 Rust 消费包。受保护配置必须与同一候选源码下的作者配置匹配。不得自动修补 NSS、无线、DTS、内核或 PHY 来绕过失败。
6. **预检通过后正式编译。** 使用同一候选提交和输入指纹串行运行两个编译阶段。保存完整检查点；沿用时间/空间保护。同一版本只启动一次构建，已在构建中的版本不重复排队，失败版本不每次检查都无限重试。
7. **检查并发布候选固件。** 保留实际镜像、包数据库、`.config`、来源锁、manifest、镜像检查结果和 SHA-256。候选构建成功后发布独立的 prerelease，不覆盖已有发布和标签；失败时保存诊断，发布上传问题优先补发原产物。
8. **实机验证后确认日常版本。** 手动升级并核对有线、80/160MHz、长时间运行、NSS、两套代理分别运行及 Docker。确认后再合并候选版本锁、发布为日常版本，保留上一版下载和恢复路径。

## 实施时需要补充的机制

- 新增检查脚本、候选版本来源记录及更新分支/PR 管理。来源字段按允许值处理，不把上游 Release 文本作为 shell 代码执行。
- 扩展现有构建流程，串联 preview 与正式构建，并为候选发布增加明确的 prerelease 通道。目前手动正式构建会直接发布普通 Release，尚不能直接充当上述候选流程。
- 自动生成提交/PR 后显式调用 `workflow_dispatch` 或可复用工作流；使用默认 `GITHUB_TOKEN` 的普通 push 通常不会再次触发其他 workflow，不能只依赖现有 push 事件。参考 [GitHub 工作流触发规则](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow#triggering-a-workflow-from-a-workflow)。
- 检查/编译尽量使用只读权限，将写 Release/PR 的权限限定到需要的任务；不在固件中存入订阅、节点或账号密钥。
- 将构建输入与通过预检的提交绑定，拒绝跨候选版本复用检查点；构建中的 main 更新不改变已启动候选的来源。

## 计划运行的实际限制

GitHub 的定时任务在高负载时可能延迟，公开仓库连续 60 天无活动也可能自动停用 schedule。因此应保留手动入口和失败/停用后的恢复说明。定时检查不需要每次都修改仓库来制造活动。依据：[GitHub schedule 文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。

自动构建只负责提供新的候选固件。是否替换日常版本应以设备测试为准。
