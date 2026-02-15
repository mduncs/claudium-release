#!/bin/bash
# Captures session UUID - uses pane title if set, else window:pane_index

input=$(cat)
session_id=$(echo "$input" | jq -r '.session_id')

if [[ -n "$TMUX" ]]; then
  pane_title=$(tmux display-message -p '#{pane_title}')
  window=$(tmux display-message -p '#W')
  pane_idx=$(tmux display-message -p '#P')
  hostname_short=$(hostname -s)

  # prefer pane title if explicitly set (not default hostname)
  if [[ -n "$pane_title" && "$pane_title" != "$hostname_short" && "$pane_title" != "bash" && "$pane_title" != "zsh" ]]; then
    key="title:${pane_title}"
  else
    key="${window}:${pane_idx}"
  fi

  mkdir -p ~/.claude/pane-sessions
  echo "$session_id" > ~/.claude/pane-sessions/"$key"
fi

exit 0
