**最新更新日期：2026-11-13**

# Athena-ImmortalWrt

面向 **京东云雅典娜 AX6600（RE-CS-02 / IPQ60xx）** 的 ImmortalWrt 定制固件构建项目。

采用 VIKINGYFY 维护的源码及 IPQ60XX-WIFI-YES 配置，沿用其内核、NSS、ath11k/QCN9074、设备树和底层驱动适配，集中定制日常需要的代理、容器、存储与管理功能。

[固件下载](https://github.com/zhaomeeng/Athena-ImmortalWrt/releases) · [手动编译](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/workflows/ATHENA.yml) · [自动更新来源](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/workflows/SOURCE-UPDATE.yml) · [构建与升级说明](docs/OPERATIONS.md) · [开发状态](docs/DEVELOPMENT_STATUS.md)

<!-- ATHENA-SOURCE-VERSIONS:START -->
## 当前待编译源码版本

| 项目 | 锁定版本 |
| --- | --- |
| ImmortalWrt | **SNAPSHOT**（源码默认版本） |
| Linux 内核 | **6.18.55** |
| 源码分支 | `main` |
| 源码提交 | [`f9b0ce7650fd`](https://github.com/VIKINGYFY/immortalwrt/commit/f9b0ce7650fdcc7f4793256a3ae43c1132e2bc49) |
| 更新来源 | 作者 `main` 分支固定提交（保留 NSS） |

版本随源码更新任务自动维护，读取固定提交的 [版本声明](https://github.com/VIKINGYFY/immortalwrt/blob/f9b0ce7650fdcc7f4793256a3ae43c1132e2bc49/include/version.mk) 与 [内核版本文件](https://github.com/VIKINGYFY/immortalwrt/blob/f9b0ce7650fdcc7f4793256a3ae43c1132e2bc49/target/linux/generic/kernel-6.18)。以上对应待编译源码，尚不代表本仓库已发布固件或路由器运行版本；SNAPSHOT 表示开发版本，具体来源以提交为准。
<!-- ATHENA-SOURCE-VERSIONS:END -->

## 定制特点

| 功能 | 当前配置 |
| --- | --- |
| OpenClash | 预置 LuCI 插件及经过 SHA-256 核验的 Mihomo ARM64 核心 |
| PassWall2 | 预置中文界面、Xray 和 Sing-box，选择 nftables 透明代理 |
| Docker | 包含 Docker、dockerd、必要依赖和 Dockerman 管理界面 |
| 网络 | 保留上游 NSS 配置、FullCone NAT Sonic、UPnP、WOL Ultra |
| 存储 | 保留 USB 存储支持、Mini Disk Manager、Samba4、Partexp |
| 管理 | 包含 Lucky 核心 3.8.0 Wanji / LuCI 3.0.0、TTYD、AutoReboot、Firewall 和 Package Manager |
| 界面 | Aurora 主题及配置插件 |

应用选择集中在 [Config/ATHENA-APPS.txt](Config/ATHENA-APPS.txt)。删除 HomeProxy、GecoosAC、NATMapT，不加入 PassWall 1、AdGuardHome、MosDNS、SmartDNS、SQM、iStore 和 Attended Sysupgrade 等应用。

关闭 PassWall2 的可选 Shadowsocks Rust 及 Ruby YJIT，保留 OpenClash 所需的 Ruby/YAML。真实配置预检要求已选软件包不存在有效的 Rust host 编译依赖，以减少额外构建开销。

## 首次启动与代理切换

首次启动默认关闭 **OpenClash、PassWall2、Docker**，同时关闭 PassWall2 服务端及 Xray/Sing-box 的独立服务。先确认有线、IPv4/IPv6、Wi-Fi 80/160MHz 和基础联网情况，再启用所需功能。

- 使用 OpenClash 时，停止 PassWall2。
- 使用 PassWall2 时，停止 OpenClash；由 PassWall2 管理 Xray/Sing-box。
- 两套代理按需切换，避免同时接管 DNS 和透明代理。
- Docker 按需启用，建议先规划持久化存储和容器数据目录。

当前默认管理地址为 `192.168.10.1`，SSID 为 `OWRT`，示例无线密码为 `12345678`，root 初始无密码。接入日常网络前，请设置自己的管理密码和无线密码。保留旧配置升级后，也应核对服务启用状态。

## 下载与升级

在 [Releases](https://github.com/zhaomeeng/Athena-ImmortalWrt/releases) 下载设备名称含 **`jdcloud_re-cs-02`** 的镜像。

后续 Release 名称、标签及最终固件 artifact 统一采用 **`Athena-ImmortalWrt-yyyymmdd`**，例如 `Athena-ImmortalWrt-20261021`。日期取构建任务创建时的北京时间，跨日完成或重跑仍使用同一个名称。同一天已有其他构建发布时停止，避免覆盖；历史 `athena-b-*` Release 保留。镜像文件继续使用包含设备名称的标准文件名，内部检查点/诊断 artifact 保留原标识以保证续编兼容。

| 文件 | 用途 |
| --- | --- |
| `*-jdcloud_re-cs-02-*-sysupgrade.bin` | 已运行兼容 OpenWrt 系固件时，按对应升级流程手动升级 |
| `*-jdcloud_re-cs-02-*-factory.bin` | 匹配当前引导器支持的初装或恢复流程 |
| `SHA256SUMS` | 校验实际下载的文件 |
| `final.config`、manifest、`packages.tar.gz` | 核对构建配置、软件包组成和对应安装包 |
| `build.lock.tsv`、`image-validation.txt` 等 | 核对来源版本与镜像检查证据 |

在 Windows PowerShell 中计算下载镜像的 SHA-256，并与同一个 Release 的 `SHA256SUMS` 对照：

```powershell
Get-FileHash .\immortalwrt-qualcommax-ipq60xx-jdcloud_re-cs-02-squashfs-sysupgrade.bin -Algorithm SHA256
```

升级方式为：**本仓库重新编译 → 下载并核对镜像 → 手动升级**。具体操作见 [OPERATIONS.md](docs/OPERATIONS.md)。

## 手动编译固件

1. 打开 [Athena Build Firmware](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/workflows/ATHENA.yml)，通过 **Run workflow** 保持 `preview=true` 运行预检。
2. 确认两段预检成功，检查必需应用、空的 `protected.diff`、空的 `selected-rust-consumers.txt` 及检查点恢复结果。
3. 使用相同配置和版本锁，以 `preview=false` 启动正式编译。
4. 等待工具链/内核、软件包/镜像两个任务依次完成，从 Releases 下载成果物。

构建使用 Ubuntu runner，包含磁盘清理、空间监控、原生 AUTOREMOVE 和阶段检查点。每段编译设置四小时软限制，为诊断上传和任务收尾留出时间；工具链检查点保留三天。支持同一次运行中重跑失败任务，具体恢复条件见操作说明。

实际雅典娜镜像会检查 IPQ6018 分段固件、QCN9074 固件、OpenClash/Mihomo、PassWall2/Xray/Sing-box、Docker 和首次启动服务设置，再生成校验清单并发布。

## 自动更新来源，按需手动编译

[Athena Update Sources](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/workflows/SOURCE-UPDATE.yml) 每天 **北京时间 11:20** 在 GitHub 检查作者 `VIKINGYFY/immortalwrt` 的 **`main`** 分支，确认目标默认包含 NSS 驱动后，更新 [build.lock.tsv](build.lock.tsv) 中的源码及必要 feed 提交，并提交来源记录 `sources/upstream.json`，同步更新本页的 ImmortalWrt 与内核版本表。源码按完整提交固定，不跟随不含 NSS 的 `owrt` 发布。

- 自动阶段只核对发布来源、源码提交和 feed 锁完整性，**不运行固件编译或 defconfig、不生成新固件、不发布 Release**。
- 同一源码提交保留 feed 锁；只在版本记录缺失或本页版本表需要同步时补齐文档，无变化不提交。OpenClash、PassWall2、Lucky 等自定义插件锁及 Mihomo 二进制锁保持固定，应用 overlay 保留。
- 当前更新策略仅跟随作者的 `main` 分支；目标默认包缺少 NSS drv/ecm/dp、来源/feed 地址异常、版本回退或提交分叉时停止更新并保留失败日志。自动阶段验证源码声明，正式构建仍要求有效配置实际选中 NSS。
- 编译入口仅支持手动触发。需要新固件时，再按上节运行预检和正式编译；真实配置和依赖兼容性在这时验证。
- 两个任务均在 GitHub 云端运行，电脑可以关机。仓库现为 Private，定时更新仍启用；GitHub 定时任务可能延迟。私有仓库的 Actions 使用账户免费额度，额度或预算限制可能阻止后续运行，详见 [GitHub 计费说明](https://docs.github.com/en/billing/concepts/product-billing/github-actions)。

手动运行更新任务时，`dry_run=true` 仅报告建议变更；取消该选项才会提交更新。普通 push、定时检查及来源更新提交都不会触发固件构建。

2026-10-21 已完成云端验证：[首次定时更新成功](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/runs/39394314731)，自动提交仅包含源码/依赖锁和来源记录；再次检查无变化，未触发固件编译。详见 [验证记录](docs/validation/source-update-39394314731.json)。

**仓库最新源码与已发布固件是两种状态。** 已发布双代理固件仍对应原 `main` 提交 `0fb9b10cb9df51fb076470e1dd93d1c30dd89d83`；来源自动更新后，新的源码需要等你手动编译才会成为新固件。以各 Release 保存的锁文件和构建记录确认该固件实际使用的版本。

策略、异常处理和手动入口见 [上游更新说明](docs/UPSTREAM_UPDATES.md)。

## 来源与验证范围

- 编译框架：[VIKINGYFY/OpenWRT-CI](https://github.com/VIKINGYFY/OpenWRT-CI)。
- 固件源码：[VIKINGYFY/immortalwrt](https://github.com/VIKINGYFY/immortalwrt)，基于 ImmortalWrt/OpenWrt 生态。
- 插件来自各自开源项目；具体仓库、提交与二进制校验值见版本锁。
- 当前定制仅以雅典娜 RE-CS-02 为支持和交付对象。
- 云端编译及镜像检查不替代真机验证。旧版已有用户反馈可正常使用，含 PassWall2 的新镜像仍需单独验证长时间运行、160MHz、NSS、代理及 Docker 共存。

本仓库原名 `Athena-VIKINGYFY`，历史 Release 标签及构建证据中的 `athena-b-*` 标识继续保留，便于追溯已发布版本。

完整来源记录见 [BASELINE.md](docs/BASELINE.md)，已处理的问题见 [BUILD_ISSUES.md](docs/BUILD_ISSUES.md)。本仓库保留原框架的 [MIT 许可证及署名](LICENSE)；固件源码与各软件包分别遵循其自身许可证。
