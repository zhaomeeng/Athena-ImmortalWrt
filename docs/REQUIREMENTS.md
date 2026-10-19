# 雅典娜 AX6600 双路线自编译固件——Work 交接方案

## 当前生效的后续决定

2026-10-19 维护方向：用户要求删除 A 版 GitHub 仓库，将本仓库更名为 Athena-ImmortalWrt，并围绕定制特点独立重写 README；已完成本仓库更名。后续定制固件维护集中于本项目，历史 A/B 交接内容保留作为来源记录。用户同时要求分析跟随上游固件版本自动更新/编译的可行性；当前仅形成方案，没有启用定时更新、迁移源码分支或改写已验证的版本锁。

2026-10-11 当前任务：用户明确要求 B 版保留 OpenClash，额外增加 PassWall2，然后重新编译。PassWall2 包含 Xray、Sing-box 和中文界面，使用原生 nftables 透明代理选项；关闭可选 Shadowsocks Rust 和 Ruby YJIT，保持没有 Rust host 消费包的两阶段构建。首次启动 OpenClash、PassWall2、Docker 关闭，两套代理按需切换。保持现有源码/feeds/插件锁与作者底层配置，先真实 defconfig/保护检查再正式编译。本次只修改 B；A 继续保持上一版配置。用户已反馈此前 A/B 均能正常使用，新加 PassWall2 的固件仍需单独验证。

历史决定：两仓库已公开，上一轮 A/B 均删除 PassWall 1/2 及专用核心，取消独立 Rust 编译任务。下文为原始交接记录；与本节冲突的编译顺序、应用选择以本节为准，其余底层保护和交付要求继续有效。

## 一、任务目标

为京东云雅典娜 AX6600（RE-CS-02 / IPQ60xx）制作两套可长期使用、可持续自行编译升级的定制固件。

本次不追求“大而全”，核心目标依次为：

1. 无线稳定，重点关注 5GHz 160MHz 是否存在断流；
2. 保持 IPQ60xx NSS 硬件加速能力；
3. 尽可能保持原项目作者已经验证的底层配置；
4. 满足日常 OpenClash、PassWall2、Lucky、Docker 等实际需求；
5. 删除明显无用或功能重复的应用层插件；
6. 两条路线独立维护，不互相混用底层配置；
7. 能通过 GitHub Actions 持续自行编译升级。

最终制作两个独立版本：

### A版：ZqinKing + LiBwrt

编译框架：

`ZqinKing/wrt_release`

使用 ZqinKing 已经为雅典娜/IPQ60xx 提供并实际发布过固件的 LiBwrt 路线。

原则：

**继续使用 ZqinKing 当前 LiBwrt/IPQ60xx 原生配置体系，只做应用层增删。**

不要改成 VIKINGYFY 源码。

---

### B版：VIKINGYFY + ImmortalWrt

编译框架：

`VIKINGYFY/OpenWRT-CI`

源码：

`VIKINGYFY/immortalwrt`

使用 VIKINGYFY 当前自己的 IPQ60XX-WIFI-YES 配置作为基线。

原则：

**保持 VIKINGYFY 自己当前正在使用和发布的 IPQ60xx 配置，只做应用层插件增删。**

不要把 ZqinKing 的 NSS fragment、设备 config 或其他底层配置移植过来。


# 二、最高优先级原则：底层尽量不动

以下内容原则上全部沿用各自项目当前对应雅典娜/IPQ60xx的配置，不主动修改：

- Kernel版本及内核选择
- qualcommax target/subtarget
- IPQ6018相关配置
- NSS firmware
- NSS ECM
- NSS offload
- NSS相关kmod
- ath11k
- ath11k PCI
- QCN9074 firmware
- Wi-Fi firmware
- board/DTS
- 无线校准相关配置
- FullCone底层实现
- Firewall底层
- Ethernet驱动
- switch/PHY配置
- USB底层驱动
- eMMC底层驱动
- CPU frequency/governor等底层配置

尤其禁止为了“优化性能”自行修改：

**NSS、ath11k、QCN9074、DTS和无线patch。**

如果编译过程中因源码变化出现底层配置失效，不要擅自换成另一项目的配置。

应先记录问题并说明原因。


# 三、A版：ZqinKing + LiBwrt

## 1. 基线

使用：

`ZqinKing/wrt_release`

选择项目当前为京东云雅典娜/IPQ60xx准备的：

`jdcloud_ipq60xx_libwrt`

路线。

保持ZqinKing当前LiBwrt配置和底层结构。


## 2. 建议保留的现有应用

以下应用原则上保留：

### 系统/管理

- Firewall
- Package Manager
- TTYD
- AutoReboot
- eMMC Health

### 网络

- Lucky
- UPnP
- WOL

### 存储

- DiskMan
- Samba4

### 雅典娜相关

如果当前配置已有：

- Athena LED

则保留。

同时保持项目原有USB存储相关基础驱动。


## 3. 建议删除的应用

删除：

- PassWall 1
- AdGuardHome
- MosDNS
- SmartDNS
- EasyTier
- OAF
- PBR
- SQM
- vlmcsd
- QuickStart
- Store
- iStoreX
- QuickFile

删除理由主要分为三类：

### DNS功能重复

删除：

- AdGuardHome
- MosDNS
- SmartDNS

本固件将使用OpenClash/PassWall2自己的代理及DNS体系。

避免形成复杂DNS链路。


### 代理/策略功能重复

删除：

- PassWall 1
- PBR

PassWall 1由PassWall2替代。

策略分流主要交给OpenClash/PassWall2。


### 当前无实际需求

删除：

- EasyTier
- OAF
- SQM
- vlmcsd
- QuickStart
- Store
- iStoreX
- QuickFile

其中SQM特别说明：

当前家庭宽带为1000Mbps，雅典娜主要使用NSS硬件加速。

暂不引入SQM/CAKE等额外流量整形变量。

如果以后实际确认存在严重Bufferbloat，再单独测试。


## 4. 需要新增

新增：

### OpenClash

作为日常主力透明代理。

### PassWall2

作为备用代理方案。

不要安装PassWall 1。

### Aurora

安装：

- Aurora Theme
- Aurora Config

如果ZqinKing当前LiBwrt配置已经包含，则不要重复添加。

### Docker

增加完整、可正常使用的Docker基础能力，包括项目当前源码体系对应的：

- Docker
- dockerd
- Docker必要内核依赖
- Docker网络依赖
- Docker存储依赖

Docker LuCI管理界面如果当前源码中存在成熟兼容版本可以加入，但不是强制项。

不要为了Docker自行修改NSS/Firewall核心配置。


# 四、B版：VIKINGYFY + ImmortalWrt

## 1. 基线

使用：

`VIKINGYFY/OpenWRT-CI`

源码继续使用：

`VIKINGYFY/immortalwrt`

选择作者当前IPQ60XX-WIFI-YES配置作为基线。

原则：

**尽可能保持作者当前公开发布固件的原始配置。**


## 2. 保留现有应用

保留：

### 系统

- Firewall
- Package Manager
- AutoReboot

### 网络

- FullCone NAT Sonic
- UPnP
- WOL Ultra

### 存储

- Mini Disk Manager
- Samba4
- Partexp

### UI

- Aurora Theme
- Aurora Config

尤其：

**FullCone NAT Sonic保留。**

不要为了精简修改作者当前IPQ60xx的NAT/NSS/Firewall相关配置。


## 3. 删除现有应用

删除：

### HomeProxy

原因：

已经增加OpenClash和PassWall2，第三套透明代理没有实际价值，并增加DNS、防火墙和透明代理冲突风险。

### GecoosAC

用户没有家庭上网行为管理/AC控制需求。

属于应用层功能，可以删除。

### NATMapT

用户将使用Lucky。

当前没有保留另一套NAT穿透管理工具的必要。


## 4. 新增

新增：

- OpenClash
- PassWall2
- Lucky
- TTYD
- Docker/dockerd及必要依赖

Aurora不要重复增加，因为VIKINGYFY当前配置已经包含Aurora Theme和Aurora Config。


# 五、代理体系最终原则

两版统一采用：

**OpenClash = 主力**

**PassWall2 = 备用**

两个都编译进入固件。

但是：

**禁止默认同时运行OpenClash和PassWall2。**

正常状态：

OpenClash运行
PassWall2停止

需要测试或OpenClash发生故障时：

OpenClash停止
PassWall2运行

不要同时让两套系统接管：

- TPROXY
- DNS
- nftables/iptables
- 透明代理
- TCP/UDP转发

不要加入：

- HomeProxy
- SSR Plus+
- PassWall 1

形成第三、第四套代理系统。


# 六、明确不要额外加入的软件

除非后续用户明确提出，否则不要新增：

- AdGuardHome
- MosDNS
- SmartDNS
- HomeProxy
- SSR Plus+
- PassWall 1
- SQM
- EasyTier
- OAF
- vlmcsd
- iStore/Store体系
- Attended Sysupgrade

尤其不要加入Attended Sysupgrade。

本项目以后升级方式固定为：

**GitHub Actions重新编译自己的固件 → 下载自己的sysupgrade → 手动升级。**

避免在线升级重新生成固件造成NSS、第三方feeds或自定义插件版本变化。


# 七、不要为了两版“一致”而修改底层

这是本项目非常重要的要求。

A版和B版不要求：

- 内核版本相同
- NSS配置完全相同
- Firewall实现完全相同
- FullCone实现相同
- ath11k patch完全相同
- 软件源完全相同

两版应该分别尊重：

**ZqinKing + LiBwrt**

和：

**VIKINGYFY + ImmortalWrt**

自己的技术路线。

我们只要求用户实际需要的主要应用尽量一致：

- OpenClash
- PassWall2
- Lucky
- TTYD
- Docker
- Aurora

不要为了实现表面一致，把一边的底层配置移植到另一边。


# 八、编译流程要求

不要直接修改后立即正式编译。

首先检查：

1. 当前仓库最新状态；
2. 当前对应雅典娜/IPQ60xx配置；
3. 当前源码分支；
4. 软件包是否仍然存在；
5. 第三方feeds兼容性；
6. OpenClash依赖；
7. PassWall2依赖；
8. Docker依赖；
9. 是否存在CONFIG冲突。

如果项目支持config preview/defconfig检查，应先执行。


## 编译前必须重点确认

确保：

- ath11k存在
- QCN9074 firmware存在
- 雅典娜RE-CS-02设备支持存在
- NSS相关配置没有因应用层精简而被删除
- USB存储驱动存在
- eMMC支持正常
- LuCI正常
- Firewall正常


# 九、编译顺序

优先制作：

## 第一版

**VIKINGYFY + VIKINGYFY/ImmortalWrt**

理由：

当前VIKINGYFY仍持续构建IPQ60XX-WIFI-YES，编译框架与自己最新源码匹配度最高。

只：

**删除 HomeProxy、GecoosAC、NATMapT**

增加：

**OpenClash、PassWall2、Lucky、TTYD、Docker**

其余尽量不动。


## 第二版

完成第一版后制作：

**ZqinKing + LiBwrt**

按照本方案进行应用层精简和新增。


# 十、第一轮刷机测试

两版都不要刷完立即开启所有服务。

首先保持：

**OpenClash关闭
PassWall2关闭
Docker关闭**

测试路由器纯净状态。


## 测试1：有线

检查：

- WAN拨号
- IPv4
- IPv6
- 千兆下载
- 千兆上传
- NSS硬件加速
- CPU负载


## 测试2：Wi-Fi 80MHz

检查：

- 手机
- AX201电脑
- 其他主要终端

连续测试稳定性。


## 测试3：Wi-Fi 160MHz

这是本项目最高优先级测试之一。

检查：

- 是否断流
- 手机是否出现“Wi-Fi已连接但无互联网”
- AX201速度
- 多设备同时连接
- 持续测速
- 长时间运行稳定性


## 测试4：OpenClash

纯网络稳定后：

开启OpenClash。

检查：

- 国内网站
- Google
- ChatGPT
- Gemini
- 日本节点
- AI日本分组
- DNS
- IPv6


## 测试5：PassWall2

停止OpenClash。

再开启PassWall2。

验证：

- TCP
- UDP
- DNS
- Sing-box/Xray
- 透明代理

确认无问题后再次关闭PassWall2，恢复OpenClash主用。


## 测试6：Docker

最后再启用Docker。

确认：

- dockerd正常
- bridge网络正常
- NSS/Firewall没有异常
- 内存占用正常


# 十一、最终选择标准

最终不是根据作者名选择，而是根据雅典娜实际表现。

优先级：

**① Wi-Fi稳定性，特别是160MHz**

↓

**② 长时间运行不掉线**

↓

**③ NSS和千兆性能**

↓

**④ OpenClash稳定性**

↓

**⑤ PassWall2稳定性**

↓

**⑥ Docker及其他插件**

如果：

VIKINGYFY稳定、LiBwrt断流：

优先长期使用VIKINGYFY。

如果：

LiBwrt稳定、VIKINGYFY断流：

优先长期使用ZqinKing + LiBwrt。

如果两边均稳定：

再比较：

- 无线速度
- CPU占用
- 内存占用
- NSS性能
- 插件维护便利性
- 后续升级难度

选择长期主力版本。


# 十二、Work执行要求

Work可以自主完成：

- 检查两个GitHub项目最新结构
- Fork/准备编译仓库
- 分析当前配置
- 调整应用层CONFIG
- 调整feeds
- 解决普通软件包依赖
- 配置GitHub Actions
- 执行编译
- 分析普通编译错误
- 修复应用层依赖问题
- 重新编译

但是：

如果需要修改以下任何内容，应暂停并说明原因，不要自行大改：

- NSS
- ath11k
- QCN9074
- DTS
- Kernel patch
- IPQ60xx核心驱动
- Firewall/NSS底层实现
- Ethernet/PHY驱动
- 无线校准数据相关内容

本项目的核心策略是：

> **作者负责底层，我们负责应用层。**

不要为了“优化”而重新设计作者已经验证的IPQ60xx底层方案。


# 十三、最终交付物

完成后需要提供：

1. VIKINGYFY版GitHub仓库；
2. ZqinKing-LiBwrt版GitHub仓库；
3. 两版GitHub Actions；
4. 两版成功编译记录；
5. Factory固件；
6. Sysupgrade固件；
7. Packages/Manifest；
8. 最终.config；
9. 与作者原版相比的修改清单；
10. 删除插件清单；
11. 新增插件清单；
12. 编译中出现的问题及处理记录；
13. 后续重新编译/升级操作说明。

不要只交付固件文件。

必须确保以后可以通过GitHub Actions重新构建相同配置。

---

## 最终一句话原则

**VIKINGYFY版坚持“VIKINGYFY框架 + VIKINGYFY源码”；ZqinKing版坚持“ZqinKing框架 + LiBwrt源码”。两边只做必要的应用层增删，绝不为了统一配置而交叉移植NSS、ath11k、内核和IPQ60xx底层配置。**
