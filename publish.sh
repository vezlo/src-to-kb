#!/bin/bash

# NPM Publishing Script for src-to-kb
# This script helps publish the package to npm

echo "🚀 Preparing to publish @vezlo/src-to-kb to npm"
echo "================================================"

# Check if logged in to npm
echo "📝 Checking npm login status..."
npm whoami &> /dev/null
if [ $? -ne 0 ]; then
    echo "❌ Not logged in to npm. Please login first:"
    echo "   Run: npm login"
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📦 Current version: $CURRENT_VERSION"

# Run tests
echo "🧪 Running tests..."
npm test
if [ $? -ne 0 ]; then
    echo "❌ Tests failed. Please fix before publishing."
    exit 1
fi

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo "⚠️  Warning: You have uncommitted changes"
    read -p "Do you want to continue? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Ask for version bump type
echo ""
echo "Choose version bump type:"
echo "1) Patch (bug fixes) - $CURRENT_VERSION -> X.X.+1"
echo "2) Minor (new features) - $CURRENT_VERSION -> X.+1.0"
echo "3) Major (breaking changes) - $CURRENT_VERSION -> +1.0.0"
echo "4) Custom version"
echo "5) Skip version bump"
read -p "Enter choice (1-5): " VERSION_CHOICE

case $VERSION_CHOICE in
    1)
        npm version patch
        ;;
    2)
        npm version minor
        ;;
    3)
        npm version major
        ;;
    4)
        read -p "Enter new version: " NEW_VERSION
        npm version $NEW_VERSION
        ;;
    5)
        echo "Skipping version bump"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "📦 Publishing version: $NEW_VERSION"

# Dry run first
echo ""
echo "📋 Performing dry run..."
npm publish --dry-run

echo ""
read -p "✅ Dry run complete. Proceed with actual publish? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Publishing cancelled"
    exit 1
fi

# Actual publish
echo "🚀 Publishing to npm..."
npm publish --access public

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully published @vezlo/src-to-kb@$NEW_VERSION"
    echo ""
    echo "📝 Post-publish checklist:"
    echo "   [ ] Commit and push version changes to git"
    echo "   [ ] Create a GitHub release for v$NEW_VERSION"
    echo "   [ ] Update documentation if needed"
    echo ""
    echo "Install with: npm install -g @vezlo/src-to-kb"
else
    echo "❌ Publishing failed"
    exit 1
fi