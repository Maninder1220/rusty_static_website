#!/usr/bin/env bash

set -euo pipefail

PORT="8000"

echo "=================================================="
echo " Rust Static Server OS Dependency Installer"
echo " Supports: Ubuntu, Debian, CentOS, RHEL, Rocky, AlmaLinux"
echo "=================================================="

if [[ $EUID -eq 0 ]]; then
    echo "Please run this script as a normal user with sudo access, not directly as root."
    exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is not installed. Please install sudo or run commands manually as root."
    exit 1
fi

if [[ ! -f /etc/os-release ]]; then
    echo "Cannot detect OS. /etc/os-release not found."
    exit 1
fi

source /etc/os-release

OS_ID="${ID:-unknown}"
OS_LIKE="${ID_LIKE:-}"

echo "Detected OS: ${PRETTY_NAME:-$OS_ID}"
echo

install_rust() {
    echo "Checking Rust installation..."

    if command -v rustc >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1; then
        echo "Rust is already installed."
        rustc --version
        cargo --version
    else
        echo "Installing Rust using rustup..."
        curl https://sh.rustup.rs -sSf | sh -s -- -y

        # Load Rust environment for current shell
        # shellcheck disable=SC1090
        source "$HOME/.cargo/env"

        echo "Rust installed successfully."
        rustc --version
        cargo --version
    fi
}

install_ubuntu_deps() {
    echo "Installing dependencies for Ubuntu/Debian..."

    sudo apt update -y

    sudo apt install -y \
        curl \
        wget \
        git \
        tar \
        gzip \
        unzip \
        ca-certificates \
        gnupg \
        lsb-release \
        build-essential \
        pkg-config \
        libssl-dev \
        iproute2 \
        net-tools \
        lsof \
        ufw \
        docker.io \
        podman

    echo "Enabling Docker service..."

    sudo systemctl enable docker || true
    sudo systemctl start docker || true

    if [[ -n "${SUDO_USER:-}" ]]; then
        sudo usermod -aG docker "$USER" || true
        echo "User '$USER' added to docker group."
        echo "You may need to logout/login once for Docker group changes to apply."
    fi
}

install_rhel_deps() {
    echo "Installing dependencies for CentOS/RHEL/Rocky/AlmaLinux..."

    sudo dnf update -y

    sudo dnf install -y \
        curl \
        wget \
        git \
        tar \
        gzip \
        unzip \
        ca-certificates \
        gcc \
        gcc-c++ \
        make \
        openssl-devel \
        pkgconf-pkg-config \
        iproute \
        net-tools \
        lsof \
        firewalld \
        podman

    echo "Installing Development Tools group..."

    sudo dnf groupinstall -y "Development Tools" || true

    echo "Enabling firewalld..."

    sudo systemctl enable firewalld || true
    sudo systemctl start firewalld || true
}

configure_firewall() {
    echo
    echo "Configuring firewall for port ${PORT}/tcp..."

    if command -v ufw >/dev/null 2>&1; then
        echo "Ubuntu/Debian firewall detected: ufw"

        sudo ufw allow "${PORT}/tcp" || true

        echo "Port ${PORT}/tcp allowed in ufw."
        echo "Note: ufw may still be inactive. Check using: sudo ufw status"
    fi

    if command -v firewall-cmd >/dev/null 2>&1; then
        echo "RHEL/CentOS firewall detected: firewalld"

        sudo firewall-cmd --zone=public --add-port="${PORT}/tcp" --permanent || true
        sudo firewall-cmd --reload || true

        echo "Port ${PORT}/tcp allowed in firewalld."
    fi
}

verify_installation() {
    echo
    echo "=================================================="
    echo " Verification"
    echo "=================================================="

    echo
    echo "OS:"
    cat /etc/os-release | grep -E 'PRETTY_NAME|ID=' || true

    echo
    echo "Rust:"
    if [[ -f "$HOME/.cargo/env" ]]; then
        # shellcheck disable=SC1090
        source "$HOME/.cargo/env"
    fi

    rustc --version || echo "rustc not found"
    cargo --version || echo "cargo not found"

    echo
    echo "Git:"
    git --version || echo "git not found"

    echo
    echo "Container runtime:"
    docker --version || echo "docker not found"
    podman --version || echo "podman not found"

    echo
    echo "Firewall status:"
    if command -v ufw >/dev/null 2>&1; then
        sudo ufw status || true
    fi

    if command -v firewall-cmd >/dev/null 2>&1; then
        sudo firewall-cmd --list-ports || true
    fi

    echo
    echo "Port check command after running your server:"
    echo "  ss -lntp | grep ${PORT}"
}

main() {
    case "$OS_ID" in
        ubuntu|debian)
            install_ubuntu_deps
            ;;
        centos|rhel|rocky|almalinux|fedora)
            install_rhel_deps
            ;;
        *)
            if [[ "$OS_LIKE" == *"debian"* ]]; then
                install_ubuntu_deps
            elif [[ "$OS_LIKE" == *"rhel"* || "$OS_LIKE" == *"fedora"* ]]; then
                install_rhel_deps
            else
                echo "Unsupported OS: $OS_ID"
                echo "Please install dependencies manually."
                exit 1
            fi
            ;;
    esac

    install_rust
    configure_firewall
    verify_installation

    echo
    echo "=================================================="
    echo " Installation completed successfully."
    echo "=================================================="
    echo
    echo "Next steps:"
    echo "1. Restart your terminal or run:"
    echo "   source \$HOME/.cargo/env"
    echo
    echo "2. Go to your Rust project:"
    echo "   cd homepage/rust-static-server"
    echo
    echo "3. Test locally:"
    echo "   cargo run -- ../src"
    echo
    echo "4. Build release binary:"
    echo "   cargo build --release"
    echo
    echo "5. Run binary directly:"
    echo "   ./target/release/rust-static-server ../src"
    echo
    echo "6. Run container:"
    echo "   docker run --rm -p 8000:8000 rust-static-server:latest"
    echo "   or"
    echo "   podman run --rm -p 8000:8000 rust-static-server:latest"
}

main