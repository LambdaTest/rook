# typed: false
# frozen_string_literal: true

# Fixture for scripts/test-formula-patch.sh — shaped like the first-ever
# Formula/rook.rb (the real one on this branch): no Homebrew bottle stanza
# yet, because no bottle has been built. Verifies the strip regex is a
# true no-op here — it must not eat anything when there's nothing to strip.

require "json"

class Rook < Formula
  desc "Agent assurance from the terminal"
  homepage "https://github.com/LambdaTest/rook"
  url "https://registry.npmjs.org/@testmuai/rook/-/rook-0.1.0.tgz"
  sha256 "REPLACE_ON_FIRST_RELEASE" # patched by update-formula.yml (Task 9)
  license "Apache-2.0"
  version "0.1.0"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/rook --version")
  end
end
