#!/usr/bin/env bash
# The MCP servers keep orders in memory and are started fresh per call, so
# there is nothing to reset. Kept as the shape a real project would need:
# `reset` in the profile runs between scenarios, and setting it forces rook to
# run one scenario at a time.
exit 0
