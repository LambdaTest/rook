# Load .env into the current shell. Source it, do not run it:
#
#   . scripts/env.sh [path-to-.env]      # default: ./.env
#
# Follows the desk's loader: the first assignment of a name wins, and a variable
# already set in the shell wins over the file.

_env_file="${1:-.env}"
if [ ! -f "$_env_file" ]; then
  echo "env.sh: no such file: $_env_file" >&2
  unset _env_file
  return 1 2>/dev/null || exit 1
fi

while IFS= read -r _line || [ -n "$_line" ]; do
  _line="${_line%$'\r'}"
  case "$_line" in ''|'#'*) continue ;; esac
  case "$_line" in *=*) ;; *) continue ;; esac
  _key="${_line%%=*}"
  _val="${_line#*=}"
  _key="${_key#export }"
  _key="${_key// /}"
  case "$_key" in ''|[0-9]*|*[!A-Za-z0-9_]*) continue ;; esac
  _val="${_val#\"}"; _val="${_val%\"}"; _val="${_val#\'}"; _val="${_val%\'}"
  printenv "$_key" >/dev/null 2>&1 && continue
  export "$_key=$_val"
done < "$_env_file"

unset _env_file _line _key _val
