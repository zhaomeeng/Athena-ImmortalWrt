#!/usr/bin/env bash
set -euo pipefail
task_root="${GITHUB_WORKSPACE:?}"
out="$task_root/artifacts"

# Resolve the author's unmodified selections in this same pinned source/feed tree.
cp .config "$out/baseline.input.config"
make defconfig
cp .config "$out/baseline.config"

# Replace keys rather than append duplicate assignments to Kconfig input.
while IFS= read -r line; do
    [[ "$line" == CONFIG_*=* ]] || continue
    key=${line%%=*}
    sed -i "/^${key}=/d; /^# ${key} is not set$/d" .config
    printf '%s\n' "$line" >> .config
done < "$task_root/Config/ATHENA-APPS.txt"
cp .config "$out/custom.input.config"
make defconfig
cp .config "$out/final.config"

# Normalize protected settings, including disabled symbols.
protected='^CONFIG_(TARGET|LINUX|NSS|ATH11K|IPQ|QCA|MAC80211|PACKAGE_(kmod-(qca|ath|usb|mmc|sdhci|nss)|ath11k-firmware|ipq-wifi|nss-|qca-ppe-qos|luci-app-qca-ppe-qos|firewall|fullconenat|luci-app-fullconenat|mmc-utils|cpufreq))'
normalize_protected() {
    sed -E 's/^# (CONFIG_[^ ]+) is not set$/\1=n/' "$1" | grep -E "$protected" | sort
}
normalize_protected "$out/baseline.config" > "$out/baseline.protected.config"
normalize_protected "$out/final.config" > "$out/final.protected.config"
diff -u "$out/baseline.protected.config" "$out/final.protected.config" > "$out/protected.diff" || {
    cat "$out/protected.diff"
    echo 'Protected configuration changed. Stop; do not alter PPE / NSS Wi-Fi / device baseline.' >&2
    exit 1
}
diff -u "$out/baseline.config" "$out/final.config" > "$out/application.diff" || true

required=(luci luci-app-firewall luci-app-package-manager luci-theme-aurora luci-app-aurora-config
    luci-app-fullconenat-sonic fullconenat-sonic luci-app-autoreboot luci-app-mini-diskmanager
    luci-app-samba4 luci-app-partexp luci-app-upnp luci-app-wolultra luci-app-openclash
    luci-app-passwall2 luci-i18n-passwall2-zh-cn xray-core sing-box
    chinadns-ng geoview v2ray-geoip v2ray-geosite
    luci-app-lucky luci-app-ttyd docker dockerd containerd runc
    dnsmasq-full kmod-dsa-qca8k qca-ppe-qos kmod-nss-wifi-drv
    kmod-ath11k kmod-ath11k-pci kmod-usb-storage mmc-utils)
for name in "${required[@]}"; do
    grep -qx "CONFIG_PACKAGE_$name=y" .config || { echo "Required package missing: $name" >&2; exit 1; }
done
grep -qx 'CONFIG_TARGET_DEVICE_qualcommax_ipq60xx_DEVICE_jdcloud_re-cs-02=y' .config
grep -Eq '^CONFIG_PACKAGE_ath11k-firmware-qcn9074-ddwrt=[ym]$' .config
grep -A15 '^define Device/jdcloud_re-cs-02$' target/linux/qualcommax/image/ipq60xx.mk | grep -q 'ath11k-firmware-qcn9074-ddwrt'
for key in Basic_Core_All Nftables_Transparent_Proxy; do
    grep -qx "CONFIG_PACKAGE_luci-app-passwall2_$key=y" .config || {
        echo "Required PassWall2 option missing: $key" >&2; exit 1;
    }
done
for key in Iptables_Transparent_Proxy INCLUDE_Shadowsocks_Rust_Client INCLUDE_Shadowsocks_Rust_Server; do
    if grep -Eq "^CONFIG_PACKAGE_luci-app-passwall2_$key=[ym]$" .config; then
        echo "Excluded PassWall2 option selected: $key" >&2; exit 1
    fi
done
for name in homeproxy gecoosac natmapt passwall ssr-plus nikki momo adguardhome mosdns smartdns sqm easytier oaf vlmcsd store istorex attendedsysupgrade; do
    if grep -Eq "^CONFIG_PACKAGE_luci-app-$name=[ym]$" .config; then
        echo "Excluded application selected: $name" >&2; exit 1
    fi
done
for name in rust sing-box-tiny shadowsocks-rust-sslocal shadowsocks-rust-ssserver \
    shadowsocks-rust-ssmanager shadowsocks-rust-ssservice shadowsocks-rust-ssurl; do
    if grep -Eq "^CONFIG_PACKAGE_$name=[ym]$" .config; then
        echo "Excluded proxy backend selected: $name" >&2; exit 1
    fi
done
grep -q '^Source-Makefile:' tmp/.packageinfo
gzip -c tmp/.packageinfo > "$out/packageinfo.gz"
awk '
    FNR==NR {
        if ($0 ~ /^CONFIG_.*=[ym]$/) {
            name=$0; sub(/^CONFIG_/, "", name); sub(/=[ym]$/, "", name); enabled[name]=1
            if (name ~ /^PACKAGE_/) {sub(/^PACKAGE_/, "", name); selected[name]=1}
        }
        next
    }
    function flush( i) {
        if (uses_rust) for (i=1; i<=count; i++)
            if (selected[names[i]]) print source "\t" names[i]
    }
    /^Source-Makefile:/ {flush(); source=$2; count=0; uses_rust=0}
    /^Package:/ {names[++count]=$2}
    /^Build-Depends(\/host)?:/ {
        for (j=2; j<=NF; j++) if ($j ~ /(^|:)rust\/host$/) {
            dep=$j
            if (dep=="rust/host") uses_rust=1
            else {
                sub(/:rust\/host$/, "", dep)
                if (dep ~ /^![A-Za-z0-9_-]+$/) {sub(/^!/, "", dep); if (!enabled[dep]) uses_rust=1}
                else if (dep ~ /^[A-Za-z0-9_-]+$/) {if (enabled[dep]) uses_rust=1}
                else {print "Unsupported Rust dependency condition: " dep > "/dev/stderr"; bad=1}
            }
        }
    }
    END {flush(); if (bad) exit 1}
' .config tmp/.packageinfo > "$out/selected-rust-consumers.txt"
if grep -Eq '^CONFIG_RUBY_ENABLE_YJIT=[ym]$' .config; then
    echo 'Optional Ruby YJIT must remain disabled.' >&2; exit 1
fi
[[ ! -s "$out/selected-rust-consumers.txt" ]] || {
    cat "$out/selected-rust-consumers.txt"; echo 'Selected package still depends on Rust host.' >&2; exit 1;
}
printf 'PASS: protected baseline unchanged; required applications selected; exclusions satisfied.\n' | tee "$out/preflight.txt"

# Preserve the exact Git revisions for feed reproduction and diagnostics.
for dir in feeds/*; do
    [[ ! -d "$dir/.git" ]] || printf '%s\t%s\n' "$dir" "$(git -C "$dir" rev-parse HEAD)"
done > "$out/feeds.actual.tsv"
git diff --stat > "$out/source-changes.txt"
