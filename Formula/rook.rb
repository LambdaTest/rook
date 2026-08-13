# typed: false
# frozen_string_literal: true

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
    args = std_npm_args.reject { |arg| arg == "--build-from-source" }
    system "npm", "install", *args

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
    complete = lambda { binary.exist? && binary.size > 1_000_000 }

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
      if ENV["CI"] || ENV["HOMEBREW_BUILD_BOTTLE"]
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
    assert_predicate binary, :exist?, "bundled node binary missing"
    assert_predicate binary, :executable?, "bundled node binary not executable — install-time chmod missed"
    pin = JSON.parse((node_root/"package.json").read)["nodeRuntimeVersion"]
    refute_nil pin, "node package carries no nodeRuntimeVersion stamp"
    assert_equal "v#{pin}", shell_output("#{binary} --version").strip
  end
end
