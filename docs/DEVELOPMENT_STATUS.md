# 开发状态

更新时间：2026-10-19（Asia/Shanghai）。

当前目标：以 Athena-ImmortalWrt 名称继续维护雅典娜定制固件，发布独立 README，明确跟随上游更新的实施前提。

当前状态：GitHub 仓库已从 Athena-VIKINGYFY 更名为 [Athena-ImmortalWrt](https://github.com/zhaomeeng/Athena-ImmortalWrt)，本地 origin 已更新。README 围绕雅典娜、OpenClash/PassWall2、Docker、下载校验和构建恢复独立重写；源码锁、应用选择及构建脚本保持已验证版本。历史标签、构建编号和原始证据保留。

最新交付：[Run 38067565477](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/runs/38067565477)（框架 1239927）工具链、固件编译、实际镜像检查、artifact 和 Release 发布全部 success。[Release athena-b-38067565477](https://github.com/zhaomeeng/Athena-ImmortalWrt/releases/tag/athena-b-38067565477) 已公开；2026-10-19 核对全部 40 个远端资产摘要与发布清单、原构建标签均一致，最终配置 SHA256 为 bd6618a019b5b65757e572160d9db2d07d50094a5fd003edfcbbebc33bad7746。见 validation/release-38067565477.json。对应预检 38066247060 两任务成功，受保护配置与 Rust 消费包列表为空。新 PassWall2 镜像尚无新增真机测试反馈。

保持：源码 0fb9b10、feeds/插件版本锁、内核/NSS/无线/设备基线、Docker/Lucky/Aurora 等原有应用。PassWall 1 不选中；PassWall2 的可选 Shadowsocks Rust 和 Ruby YJIT 关闭，预检要求有效 Rust host 消费包为空。两套代理和 Docker 默认关闭，按需切换。

构建策略：Public Ubuntu 24.04 runner 清理、原生 AUTOREMOVE、1G ccache 和磁盘保护；工具链/内核、最终固件两个串行任务，各段编译最多四小时。工具链完整源树检查点保留三天，支持同 Run 限时续编，最终固件拒绝未完成状态。新配置不复用旧 Run 或预检检查点。

上一版交付：[Run 37397400157](https://github.com/zhaomeeng/Athena-VIKINGYFY/actions/runs/37397400157) 编译/镜像检查成功，[Release athena-b-37397400157](https://github.com/zhaomeeng/Athena-VIKINGYFY/releases/tag/athena-b-37397400157) 已公开，38 个资产摘要与原构建标签已核对，见 validation/release-37397400157.json。用户随后反馈 A/B 均能正常使用；该反馈对应之前无 PassWall2 的镜像，新组合仍需单独设备验证。

历史问题：磁盘耗尽、六小时上限、IPQ6018 文件名误判和零字节发布资产均有修复记录，见 BUILD_ISSUES.md；保留已经通过的分段固件检查与发布准备脚本。

已知事项：Windows 无可用 WSL 发行版，实际 defconfig/编译在 GitHub Ubuntu runner 执行。最终固件任务失败时从完整工具链检查点重新执行，不复用半成品签名材料。

上游更新结论：可以自动检测平台发布并编译候选固件；方案见 UPSTREAM_UPDATES.md。目前没有启用定时任务或更新源锁。2026-10-19 对应上游已使用 owrt 分支、源码 2e285cd、内核 6.18.55，框架和 feeds 也有变更；首次迁移需独立核对兼容性，不能仅定时重复旧版本构建。

下一步：确认新 PassWall2 镜像的设备表现；若实施自动更新，先完成 main → owrt 的候选基线迁移和真实预检，再加入发布检测、候选构建及 prerelease 通道。

决策与需求：见 [BASELINE.md](BASELINE.md)、[REQUIREMENTS.md](REQUIREMENTS.md)、[OPERATIONS.md](OPERATIONS.md)、[UPSTREAM_UPDATES.md](UPSTREAM_UPDATES.md)。
