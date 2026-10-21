#!/usr/bin/env bash
set -euo pipefail
task_root="${GITHUB_WORKSPACE:?}"
out="$task_root/artifacts"
mkdir -p "$out"
rm -f -- "$out/compile-exit.txt"
export CCACHE_MAXSIZE=1G
stage=${WRT_STAGE:-firmware}
case "$stage" in
    toolchain|firmware) ;;
    *) echo 'Unknown build stage.' >&2; exit 1 ;;
esac

snapshot() {
    date -Is
    df -h / "$PWD"
    for path in build_dir staging_dir .ccache dl bin; do
        [[ ! -d "$path" ]] || du -sh "$path"
    done
}
snapshot > "$out/compile-space-before.txt"
sha256sum .config > "$out/compile-config-before.sha256"
available_kib=$(df -Pk . | awk 'END {print $4}')
if ((available_kib < 20 * 1024 * 1024)); then
    echo 'Less than 20 GiB available before compilation; stop and retain diagnostics.' >&2
    exit 1
fi

# The pinned source implements AUTOREMOVE in include/package.mk and retains .pkgdir/stamps.
# Pass it to make only: do not change the resolved firmware .config.
# Stop at four hours to leave time for diagnostics rather than hitting the runner's six-hour limit.
# Each completed stage is transferred to the next job with the source tree and original stamps intact.
export WRT_STAGE="$stage"
# Variables are expanded by the child Bash, after timeout has established its process group.
# shellcheck disable=SC2016
setsid timeout --signal=TERM --kill-after=60s 240m bash -c '
    build_target() {
        make -j"$(nproc)" CONFIG_AUTOREMOVE=y "$@" || make -j1 V=s CONFIG_AUTOREMOVE=y "$@"
    }
    case "$WRT_STAGE" in
        toolchain)
            build_target tools/install && build_target toolchain/install && build_target target/compile ;;
        firmware)
            # Upstream include/image.mk iterates TARGET_DEVICES. Avoid generating
            # rootfs copies for every author-selected board; .config stays intact.
            build_target TARGET_DEVICES=jdcloud_re-cs-02 ;;
    esac
' &
compiler_pid=$!
monitor_pid=''
# Called by the EXIT trap.
# shellcheck disable=SC2329
stop_children() {
    [[ -z "$monitor_pid" ]] || kill "$monitor_pid" 2>/dev/null || true
    [[ -z "${compiler_pid:-}" ]] || kill -TERM -- "-$compiler_pid" 2>/dev/null || true
}
trap stop_children EXIT
(
    while kill -0 "$compiler_pid" 2>/dev/null; do
        build_available=$(df -Pk . | awk 'END {print $4}')
        root_available=$(df -Pk / | awk 'END {print $4}')
        printf '%s\tbuild_available_KiB=%s\troot_available_KiB=%s\n' \
            "$(date -Is)" "$build_available" "$root_available" >> "$out/compile-space.tsv"
        if ((build_available < 3 * 1024 * 1024 || root_available < 3 * 1024 * 1024)); then
            printf 'Stopped compiler with less than 3 GiB free to preserve runner logs and artifacts.\n' \
                | tee "$out/disk-stop.txt" >&2
            kill -TERM -- "-$compiler_pid" 2>/dev/null || true
            exit 0
        fi
        sleep 60
    done
) &
monitor_pid=$!
build_status=0
wait "$compiler_pid" || build_status=$?
compiler_pid=''
kill "$monitor_pid" 2>/dev/null || true
wait "$monitor_pid" 2>/dev/null || true
monitor_pid=''
snapshot > "$out/compile-space-after.txt"
sha256sum .config > "$out/compile-config-after.sha256"
if ! cmp -s "$out/compile-config-before.sha256" "$out/compile-config-after.sha256"; then
    echo 'Resolved firmware configuration changed during compilation.' >&2
    exit 1
fi
printf '%s\n' "$build_status" > "$out/compile-exit.txt"
exit "$build_status"
