# 开发状态

更新时间：2026-10-21（Asia/Shanghai）。

当前目标：自动维护上游源码和必要 feed 版本锁，仅由用户手动发起配置预检与固件编译。

仓库可见性：2026-10-21 按用户要求改为 Private，API 已确认 isPrivate=true；Actions enabled=true，来源更新工作流 active，每日 11:20 的 cron 未变。私有化后 [39459455766](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/runs/39459455766) 成功，当前来源无变化而跳过提交；未触发固件编译。未来计划触发尚待下一次定时窗口，执行受私有 Actions 额度及预算限制，见 UPSTREAM_UPDATES.md。

当前状态：独立 Update Sources 定时任务已启用（计划北京时间每日 11:20，GitHub 可能延迟）；Build Firmware 入口仅手动触发，并从锁动态解析来源。自动更新提交 build.lock.tsv、sources/upstream.json 和 README 的自动版本区块，不执行 defconfig、编译或发布。[云端 dry-run 39281309649](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/runs/39281309649) 成功且提交步骤跳过；[首次定时更新 39394314731](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/runs/39394314731) 成功，bot 提交 194aac9 当时仅修改版本锁与来源记录，锁定 owrt 源码 fd7cdeefc0d62a22a3d8b89d6aed42c42e18a503 和 7 个 feed。首次云端与本地 33 项测试全部通过；此前 Bash/ShellCheck/actionlint 已通过。2026-10-21 再次真实上游 dry-run 返回 changed=false，工作区无改动；最新固件编译仍是 38067565477，未被来源更新触发。README、更新说明及操作文档已同步，验证记录见 validation/source-update-39394314731.json。

新增版本展示：README 自动版本区块已按固定来源读取 ImmortalWrt 默认版本 SNAPSHOT 与 Linux 6.18.55，元数据保存在 sources/upstream.json。相同源码可补齐版本信息或修复区块，无变化不提交；源码/feed/插件锁未因此改变。38 项本地测试、脚本语法与 actionlint 通过，真实上游 dry-run → 应用 → 重复 dry-run 验证通过，最后 changed=false。[新版云端验证 39458937426](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/runs/39458937426) 成功，38 项测试通过，changed=false，提交步骤跳过；没有启动新的固件编译。

最新交付：[Run 38067565477](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/runs/38067565477)（框架 1239927）工具链、固件编译、实际镜像检查、artifact 和 Release 发布全部 success。[Release athena-b-38067565477](https://github.com/zhaomeeng/Athena-ImmortalWrt/releases/tag/athena-b-38067565477) 已公开；2026-10-19 核对全部 40 个远端资产摘要与发布清单、原构建标签均一致，最终配置 SHA256 为 bd6618a019b5b65757e572160d9db2d07d50094a5fd003edfcbbebc33bad7746。见 validation/release-38067565477.json。对应预检 38066247060 两任务成功，受保护配置与 Rust 消费包列表为空。新 PassWall2 镜像尚无新增真机测试反馈。

保持：应用 overlay、作者设备/GENERAL 配置、Handles/Settings、第三方插件及二进制锁保持不变。源码和 feed 锁由更新任务维护，以 build.lock.tsv 与 sources/upstream.json 为准；原 0fb9b10 只代表已发布固件的来源。PassWall 1 不选中；PassWall2 的可选 Shadowsocks Rust 和 Ruby YJIT 关闭，手动预检仍要求有效 Rust host 消费包为空。两套代理和 Docker 默认关闭，按需切换。

构建策略：Public Ubuntu 24.04 runner 清理、原生 AUTOREMOVE、1G ccache 和磁盘保护；工具链/内核、最终固件两个串行任务，各段编译最多四小时。工具链完整源树检查点保留三天，支持同 Run 限时续编，最终固件拒绝未完成状态。新配置不复用旧 Run 或预检检查点。

上一版交付：[Run 37397400157](https://github.com/zhaomeeng/Athena-VIKINGYFY/actions/runs/37397400157) 编译/镜像检查成功，[Release athena-b-37397400157](https://github.com/zhaomeeng/Athena-VIKINGYFY/releases/tag/athena-b-37397400157) 已公开，38 个资产摘要与原构建标签已核对，见 validation/release-37397400157.json。用户随后反馈 A/B 均能正常使用；该反馈对应之前无 PassWall2 的镜像，新组合仍需单独设备验证。

历史问题：磁盘耗尽、六小时上限、IPQ6018 文件名误判和零字节发布资产均有修复记录，见 BUILD_ISSUES.md；保留已经通过的分段固件检查与发布准备脚本。

已知事项：Windows 无可用 WSL 发行版，实际 defconfig/编译在 GitHub Ubuntu runner 执行。最终固件任务失败时从完整工具链检查点重新执行，不复用半成品签名材料。

更新边界：首次来源更新允许从确切旧 main 基线进入作者现用 owrt 发布，补齐 pon_drivers/pon_userspace 等启用 feed 的锁；这只验证来源元数据，不宣称新源码已通过编译。未知分支/feed、回退、来源记录不符时停止。细节见 UPSTREAM_UPDATES.md。

下一步：按计划自动维护来源锁；需要新固件时由用户手动发起 Build Firmware，先运行配置预检，再正式编译并核对新来源的真实兼容性和设备表现。本轮未发起预检或固件编译，新 owrt 来源尚未经过本项目实际编译或设备验证。

决策与需求：见 [BASELINE.md](BASELINE.md)、[REQUIREMENTS.md](REQUIREMENTS.md)、[OPERATIONS.md](OPERATIONS.md)、[UPSTREAM_UPDATES.md](UPSTREAM_UPDATES.md)。
