import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { remoteNonInteractiveSshCommand } from "./remote-codex-connection"

const REMOTE_LIVE_DIFF_HELPER = String.raw`
initial_directory=$1
export LC_ALL=C GIT_PAGER=cat GIT_TERMINAL_PROMPT=0 GIT_OPTIONAL_LOCKS=0
temporary_directory=$(mktemp -d "${"$"}{TMPDIR:-/tmp}/tuiminal-live-diff.XXXXXX") || exit 70
output_file=$temporary_directory/output
error_file=$temporary_directory/error
paths_file=$temporary_directory/paths
scratch_file=$temporary_directory/scratch
trap 'rm -rf "$temporary_directory"' EXIT HUP INT TERM

decode_field() {
  printf '%b' "$1"
}

encode_file() {
  od -An -v -to1 "$1" | tr -d ' \n'
}

valid_root() {
  case "$1" in
    /*) return 0 ;;
    *) return 1 ;;
  esac
}

valid_path() {
  case "$1" in
    ''|/*|..|../*|*/..|*/../*) return 1 ;;
    *) return 0 ;;
  esac
}

while IFS='|' read -r request_id operation field_a field_b field_c field_d; do
  : > "$output_file"
  : > "$error_file"
  status=0
  output_limit=4194304

  case "$operation" in
    context)
      git --no-optional-locks -c core.fsmonitor=false -C "$initial_directory" \
        rev-parse --show-toplevel > "$scratch_file" 2> "$error_file"
      status=$?
      if [ "$status" -eq 0 ]; then
        root=$(sed -n '1p' "$scratch_file")
        if valid_root "$root" && cd "$root" 2> "$error_file"; then
          root=$(pwd -P)
          branch=$(git --no-optional-locks -c core.fsmonitor=false -C "$root" \
            symbolic-ref --short -q HEAD 2>/dev/null || true)
          if [ -z "$branch" ]; then
            hash=$(git --no-optional-locks -c core.fsmonitor=false -C "$root" \
              rev-parse --short HEAD 2>/dev/null || true)
            branch=HEAD
            if [ -n "$hash" ]; then branch=HEAD@$hash; fi
          fi
          git --no-optional-locks -c core.fsmonitor=false -C "$root" \
            status --porcelain=v1 -z --untracked-files=normal > "$paths_file" 2> "$error_file"
          status=$?
          if [ "$status" -eq 0 ]; then
            repository_state=clean
            if [ -s "$paths_file" ]; then repository_state=dirty; fi
            printf '%s\000%s\000%s' "$root" "$branch" "$repository_state" > "$output_file"
          fi
        else
          status=64
        fi
      fi
      ;;
    root)
      git --no-optional-locks -c core.fsmonitor=false -C "$initial_directory" \
        rev-parse --show-toplevel > "$scratch_file" 2> "$error_file"
      status=$?
      if [ "$status" -eq 0 ]; then
        root=$(sed -n '1p' "$scratch_file")
        if valid_root "$root" && cd "$root" 2> "$error_file"; then
          pwd -P > "$output_file"
          status=$?
        else
          status=64
        fi
      fi
      ;;
    worktrees)
      root=$(decode_field "$field_a")
      if valid_root "$root"; then
        git --no-optional-locks -c core.fsmonitor=false -C "$root" \
          worktree list --porcelain > "$output_file" 2> "$error_file"
        status=$?
      else
        status=64
      fi
      ;;
    status)
      root=$(decode_field "$field_a")
      if valid_root "$root"; then
        git --no-optional-locks -c core.fsmonitor=false -C "$root" \
          status --porcelain=v1 -z --untracked-files=all > "$output_file" 2> "$error_file"
        status=$?
      else
        status=64
      fi
      ;;
    head)
      root=$(decode_field "$field_a")
      if valid_root "$root"; then
        git --no-optional-locks -c core.fsmonitor=false -C "$root" \
          rev-parse --verify HEAD > "$output_file" 2> "$error_file"
        status=$?
      else
        status=64
      fi
      ;;
    name-status)
      root=$(decode_field "$field_a")
      if valid_root "$root"; then
        git --no-optional-locks -c core.fsmonitor=false -C "$root" diff \
          --name-status -z --find-renames --find-copies --find-copies-harder HEAD -- \
          > "$output_file" 2> "$error_file"
        status=$?
      else
        status=64
      fi
      ;;
    numstat)
      root=$(decode_field "$field_a")
      if valid_root "$root"; then
        git --no-optional-locks -c core.fsmonitor=false -C "$root" diff \
          --no-ext-diff --no-textconv --find-renames --find-copies --find-copies-harder \
          --numstat -z HEAD -- > "$output_file" 2> "$error_file"
        status=$?
      else
        status=64
      fi
      ;;
    file-info)
      root=$(decode_field "$field_a")
      decode_field "$field_b" > "$paths_file"
      if valid_root "$root"; then
        while IFS= read -r record || [ -n "$record" ]; do
          kind=$(printf '%.1s' "$record")
          path=${"$"}{record#?}
          if ! valid_path "$path"; then
            printf '%s\n' '-\t-\t-\t-\t-' >> "$output_file"
            continue
          fi
          absolute=$root/$path
          if [ ! -f "$absolute" ] || [ -L "$absolute" ]; then
            printf '%s\n' '-\t-\t-\t-\t-' >> "$output_file"
            continue
          fi
          size=$(wc -c < "$absolute" | tr -d ' ')
          mtime=$(stat -c %Y -- "$absolute" 2>/dev/null || stat -f %m "$absolute" 2>/dev/null || printf '%s' '-')
          hash=-
          lines=-
          binary=-
          if [ "$size" -le 1048576 ]; then
            hash=$(git --no-optional-locks -c core.fsmonitor=false -C "$root" \
              hash-object --no-filters -- "$path" 2>/dev/null || printf '%s' '-')
            if [ "$kind" = U ]; then
              text_size=$(tr -d '\000' < "$absolute" | wc -c | tr -d ' ')
              if [ "$text_size" = "$size" ]; then
                binary=0
                lines=$(awk 'END { print NR + 0 }' "$absolute")
              else
                binary=1
              fi
            fi
          fi
          printf '%s\t%s\t%s\t%s\t%s\n' "$size" "$mtime" "$hash" "$lines" "$binary" \
            >> "$output_file"
        done < "$paths_file"
      else
        status=64
      fi
      ;;
    patch)
      output_limit=1048576
      root=$(decode_field "$field_a")
      path=$(decode_field "$field_b")
      original=$(decode_field "$field_c")
      if valid_root "$root" && valid_path "$path" && { [ -z "$original" ] || valid_path "$original"; }; then
        if [ -n "$original" ]; then
          git --no-optional-locks -c core.fsmonitor=false -C "$root" diff \
            --no-ext-diff --no-textconv --no-color --find-renames --find-copies \
            --find-copies-harder --unified=3 HEAD -- "$original" "$path" \
            > "$output_file" 2> "$error_file"
        else
          git --no-optional-locks -c core.fsmonitor=false -C "$root" diff \
            --no-ext-diff --no-textconv --no-color --find-renames --find-copies \
            --find-copies-harder --unified=3 HEAD -- "$path" \
            > "$output_file" 2> "$error_file"
        fi
        status=$?
      else
        status=64
      fi
      ;;
    read-file)
      output_limit=1048576
      root=$(decode_field "$field_a")
      path=$(decode_field "$field_b")
      if valid_root "$root" && valid_path "$path"; then
        absolute=$root/$path
        if [ -f "$absolute" ] && [ ! -L "$absolute" ]; then
          size=$(wc -c < "$absolute" | tr -d ' ')
          if [ "$size" -le 1048576 ]; then
            command cat -- "$absolute" > "$output_file" 2> "$error_file"
            status=$?
          else
            status=75
          fi
        else
          status=66
        fi
      else
        status=64
      fi
      ;;
    *)
      status=64
      printf '%s' 'unknown operation' > "$error_file"
      ;;
  esac

  output_size=$(wc -c < "$output_file" | tr -d ' ')
  if [ "$output_size" -gt "$output_limit" ]; then
    status=75
    : > "$output_file"
    printf '%s' 'bounded output exceeded' > "$error_file"
  fi
  error_size=$(wc -c < "$error_file" | tr -d ' ')
  if [ "$error_size" -gt 262144 ]; then
    : > "$error_file"
    printf '%s' 'bounded error output exceeded' > "$error_file"
  fi
  printf 'TUIMINAL_LIVE_DIFF|%s|%s|' "$request_id" "$status"
  encode_file "$output_file"
  printf '|'
  encode_file "$error_file"
  printf '\n'
done
`

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function validateRemoteDirectory(value: string) {
  if (!value.startsWith("/") || value.length > 4_096 || /[\p{Cc}\p{Cf}]/u.test(value))
    throw new Error("O diretório remoto selecionado é inválido.")
}

export function remoteLiveDiffHelperCommand(workingDirectory: string) {
  validateRemoteDirectory(workingDirectory)
  return `exec sh -c ${shellQuote(REMOTE_LIVE_DIFF_HELPER)} tuiminal-live-diff ${shellQuote(workingDirectory)}`
}

export function remoteLiveDiffSshCommand(
  profile: TerminalRemoteCodexProfile,
  workingDirectory: string,
) {
  return remoteNonInteractiveSshCommand(profile, remoteLiveDiffHelperCommand(workingDirectory))
}

export function localRemoteLiveDiffHelperCommand(workingDirectory: string) {
  validateRemoteDirectory(workingDirectory)
  return ["sh", "-c", REMOTE_LIVE_DIFF_HELPER, "tuiminal-live-diff", workingDirectory]
}
