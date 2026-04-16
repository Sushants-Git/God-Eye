#!/usr/bin/env zsh

autoload -Uz add-zsh-hook

typeset -g TERMINAL_SCOUT_ENDPOINT="${TERMINAL_SCOUT_ENDPOINT:-http://127.0.0.1:4321}"
typeset -g TERMINAL_SCOUT_LAST_COMMAND=""
typeset -g TERMINAL_SCOUT_SESSION_ID=""

terminal_scout_detect_session_id() {
  local terminal_name="${TERM_PROGRAM:-terminal}"
  local session_source="${ITERM_SESSION_ID:-${KITTY_WINDOW_ID:-${WT_SESSION:-${WINDOWID:-${TTY:-$$}}}}}"
  print -r -- "${terminal_name}:${session_source}"
}

terminal_scout_git_branch() {
  git rev-parse --abbrev-ref HEAD 2>/dev/null
}

terminal_scout_repo_root() {
  git rev-parse --show-toplevel 2>/dev/null
}

terminal_scout_post() {
  if ! command -v curl >/dev/null 2>&1; then
    return
  fi

  local event_type="$1"
  local command_text="$2"
  local repo_root
  local branch

  repo_root="$(terminal_scout_repo_root)"
  branch="$(terminal_scout_git_branch)"

  curl -fsS -X POST "${TERMINAL_SCOUT_ENDPOINT}/api/ingest" \
    --data-urlencode "sessionId=${TERMINAL_SCOUT_SESSION_ID}" \
    --data-urlencode "eventType=${event_type}" \
    --data-urlencode "cwd=${PWD}" \
    --data-urlencode "command=${command_text}" \
    --data-urlencode "title=${TERMINAL_TITLE:-${PWD:t}}" \
    --data-urlencode "terminalProgram=${TERM_PROGRAM:-terminal}" \
    --data-urlencode "tty=${TTY}" \
    --data-urlencode "shell=zsh" \
    --data-urlencode "hostname=$(hostname)" \
    --data-urlencode "pid=$$" \
    --data-urlencode "repoRoot=${repo_root}" \
    --data-urlencode "gitBranch=${branch}" \
    >/dev/null 2>&1 &
}

terminal_scout_preexec() {
  TERMINAL_SCOUT_LAST_COMMAND="$1"
  terminal_scout_post "command_start" "$1"
}

terminal_scout_precmd() {
  terminal_scout_post "prompt" "${TERMINAL_SCOUT_LAST_COMMAND}"
}

terminal_scout_chpwd() {
  terminal_scout_post "cwd_change" "${TERMINAL_SCOUT_LAST_COMMAND}"
}

terminal_scout_bootstrap() {
  TERMINAL_SCOUT_SESSION_ID="$(terminal_scout_detect_session_id)"
  terminal_scout_post "shell_start" ""
}

add-zsh-hook preexec terminal_scout_preexec
add-zsh-hook precmd terminal_scout_precmd
add-zsh-hook chpwd terminal_scout_chpwd
terminal_scout_bootstrap

