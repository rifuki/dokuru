#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

REPO="rifuki/dokuru"
BINARY_NAME="dokuru-deploy"
INSTALL_DIR="$HOME/.local/bin"

echo -e "${GREEN}🚀 Installing Dokuru Deploy CLI${NC}"
echo ""

# Check if ~/.local/bin exists, create if not
if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Creating $INSTALL_DIR${NC}"
    mkdir -p "$INSTALL_DIR"
fi

# Download binary
echo -e "${YELLOW}Downloading latest release...${NC}"
DOWNLOAD_URL="https://github.com/$REPO/releases/download/latest-deploy/$BINARY_NAME"

if command -v curl &> /dev/null; then
    curl -L -o "$INSTALL_DIR/$BINARY_NAME" "$DOWNLOAD_URL"
elif command -v wget &> /dev/null; then
    wget -O "$INSTALL_DIR/$BINARY_NAME" "$DOWNLOAD_URL"
else
    echo -e "${RED}Error: curl or wget is required${NC}"
    exit 1
fi

# Make executable
chmod +x "$INSTALL_DIR/$BINARY_NAME"

echo -e "${GREEN}✓ Installed to $INSTALL_DIR/$BINARY_NAME${NC}"
echo ""

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo -e "${YELLOW}⚠️  $INSTALL_DIR is not in your PATH${NC}"
    echo ""
    echo "Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo -e "${GREEN}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
    echo ""
    echo "Then reload your shell:"
    echo -e "${GREEN}source ~/.bashrc  # or ~/.zshrc${NC}"
else
    echo -e "${GREEN}✓ Ready to use!${NC}"
    echo ""
    echo "Run: ${GREEN}dokuru-deploy${NC}"
fi
