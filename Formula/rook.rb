# typed: false
# frozen_string_literal: true

require "json"

class Rook < Formula
  desc "Agent assurance from the terminal"
  homepage "https://github.com/LambdaTest/rook"
  url "https://registry.npmjs.org/@testmuai/rook/-/rook-0.1.0.tgz"
  # KNOWN, DELIBERATE: brew style reports FormulaAudit/ComponentsOrder on the
  # version line below (it wants version before sha256). Do NOT reorder these
  # three lines, and do NOT run `brew style --fix` on them. The release
  # pipeline is anchored to this layout: build-bottles.yml inserts the bottle
  # block directly after the version line, and update-formula.yml patches
  # url/sha256/version with three start-of-line-anchored sed substitutions.
  # Reordering without re-deriving those anchors silently breaks bottle
  # publishing, and it does not even buy a clean run — the same cop then
  # reports on the bottle block's position instead. A scoped
  # `rubocop:disable` is not available either: Homebrew's own config enables
  # Style/DisableCopsWithinSourceCodeDirective over every formula ("Don't
  # allow cops to be disabled in casks and formulae"), so the directive is
  # itself an offense. The shipping lambdatest/homebrew-kane tap carries this
  # same offense on the same lines.
  sha256 "219a3dcd966948e9cc16fe39d2088e6b573def2097a664b7aafedccb1b6ad8ff" # patched by update-formula.yml (Task 9)
  license "Apache-2.0"
  version "0.1.0"

  bottle do
    root_url "https://github.com/LambdaTest/rook/releases/download/rook-0.1.0"
    sha256 cellar: :any_skip_relocation, arm64_sonoma: "da12326abeabefb7b371da49a9ac8611fc2c976632ef1e542448ea2e7438ee7f"
    sha256 cellar: :any_skip_relocation, x86_64_linux: "a8a22dae199e78a68daa8a619a1210e881009675fb5400c292bf092d836190e3"
  end

  # node/npm are only used inside `def install` below, which never runs on
  # a bottle pour — only when building from source. `:build` keeps a
  # bottle install from also pulling in Homebrew's own Node, since rook
  # ships and runs on its own bundled runtime (see caveats below).
  depends_on "node" => :build

  def install
    # `.reject` drops --build-from-source, which brew injects unconditionally
    # (Library/Homebrew/language/node.rb) and which would force a node-gyp
    # compile instead of using the prebuilt — same as homebrew-kane does.
    # Kept inline rather than via a local: FormulaAudit/StdNpmArgs matches on
    # the `system` call's own source text, so hoisting it into `args` reads as
    # "npm install without std_npm_args" to the cop and flags a false positive
    # that cannot be suppressed in a formula (Homebrew forbids
    # `# rubocop:disable` under **/Formula/**/*.rb).
    system "npm", "install", *std_npm_args.reject { |arg| arg == "--build-from-source" }

    node_pkg =
      if OS.mac?
        Hardware::CPU.arm? ? "@testmuai/rook-node-darwin-arm64" : "@testmuai/rook-node-darwin-x64"
      elsif OS.linux? && Hardware::CPU.intel?
        "@testmuai/rook-node-linux-x64"
      elsif OS.linux? && Hardware::CPU.arm?
        "@testmuai/rook-node-linux-arm64"
      end
    odie "rook does not ship a bundled Node runtime for this platform." if node_pkg.nil?

    pkg_dir = libexec/"lib/node_modules/@testmuai/rook"
    node_pkg_version = JSON.parse((pkg_dir/"package.json").read)
                           .dig("optionalDependencies", node_pkg)
    if node_pkg_version.nil?
      odie "#{node_pkg} is not in the meta's optionalDependencies — " \
           "this formula requires a node-bundled rook release."
    end

    binary = pkg_dir/"node_modules/#{node_pkg}/bin/node"
    complete = -> { binary.exist? && binary.size > 1_000_000 }

    cd pkg_dir do
      [0, 15, 45].each do |backoff|
        sleep backoff if backoff.positive?
        quiet_system "npm", "install", "--no-save",
                     "--ignore-scripts", "--audit=false", "--fund=false",
                     "--loglevel=error", "--prefer-online",
                     "--cache=#{HOMEBREW_CACHE}/npm_cache",
                     "#{node_pkg}@#{node_pkg_version}"
        break if complete.call
      end
    end

    if complete.call
      chmod 0755, binary
    else
      msg = "#{node_pkg}@#{node_pkg_version} did not install a usable bundled Node runtime"
      # ENV.build_bottle? is Homebrew's real API for this (there is no
      # HOMEBREW_BUILD_BOTTLE environment variable — zero hits in the
      # Homebrew source). ENV["CI"] still covers CI, which Homebrew does
      # not clear; build_bottle? is what makes a maintainer's local
      # `brew install --build-bottle` hard-fail here too, rather than
      # silently degrading to the opoo path and bottling a node-less tree.
      if ENV["CI"] || ENV.build_bottle?
        odie msg
      else
        opoo "#{msg}. rook is installed but will fall back to system Node — " \
             "re-run `brew reinstall rook` later."
      end
    end

    bin.install_symlink libexec.glob("bin/*")
  end

  def caveats
    <<~EOS
      rook runs on its own bundled Node runtime; the `node` dependency is
      only used at install time (npm).
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/rook --version")
    node_pkg =
      if OS.mac?
        Hardware::CPU.arm? ? "@testmuai/rook-node-darwin-arm64" : "@testmuai/rook-node-darwin-x64"
      elsif OS.linux? && Hardware::CPU.intel?
        "@testmuai/rook-node-linux-x64"
      elsif OS.linux? && Hardware::CPU.arm?
        "@testmuai/rook-node-linux-arm64"
      end
    node_root = libexec/"lib/node_modules/@testmuai/rook/node_modules/#{node_pkg}"
    binary = node_root/"bin/node"
    assert_path_exists binary, "bundled node binary missing"
    assert_predicate binary, :executable?, "bundled node binary not executable — install-time chmod missed"
    pin = JSON.parse((node_root/"package.json").read)["nodeRuntimeVersion"]
    refute_nil pin, "node package carries no nodeRuntimeVersion stamp"
    assert_equal "v#{pin}", shell_output("#{binary} --version").strip
  end
end
