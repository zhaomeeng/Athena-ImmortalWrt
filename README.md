# Athena-ImmortalWrt

面向 **京东云雅典娜 AX6600（RE-CS-02 / IPQ60xx）** 的 ImmortalWrt 定制固件构建项目。

采用 VIKINGYFY 维护的源码及 IPQ60XX-WIFI-YES 配置，沿用其内核、NSS、ath11k/QCN9074、设备树和底层驱动适配，集中定制日常需要的代理、容器、存储与管理功能。

[固件下载](https://github.com/zhaomeeng/Athena-ImmortalWrt/releases) · [Actions 构建入口](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/workflows/ATHENA.yml) · [构建与升级说明](docs/OPERATIONS.md) · [开发状态](docs/DEVELOPMENT_STATUS.md)

## 定制特点

| 功能 | 当前配置 |
| --- | --- |
| OpenClash | 预置 LuCI 插件及经过 SHA-256 核验的 Mihomo ARM64 核心 |
| PassWall2 | 预置中文界面、Xray 和 Sing-box，选择 nftables 透明代理 |
| Docker | 包含 Docker、dockerd、必要依赖和 Dockerman 管理界面 |
| 网络 | 保留上游 NSS 配置、FullCone NAT Sonic、UPnP、WOL Ultra |
| 存储 | 保留 USB 存储支持、Mini Disk Manager、Samba4、Partexp |
| 管理 | 包含 Lucky、TTYD、AutoReboot、Firewall 和 Package Manager |
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

## 自行编译

1. 打开 [Actions 构建入口](https://github.com/zhaomeeng/Athena-ImmortalWrt/actions/workflows/ATHENA.yml)，通过 **Run workflow** 保持 `preview=true` 运行预检。
2. 确认两段预检成功，检查必需应用、空的 `protected.diff`、空的 `selected-rust-consumers.txt` 及检查点恢复结果。
3. 使用相同配置和版本锁，以 `preview=false` 启动正式编译。
4. 等待工具链/内核、软件包/镜像两个任务依次完成，从 Releases 下载成果物。

构建使用 Ubuntu runner，包含磁盘清理、空间监控、原生 AUTOREMOVE 和阶段检查点。每段编译设置四小时软限制，为诊断上传和任务收尾留出时间；工具链检查点保留三天。支持同一次运行中重跑失败任务，具体恢复条件见操作说明。

实际雅典娜镜像会检查 IPQ6018 分段固件、QCN9074 固件、OpenClash/Mihomo、PassWall2/Xray/Sing-box、Docker 和首次启动服务设置，再生成校验清单并发布。

## 版本与更新策略

[build.lock.tsv](build.lock.tsv) 固定源码、feeds、第三方插件及 Mihomo 二进制的版本。当前已发布双代理固件使用 `VIKINGYFY/immortalwrt` 的 `main` 分支提交 `0fb9b10cb9df51fb076470e1dd93d1c30dd89d83`；实际版本以对应 Release 的来源记录为准。

**目前采用手动触发构建，尚未启用自动跟随上游更新。** 保持版本锁重新编译，会继续使用锁定的源码与软件包。

跟随上游更新的可行性、`main` → `owrt` 分支变化及建议流程，见 [上游更新方案](docs/UPSTREAM_UPDATES.md)。建议以适用于本设备的平台发布为更新信号，先预检、再构建候选固件，经过设备测试后再用于日常运行。

## 来源与验证范围

- 编译框架：[VIKINGYFY/OpenWRT-CI](https://github.com/VIKINGYFY/OpenWRT-CI)。
- 固件源码：[VIKINGYFY/immortalwrt](https://github.com/VIKINGYFY/immortalwrt)，基于 ImmortalWrt/OpenWrt 生态。
- 插件来自各自开源项目；具体仓库、提交与二进制校验值见版本锁。
- 当前定制仅以雅典娜 RE-CS-02 为支持和交付对象。
- 云端编译及镜像检查不替代真机验证。旧版已有用户反馈可正常使用，含 PassWall2 的新镜像仍需单独验证长时间运行、160MHz、NSS、代理及 Docker 共存。

本仓库原名 `Athena-VIKINGYFY`，历史 Release 标签及构建证据中的 `athena-b-*` 标识继续保留，便于追溯已发布版本。

完整来源记录见 [BASELINE.md](docs/BASELINE.md)，已处理的问题见 [BUILD_ISSUES.md](docs/BUILD_ISSUES.md)。本仓库保留原框架的 [MIT 许可证及署名](LICENSE)；固件源码与各软件包分别遵循其自身许可证。
