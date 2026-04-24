#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Dokuru Deploy Installer             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}✗ Cargo not found${NC}"
    echo -e "${YELLOW}Please install Rust first: https://rustup.rs/${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Cargo found${NC}"

# Build release binary
echo -e "${BLUE}Building dokuru-deploy...${NC}"
cargo build --release

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Build successful${NC}"

# Create ~/.local/bin if it doesn't exist
mkdir -p ~/.local/bin

# Copy binary
cp target/release/dokuru-deploy ~/.local/bin/

echo -e "${GREEN}✓ Installed to ~/.local/bin/dokuru-deploy${NC}"

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo ""
    echo -e "${YELLOW}⚠ ~/.local/bin is not in your PATH${NC}"
    echo -e "${YELLOW}Add this to your ~/.bashrc or ~/.zshrc:${NC}"
    echo -e "${BLUE}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
    echo ""
    echo -e "${YELLOW}Then run: source ~/.bashrc (or ~/.zshrc)${NC}"
else
    echo -e "${GREEN}✓ ~/.local/bin is in PATH${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Installation Complete! 🚀            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Usage:${NC}"
echo -e "  ${GREEN}dokuru-deploy${NC}              # Interactive mode"
echo -e "  ${GREEN}dokuru-deploy init${NC}         # Same as above"
echo -e "  ${GREEN}dokuru-deploy --help${NC}       # Show help"
echo ""
