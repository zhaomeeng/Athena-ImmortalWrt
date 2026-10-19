#!/usr/bin/env bash
set -euo pipefail
task_root="${GITHUB_WORKSPACE:?}"
out="$task_root/artifacts"
mode=${1:?save or restore}
stage=${2:?toolchain}
[[ "$stage" == toolchain ]]
[[ "$(pwd -P)" == /mnt/build_wrt ]] || { echo 'Checkpoint requires /mnt/build_wrt.' >&2; exit 1; }

# Hash build inputs, not status documents or the runner's temporary build policy.
input_hash() {
    (
        cd "$task_root"
        sha256sum build.lock.tsv Config/*.txt Scripts/Packages.sh Scripts/Handles.sh \
            Scripts/Settings.sh Scripts/Athena-prepare.sh Scripts/Athena-config.sh \
            Scripts/Athena-sources.mjs Config/UPSTREAM-SOURCE.json
        if [[ -f sources/upstream.json ]]; then sha256sum sources/upstream.json; fi
        printf '%s\n' "$WRT_CONFIG" "$WRT_THEME" "$WRT_NAME" "$WRT_SSID" "$WRT_WORD" \
            "$WRT_IP" "$WRT_PW" "$WRT_REPO" "$WRT_BRANCH" "$WRT_SOURCE" "${WRT_PACKAGE:-}"
    ) | sha256sum | cut -d' ' -f1
}

case "$mode" in
    save)
        complete=true
        if [[ "$WRT_TEST" != true ]]; then
            status=$(cat "$out/compile-exit.txt")
            case "$status" in
                0) ;;
                124)
                    complete=false ;;
                *) echo 'Do not checkpoint a compiler failure.' >&2; exit 1 ;;
            esac
        fi
        dest="$task_root/checkpoint-upload"
        mkdir -p "$dest" .athena-evidence
        cp -a "$out/." .athena-evidence/
        input_hash > "$dest/inputs.sha256"
        sha256sum .config | cut -d' ' -f1 > "$dest/config.sha256"
        git rev-parse HEAD > "$dest/source.txt"
        printf '%s\n' "$stage" > "$dest/stage.txt"
        printf '%s\n' "$complete" > "$dest/complete.txt"
        printf '%s\n' "$WRT_TEST" > "$dest/preview.txt"
        printf '%s\n' "${GITHUB_RUN_ID:?}" > "$dest/run.txt"
        printf '%s\n' "$(uname -m)" > "$dest/arch.txt"
        du -sk . | awk '{print $1}' > "$dest/unpacked-KiB.txt"
        # Only non-secret author build metadata is passed into the next job.
        for key in WRT_DATE WRT_WIFI WRT_KVER WRT_LIST WRT_HASH; do
            printf '%s=%s\n' "$key" "${!key}"
        done > "$dest/build.env"
        # Public source checkouts have no authentication material. Fail without printing values.
        while IFS= read -r -d '' cfg; do
            if grep -Eiq '(extraheader|credential|https?://[^/[:space:]]+@)' "$cfg"; then
                echo 'Authentication configuration found in source checkout; stop checkpoint.' >&2
                exit 1
            fi
        done < <(find . -path '*/.git/config' -type f -print0)
        # A tar preserves symlinks, executable modes, mtimes, hidden build stamps and source Git metadata.
        # Signing material is generated in the final job and is not transferred.
        available=$(df -Pk . | awk 'END {print $4}')
        ((available > 3 * 1024 * 1024))
        (
            ulimit -f "$((available - 3 * 1024 * 1024))"
            tar --exclude='./key-build*' --use-compress-program='zstd -T2 -3' \
                -cf "$dest/tree.tar.zst" .
        )
        (cd "$dest"; sha256sum tree.tar.zst > SHA256SUMS)
        du -sh "$dest/tree.tar.zst" | tee "$out/checkpoint-size.txt"
        ;;
    restore)
        src="$task_root/checkpoint-download"
        [[ -z "$(ls -A .)" ]] || { echo 'Restore destination must be empty.' >&2; exit 1; }
        [[ "$(cat "$src/stage.txt")" == "$stage" ]]
        case "$(cat "$src/complete.txt")" in
            true) ;;
            false) [[ "$stage" == "${WRT_STAGE:?}" ]] ;;
            *) echo 'Invalid checkpoint completion state.' >&2; exit 1 ;;
        esac
        [[ "$(cat "$src/preview.txt")" == "$WRT_TEST" ]]
        [[ "$(cat "$src/run.txt")" == "${GITHUB_RUN_ID:?}" ]]
        [[ "$(cat "$src/arch.txt")" == "$(uname -m)" ]]
        [[ "$(cat "$src/inputs.sha256")" == "$(input_hash)" ]] || {
            echo 'Build inputs differ from checkpoint; stop.' >&2; exit 1;
        }
        expected_source=$(awk -F '\t' '$1=="source" {print $4}' "$task_root/build.lock.tsv")
        [[ "$(cat "$src/source.txt")" == "$expected_source" ]]
        (cd "$src"; sha256sum -c SHA256SUMS)
        available=$(df -Pk . | awk 'END {print $4}')
        unpacked=$(cat "$src/unpacked-KiB.txt")
        [[ "$unpacked" =~ ^[0-9]+$ ]]
        ((available > unpacked + 3 * 1024 * 1024)) || {
            echo 'Insufficient space to restore checkpoint and retain diagnostics.' >&2; exit 1;
        }
        tar --use-compress-program=zstd -xf "$src/tree.tar.zst"
        [[ "$(git rev-parse HEAD)" == "$expected_source" ]]
        [[ "$(sha256sum .config | cut -d' ' -f1)" == "$(cat "$src/config.sha256")" ]]
        [[ "$(sha256sum .config | cut -d' ' -f1)" == "$(sha256sum .athena-evidence/final.config | cut -d' ' -f1)" ]]
        [[ ! -s .athena-evidence/protected.diff ]]
        grep -qx 'PASS: protected baseline unchanged; required applications selected; exclusions satisfied.' \
            .athena-evidence/preflight.txt
        mkdir -p "$out"
        if [[ -f "$out/runner-space.txt" ]]; then
            mv -- "$out/runner-space.txt" "$out/runner-space-${WRT_STAGE:?}.txt"
        fi
        cp -a .athena-evidence/. "$out/"
        while IFS='=' read -r key value; do
            case "$key" in
                WRT_DATE|WRT_WIFI|WRT_KVER|WRT_LIST|WRT_HASH) printf '%s=%s\n' "$key" "$value" >> "$GITHUB_ENV" ;;
                *) echo 'Unexpected checkpoint environment key.' >&2; exit 1 ;;
            esac
        done < "$src/build.env"
        # Verify executable modes and package symlinks survived the archive.
        [[ -x files/etc/uci-defaults/99-athena-services && -x files/etc/openclash/core/clash_meta ]]
        [[ -L package/feeds/luci/luci-app-firewall && -f package/feeds/luci/luci-app-firewall/Makefile ]]
        printf 'PASS: %s checkpoint restored with matching source, inputs, config, modes and symlinks.\n' \
            "$stage" | tee "$out/checkpoint-restore-${WRT_STAGE:?}.txt"
        # Remove only the verified archive to reclaim space before compilation.
        rm -- "$src/tree.tar.zst"
        df -h / . | tee "$out/checkpoint-space-${WRT_STAGE}.txt"
        ;;
    *) echo 'Unknown checkpoint operation.' >&2; exit 1 ;;
esac
