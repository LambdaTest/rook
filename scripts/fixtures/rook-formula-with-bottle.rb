# typed: false
# frozen_string_literal: true

# Fixture for scripts/test-formula-patch.sh — shaped like a post-release
# Formula/rook.rb that already carries a stale Homebrew bottle stanza from
# a previous version (i.e. the state update-formula.yml sees on every
# version bump after the first). Not the real formula; trimmed to just the
# lines the sed/python transform in .github/workflows/update-formula.yml
# actually touches, plus enough real structure (depends_on/install/test) to
# prove the strip regex doesn't eat anything past the stanza's `end`.
#
# The stale root_url below is in the `rook-<version>` shape the real
# generator emits (build-bottles.yml's Python transform), not a `v<version>`
# one — build-bottles.yml's stale-bottle-block guard greps for exactly that
# shape, so a fixture in any other format makes that guard's tests vacuous.

require "json"

class Rook < Formula
  desc "Agent assurance from the terminal"
  homepage "https://github.com/LambdaTest/rook"
  url "https://registry.npmjs.org/@testmuai/rook/-/rook-0.1.0.tgz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000" # patched by update-formula.yml (Task 9)
  license "Apache-2.0"
  version "0.1.0"

  bottle do
    root_url "https://github.com/LambdaTest/rook/releases/download/rook-0.1.0"
    sha256 cellar: :any_skip_relocation, arm64_sequoia: "1111111111111111111111111111111111111111111111111111111111111111"
    sha256 cellar: :any_skip_relocation, x86_64_linux: "2222222222222222222222222222222222222222222222222222222222222222"
  end

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/rook --version")
  end
end
