# 构建问题与处理记录

## 2026-10-21 多设备镜像复制耗尽磁盘

正式 Run 39466737391 的配置预检、NSS/应用选择及工具链/内核编译成功。固件阶段第一次并行构建曾报告 Sing-box 失败，随后串行重试在 22:39:50 UTC 已完成 Sing-box 编译并成功安装。最终失败发生在多设备镜像生成阶段：可用磁盘由 31 GiB 降到 2270440 KiB（约 2.2 GiB），低于 3 GiB 保护线，07:08:27 CST 主动终止，compile-exit=143；不是四小时超时，也不是最终 Sing-box 编译未通过。

日志显示持续为非雅典娜设备生成 target-dir 和 squashfs，build_dir 增至 23 GiB。修复使用已锁上游 include/image.mk 原生迭代的 TARGET_DEVICES 命令行覆盖，仅打包 jdcloud_re-cs-02，不改 `.config`、驱动、源码或应用组合。新 Run 可显式复用已成功的完整工具链检查点，仍须通过来源与输入/配置/归档哈希校验；旧检查点只保留三天。实际新镜像成功与磁盘余量尚需重新构建验证。

## 2026-10-21 未选用 VNT 仓库失效阻断预检

预检 39460712170 在 Custom Packages 阶段下载 lmq8267/luci-app-vnt 时收到认证提示并以 128 退出。独立 GitHub API 核对该仓库返回 404，其他 39 个包锁定提交可访问。VNT 不在雅典娜设备/GENERAL/应用配置的选择中，因此仅移除这项未选用插件的下载调用，保留历史锁以追溯来源，不替换仓库或放宽锁校验。该修复不改变 OpenClash、PassWall2、Docker 或底层驱动选择，需重新完成配置预检。

## 2026-10-06 两版编译已成功，B 的空资产上传失败

[Run 37397400157](https://github.com/zhaomeeng/Athena-VIKINGYFY/actions/runs/37397400157) 工具链/最终固件编译、Package Firmware 和 Save firmware artifact 全部成功；Release Firmware 因零字节诊断文件被 GitHub 拒绝（size must be greater than or equal to 1）而失败。草稿 Release 404295561 已有 36 个非空构建资产及原 SHA256SUMS；只有 protected.diff、selected-rust-consumers.txt 两个空文件未能上传。原固件 artifact 为 11388558797，设备运行验证仍未完成。

修复应用层发布准备：校验原 SHA256SUMS，空证据收入 empty-evidence.tar.gz，重新为实际发布的资产集合生成清单；softprops 发布使用独立 release-upload，target_commitish 固定为实际构建框架提交。已有草稿的非空资产逐项用 GitHub digest 对照原清单，原固件/包不重传；补充归档，仅更新发布校验清单，固定原构建目标后发布草稿。修复没有改变源锁、GENERAL、IPQ60XX-WIFI-YES、Handles 或 Settings，不需要因上传错误重编固件。

补发完成：[Release athena-b-37397400157](https://github.com/zhaomeeng/Athena-VIKINGYFY/releases/tag/athena-b-37397400157) 公开，全部 38 个资产与发布清单摘要匹配，标签为原构建 1ce469a。原 Actions Run 仍显示发布步骤失败的历史结论；固件通过编译与交付校验，设备测试尚未完成。

Run 37333460335 的退出来自检查脚本误匹配 python-setuptools-rust/host 后缀，配置/底层比较本身通过。已精确匹配 rust/host 并允许禁用 Ruby 选项不输出；用该 Run 下载的真实配置/packageinfo 回归：现配置无有效 Rust host 消费包，单独启用 YJIT 或 Shadowsocks Rust 均能检出。

## 2026-10-06 编译成功，交付文件名检查失败

正式 [Run 37338343637](https://github.com/zhaomeeng/Athena-VIKINGYFY/actions/runs/37338343637) 于 02:59:46（Asia/Shanghai）失败。工具链、固件编译均 success，compile-exit=0，已编译工具链的跨任务恢复 PASS；Package Firmware 检查 lib/firmware/IPQ6018/amss.bin 失败，未上传/发布固件。不是超时、磁盘耗尽或底层编译错误。实际配置仍为 a3dd345a4edd57d7cf0f274c282b787ccdce5f29aa95a31615a9e8396d45ccd3，protected.diff 与 Rust 消费包均为空。

固定源码 package/firmware/ath11k-firmware/Makefile 将 IPQ6018/hw1.0/* 装入 /lib/firmware/IPQ6018。固定固件仓库 VIKINGYFY/ath11k-firmware-ddwrt 修订 0c817c46568ef6871042c7e2efc95ac24a1f02e6 含 q6_fw.mdt、m3_fw.mdt 及分段文件，并无 IPQ6018/amss.bin；QCN9074 则确有 amss.bin。修正交付检查，要求元数据、board-2.bin 和全部非空分段，不修改任何无线配置、固件包、NSS 或设备定义。追加打包之后 always 上传的镜像检查诊断，以保留失败时的 rootfs 清单。

Bash、ShellCheck、actionlint、git diff --check 通过。修正后的实际镜像检查与交付仍需新正式构建验证。

## 无 PassWall 首次预检：Ruby YJIT 的额外 Rust 依赖

Run 37331839464 同样在 Rust 消费包检查失败；A 对应 Run 37331824442 下载证据证明 Ruby 默认 YJIT 会引入 Rust host。两版应用层显式关闭 RUBY_ENABLE_YJIT，保留 OpenClash 所需 Ruby/YAML；检查按实际配置解析条件依赖，本地禁用/启用条件回归通过，不改变原生 NSS/无线/设备配置。

## 2026-10-06 用户变更：公开并移除 PassWall 后重编

用户要求取消含 PassWall 的 A/B 构建，旧 B Run 37297257083 已确认 cancelled。全部本地 Git 历史凭据特征及敏感文件名检查未命中，仓库已公开。应用 overlay 禁用 PassWall 1/2 和专用核心，独立 Rust 任务移除，首启只关闭 OpenClash/Docker；真实预检增加 Rust host 消费包检查，镜像拒绝 PassWall 文件/包。当前工具链/内核、最终固件两段各限四小时；旧配置的预检和检查点不复用。GENERAL、IPQ60XX-WIFI-YES、Handles/Settings 保持原生不变。

2026-10-05：

- 当前 Windows 无可用 WSL 发行版。使用 Git for Windows 的 Bash 进行本地语法检查，真实 defconfig/构建由 GitHub Ubuntu Actions 执行；没有安装额外系统环境。
- 新建仓库推送后，GitHub 一度未注册工作流，dispatch 返回 404。已通过 API 验证工作流存在；加入只执行预检的工作流文件 push 触发后注册成功，预检 Run `37241333236` 启动。该问题不是软件包/底层编译错误。
- 上游全平台 manifest 不包含全部设备专用包。QCN9074 在配置中为 m、在雅典娜设备定义中启用，因此新增 Factory squashfs 文件内容检查，以确认实际雅典娜镜像的双无线固件、代理核心、Docker 和默认关闭脚本。
- 从实际源码核对 host 工具名称为 `unsquashfs4`，IPQ6018 DDWRT 固件目录为 `/lib/firmware/IPQ6018`；打包检查采用对应工具和目录。

## 首次正式编译失败：runner 磁盘耗尽

Run `37241920846` 于 2026-10-05 08:25:32（Asia/Shanghai）结束，结论 failure。GitHub check-run `111552187381` 的 failure 注释确认 `System.IO.IOException: No space left on device`，runner 无法继续写诊断日志。

Custom Settings/预检、Save configuration evidence、Download Packages 均成功。正式运行配置 artifact 已下载，preflight PASS，protected.diff 为 0 字节。Compile Firmware 在 runner 异常退出时仍显示 in_progress；后续打包与发布未执行。没有固件或 Release。完整 job 日志返回 `log not found`，因此没有可据以判断的具体包编译错误。

下一步优化构建环境磁盘使用，再使用相同源锁和应用配置重编。本次状态检查仅记录证据，没有修改构建流程或触发重编。

## 磁盘修复与第二次构建准备

从成功预检 Run `37241333236` 的完整日志核对，runner 为 Ubuntu 24.04，根盘 72G、已用 62G、剩余约 11G；`/mnt/build_wrt` 与根盘共用文件系统。仅把构建树放到 `/mnt` 无法扩大容量。

这次只调整构建环境和临时文件策略：

- 固定 `ubuntu-24.04`，保持首次预检的系统系列。
- 在安装构建依赖前，清理临时 runner 的 Android、.NET、GHC、Swift、hosted tool cache 与闲置 Docker 镜像；保留 runner/action runtime 和系统工具。
- 使用已锁源码 `include/package.mk` 提供的 `CONFIG_AUTOREMOVE=y` make 参数，清理已完成软件包的编译目录，保留 `.pkgdir` 和构建 stamps；不写入最终 `.config`。
- 将 ccache 上限设为 1G。编译前要求至少 20 GiB 空间，每分钟检查 root/build 文件系统；低于 3 GiB 时停止编译进程组，保留日志和诊断空间。
- 上传环境清理前后、依赖下载后、编译前后及每分钟磁盘记录；检查编译前后 `.config` 哈希相同。

版本锁、IPQ60XX-WIFI-YES、GENERAL、应用 overlay 和作者底层脚本均未修改。B 版重编仍先执行完整配置预检。清理效果和最终编译结果以第二次实际运行的 artifact 为准。

第二次 Run 37253202265 实测：72G 根盘清理前可用 14G、清理后 45G、依赖安装后 42G。新配置预检再次通过，protected.diff 为 0 字节，最终配置 SHA-256 与 Run 37241920846 完全相同。

## 第二次正式构建取消：超过 6 小时任务上限

Run `37253202265` 于 2026-10-05 09:53:36 创建、15:53:59 结束（Asia/Shanghai），结论 cancelled。check-run `111584892006` 明确记录：`The job has exceeded the maximum execution time of 6h0m0s`。Compile Firmware 从 10:06:54 执行到 15:53:53，尚在软件包编译阶段；打包、固件 artifact、Release 均被跳过。

已下载完整日志和 `athena-b-diagnostics-37253202265`。347 条空间记录中最低可用 21003656 KiB（约 20.0 GiB），最后一条 15:53:04 为 21655416 KiB（约 20.7 GiB）；没有 disk-stop.txt，磁盘低空间保护未触发。编译日志未见 make Error 或包编译 ERROR，超时前仍有 nftables 编译输出，不能判定固件编译成功。defconfig 阶段另有依赖递归诊断，必需应用/排除项和底层保护预检实际 PASS。

Restore Build Cache 没有命中；超时后 Save Build Cache 被跳过，本轮成果不能据此视为可供下轮恢复的构建缓存。取消时缺少 compile-space-after.txt 和 compile-config-after.sha256，编译前后配置一致检查尚未完成。

下一步处理完整构建时长和可恢复缓存；仍保留原源码锁、应用配置与作者底层基线。本次状态检查未修改构建脚本、工作流或触发第三次构建。

## 分阶段构建与恢复准备

用户授权继续后核对日志：10:06:54 开始编译，11:30:19 进入内核编译，12:14:20 进入软件包编译；Rust host-compile 从 12:36:00 开始，取消时还有 Rust bootstrap/LLVM 编译进程。GitHub 托管 runner 单任务上限为六小时，增加 timeout-minutes 不能扩展这个上限（[官方限制](https://docs.github.com/en/actions/reference/limits)）。

- 工具/工具链/内核、Rust 主机编译器、最终固件拆成三个串行任务，各段编译最多五小时，留出诊断上传时间。
- 使用原生 `tools/install`、`toolchain/install`、`target/compile`、`package/feeds/packages/rust/host/compile` 目标；不改 Rust 包、NSS、内核或应用选择。
- 传递完整工作树，保持 `/mnt/build_wrt` 路径和文件时间，避免只恢复 staging_dir 而丢失 build_dir 内的 .prepared/.configured/.built stamps。已锁源码的 host-build.mk 在 AUTOREMOVE 下仍保留零字节 stamps，原生 host-compile 已完成的目录内容会清理。
- 检查点用 tar.zst 保存软链接、权限和隐藏文件，校验源锁、构建输入、最终配置、平台、同一次 Run 以及 SHA-256；不传递根目录签名材料，不将凭证配置收入检查点。中间 artifact 保留三天，后续失败可在同一次 Run 重跑失败任务。
- 默认 preview 先实际运行源树打包和两次跨任务恢复，不编译；通过后再启动正式构建。Bash 语法、ShellCheck 和 actionlint 均通过。
- Rust 本段若仍触及五小时软限制，保存未完成检查点，重跑失败任务可继续其 host-compile。只接受限时退出码 124 且编译前后配置一致；最终固件阶段只接受完成标志为 true 的检查点。该限时续编路径尚待真实构建验证。
- ShellCheck v0.11.0 检查新增脚本与工作流内联 Bash：修正原工作流路径引用的引号，标明子 Bash 展开和 trap 回调两项静态分析例外；完整检查通过。恢复证据时另存当前 runner 的空间记录，避免被上一段证据覆盖。这些修正不改变源码、版本锁或最终固件配置。

分阶段预检 Run `37293737154` 基于 `5512721`，在补充 Rust 限时续编机制后主动取消。替代预检 [Run 37294364565](https://github.com/zhaomeeng/Athena-VIKINGYFY/actions/runs/37294364565) 基于 `8722455`，2026-10-05 18:06:01 至 18:31:47（Asia/Shanghai），三任务全部成功，Compile build stage/Release Firmware 均 skipped。两次恢复均通过源码、输入、配置、执行权限和软链接校验；配置哈希仍为 `b381caf9ddddc94b99e659777e2a48a67d9c7562a3350b234647a8366a16fb5f`，protected.diff 为空。配置证据、诊断及完整日志已下载；实际编译树及限时恢复尚待正式运行验证。

第三次正式 [Run 37297257083](https://github.com/zhaomeeng/Athena-VIKINGYFY/actions/runs/37297257083) 基于 `621a8df`，2026-10-05 18:32:43（Asia/Shanghai）启动。该提交相对预检仅修改工作流引用、诊断保留和静态分析注释；源码锁、配置及源树准备脚本没有变化。当前在首个任务的环境准备阶段，结果待完成。
