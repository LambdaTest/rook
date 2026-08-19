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
    sha256 cellar: :any_skip_relocation, arm64_sonoma: "e0143425a734b4e3323e9af26f136be89c7f035e0e550541efb5b7beeb8aeef1"
    sha256 cellar: :any_skip_relocation, x86_64_linux: "4ed3ed6746a947786b2b7deb3cb21a058ab1eb8b062e49de617fad0ef1349d51"
  end

  # :build, safely this time. node/npm are only invoked inside `def
  # install` below. A previous attempt at this same scoping (reverted —
  # see git history) broke real installs: the npm-published launcher's
  # `#!/usr/bin/env node` shebang only gets rewritten to a working
  # absolute node path by Homebrew's own Cleaner#rewrite_shebangs when
  # `node` is a *required* dependency, and without that rewrite `env
  # node` has nothing to resolve on a machine with no system Node. `def
  # install` below now installs its own `#!/bin/sh` launcher instead of
  # that npm shim in the success path, so nothing in the installed tree
  # has a node-shebang left for Homebrew to rewrite (or fail to) — see
  # the comment there.
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

      # Replace npm's installed launcher (a symlink to the published
      # package's bin/rook.cjs — a JS trampoline whose `#!/usr/bin/env
      # node` shebang needs *some* node just to bootstrap, before it
      # re-execs into this same bundled binary anyway) with a plain shell
      # script that execs the bundled binary directly. `exec` replaces
      # the shell's own process image, so signals land on the bundled
      # node process natively — no manual SIGINT/SIGTERM/SIGHUP relay
      # needed, unlike the JS trampoline's spawn()-based approach, which
      # forwards signals to a genuine child process specifically because
      # it doesn't have this option.
      #
      # Absolute paths baked into an installed script are ordinary,
      # relocatable Homebrew practice (any formula that writes a wrapper
      # referencing `#{libexec}` does the same) — not something specific
      # to this fix.
      #
      # Deliberately only in this success branch: the opoo fallback below
      # bottles a tree with no working bundled binary, where npm's
      # original trampoline — which falls back to whatever system Node
      # is present — is exactly the right behavior, not this.
      entry = pkg_dir/"dist/cli.js"
      launcher = libexec/"bin/rook"
      launcher.unlink if launcher.exist? || launcher.symlink?
      launcher.write <<~SH
        #!/bin/sh
        exec "#{binary}" "#{entry}" "$@"
      SH
      chmod 0755, launcher
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

    # The keg's own identity record, read by `rook update`'s provenance
    # detection at the fixed position this formula's layout dictates
    # (`<keg>/libexec/lib/node_modules/@testmuai/rook` is the package root,
    # so the marker sits five levels above it). Homebrew's own
    # INSTALL_RECEIPT.json cannot serve this purpose: it carries no
    # formula-name field, and for an API-loaded formula `source.path` is the
    # shared formula.jws.json cache — so without this file, "is this keg
    # rook's?" is only answerable by inferring from the Cellar path, which
    # the reader refuses to do. Written unconditionally (the opoo fallback
    # above still installs rook, and the keg is rook's either way), and
    # deliberately containing no absolute paths: bottles are poured into
    # whatever prefix the host uses, and `:any_skip_relocation` means
    # nothing would rewrite one.
    (prefix/"rook-keg-marker.json").write JSON.generate(
      { v: 1, formula: "rook", version: version.to_s },
    ) + "\n"

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

    # Structural guard on the actual mechanism, not just its outcome: the
    # `rook --version` call above already proves the launcher works, but
    # not that it's independent of Homebrew's own `node`. A regression
    # here (e.g. `bin.install_symlink` picking up npm's original
    # `env node`-shebang trampoline again) would only surface on a
    # machine with no system Node — this catches it on every machine.
    shebang = (libexec/"bin/rook").readlines.first.to_s
    refute_match(/node/, shebang, "launcher shells out through node again")

    # The keg marker `rook update` identifies this keg by — asserted on
    # contents, not just presence, so a change that breaks its shape fails
    # here (and in brew-smoke, which calls `brew test`) rather than in
    # every installed copy's provenance detection.
    marker = JSON.parse((prefix/"rook-keg-marker.json").read)
    assert_equal 1, marker["v"], "keg marker v drifted"
    assert_equal "rook", marker["formula"], "keg marker names the wrong formula"
    assert_equal version.to_s, marker["version"], "keg marker version disagrees with the keg"
  end
end
